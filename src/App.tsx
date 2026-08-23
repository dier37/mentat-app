import { useCallback, useEffect, useState } from "react";
import { getFile, getLinks, getTree } from "./api";
import { FileTree } from "./components/FileTree";
import { Reader } from "./components/Reader";
import type { BrainFile, ChangeEvent, LinkResult, TreeNode } from "./types";

const INITIAL_FILE = "CLAUDE.md";

export default function App() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState(INITIAL_FILE);
  const [file, setFile] = useState<BrainFile>();
  const [links, setLinks] = useState<LinkResult>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

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
  useEffect(() => {
    const events = new EventSource("/api/events");
    events.onmessage = (message) => {
      const change = JSON.parse(message.data) as ChangeEvent;
      void loadTree();
      if (change.path === selectedPath) void loadDocument(selectedPath);
    };
    return () => events.close();
  }, [loadDocument, loadTree, selectedPath]);

  return (
    <div className="app-shell">
      <FileTree nodes={tree} selectedPath={selectedPath} onSelect={setSelectedPath} />
      <div className="gutter-placeholder" aria-hidden="true" />
      <Reader file={file} links={links} loading={loading} error={error} onNavigate={setSelectedPath} />
      <aside className="context-rail" aria-label="Document context">
        <div className="rail-heading"><span>Context</span><span>{links?.outbound.length ?? 0}</span></div>
        <p>Links and backlinks arrive in the next pass.</p>
      </aside>
    </div>
  );
}
