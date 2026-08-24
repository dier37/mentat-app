import { useCallback, useEffect, useRef, useState } from "react";
import { getFile, getLinks, getTree } from "./api";
import { FileTree } from "./components/FileTree";
import { ContextRail } from "./components/ContextRail";
import { Gutter } from "./components/Gutter";
import { ChatThreadRail, ChatView } from "./components/ChatView";
import { NewThreadComposer } from "./components/ChatComposer";
import { Reader } from "./components/Reader";
import { SearchPalette } from "./components/SearchPalette";
import type { BrainFile, ChangeEvent, GutterMark, LinkResult, TreeNode } from "./types";
import { parseChatThread, type ChatThread } from "./chat";

const INITIAL_FILE = "CLAUDE.md";

function pathFromLocation(): string {
  return new URLSearchParams(window.location.search).get("path") ?? INITIAL_FILE;
}

function directChatPaths(nodes: TreeNode[]): string[] {
  const chat = nodes.find((node) => node.type === "folder" && node.path === "chat");
  return (chat?.children ?? []).filter((node) => node.type === "file" && node.name !== "README.md").map((node) => node.path);
}

export default function App() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState(pathFromLocation);
  const [file, setFile] = useState<BrainFile>();
  const [links, setLinks] = useState<LinkResult>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [marks, setMarks] = useState<GutterMark[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [treeOpen, setTreeOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const selectedPathRef = useRef(selectedPath);

  const loadTree = useCallback(async () => {
    const nextTree = await getTree();
    setTree(nextTree);
    const threadFiles = await Promise.all(directChatPaths(nextTree).map((path) => getFile(path)));
    setChatThreads(threadFiles.map((thread) => parseChatThread(thread.path, thread.content)));
  }, []);
  const navigate = useCallback((path: string) => {
    if (selectedPathRef.current === path) return;
    const url = new URL(window.location.href);
    url.searchParams.set("path", path);
    window.history.pushState({}, "", url);
    selectedPathRef.current = path;
    setLoading(true);
    setSelectedPath(path);
    setTreeOpen(false);
    setContextOpen(false);
  }, []);
  const loadDocument = useCallback(async (path: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const [nextFile, nextLinks] = await Promise.all([getFile(path), getLinks(path)]);
      setFile(nextFile);
      setLinks(nextLinks);
    } catch (reason) {
      setError(`Could not read ${path}: ${reason instanceof Error ? reason.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadTree().catch((reason) => setError(`Could not load files: ${String(reason)}`)); }, [loadTree]);
  useEffect(() => { void loadDocument(selectedPath); }, [loadDocument, selectedPath]);
  useEffect(() => { selectedPathRef.current = selectedPath; }, [selectedPath]);
  useEffect(() => {
    const handlePopState = () => {
      const path = pathFromLocation();
      selectedPathRef.current = path;
      setLoading(true);
      setSelectedPath(path);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("live") === "0") return;
    const events = new EventSource("/api/events");
    events.onmessage = (message) => {
      const change = JSON.parse(message.data) as ChangeEvent;
      void loadTree();
      if (change.path === selectedPathRef.current) void loadDocument(selectedPathRef.current);
    };
    return () => events.close();
  }, [loadDocument, loadTree]);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const updateMarks = useCallback((nextMarks: GutterMark[]) => setMarks(nextMarks), []);
  const highlightLinks = useCallback((indexes: number[], active: boolean) => {
    document.querySelectorAll<HTMLElement>("[data-wikilink-index]").forEach((element) => {
      if (indexes.includes(Number(element.dataset.wikilinkIndex))) element.classList.toggle("is-gutter-active", active);
    });
  }, []);
  const acceptChatFile = useCallback((updated: BrainFile) => {
    setFile(updated);
    setLoading(false);
    void getLinks(updated.path).then(setLinks);
    void loadTree();
  }, [loadTree]);
  const isChat = selectedPath.startsWith("chat/") && selectedPath.split("/").length === 2 && selectedPath !== "chat/README.md";

  return (
    <div className={`app-shell${treeOpen ? " tree-open" : ""}${contextOpen ? " context-open" : ""}`}>
      <div className="mobile-toolbar">
        <button type="button" aria-expanded={treeOpen} onClick={() => { setTreeOpen((value) => !value); setContextOpen(false); }}>Files</button>
        <span>{selectedPath}</span>
        <button type="button" aria-expanded={contextOpen} onClick={() => { setContextOpen((value) => !value); setTreeOpen(false); }}>{isChat ? "Threads" : "Context"}</button>
      </div>
      <FileTree nodes={tree} selectedPath={selectedPath} onSelect={navigate} />
      <Gutter marks={isChat ? [] : marks} onNavigate={navigate} onHighlight={highlightLinks} />
      {isChat && file && !loading && !error
        ? <ChatView file={file} onUpdated={acceptChatFile} />
        : <Reader file={file} links={links} loading={loading} error={error} onNavigate={navigate} onMarks={updateMarks} />}
      {isChat ? <ChatThreadRail threads={chatThreads} selectedPath={selectedPath} onNavigate={navigate} onNewThread={() => setNewThreadOpen(true)} /> : <ContextRail links={links} onNavigate={navigate} />}
      <SearchPalette open={searchOpen} tree={tree} onClose={() => setSearchOpen(false)} onNavigate={navigate} />
      <NewThreadComposer open={newThreadOpen} onClose={() => setNewThreadOpen(false)} onCreated={(created) => { acceptChatFile(created); navigate(created.path); }} />
    </div>
  );
}
