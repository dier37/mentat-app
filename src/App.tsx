import { useCallback, useEffect, useRef, useState } from "react";
import { getFile, getLinks, getTree } from "./api";
import { FileTree } from "./components/FileTree";
import { ContextRail } from "./components/ContextRail";
import { Gutter } from "./components/Gutter";
import { Reader } from "./components/Reader";
import { SearchPalette } from "./components/SearchPalette";
import type { BrainFile, ChangeEvent, GutterMark, LinkResult, TreeNode } from "./types";

const INITIAL_FILE = "CLAUDE.md";

export default function App() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState(INITIAL_FILE);
  const [file, setFile] = useState<BrainFile>();
  const [links, setLinks] = useState<LinkResult>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [marks, setMarks] = useState<GutterMark[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const selectedPathRef = useRef(selectedPath);

  const loadTree = useCallback(async () => setTree(await getTree()), []);
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

  return (
    <div className="app-shell">
      <FileTree nodes={tree} selectedPath={selectedPath} onSelect={setSelectedPath} />
      <Gutter marks={marks} onNavigate={setSelectedPath} onHighlight={highlightLinks} />
      <Reader file={file} links={links} loading={loading} error={error} onNavigate={setSelectedPath} onMarks={updateMarks} />
      <ContextRail links={links} onNavigate={setSelectedPath} />
      <SearchPalette open={searchOpen} tree={tree} onClose={() => setSearchOpen(false)} onNavigate={setSelectedPath} />
    </div>
  );
}
