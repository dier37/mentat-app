import { useEffect, useMemo, useRef, useState } from "react";
import { searchFiles } from "../api";
import type { SearchResult, TreeNode } from "../types";
import { fuzzyMatch } from "./FileTree";

interface PaletteResult {
  key: string;
  path: string;
  label: string;
  context?: string;
  kind: "file" | "content";
}

function flattenFiles(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) => node.type === "file" ? [node] : flattenFiles(node.children ?? []));
}

interface SearchPaletteProps {
  open: boolean;
  tree: TreeNode[];
  onClose: () => void;
  onNavigate: (path: string) => void;
}

export function SearchPalette({ open, tree, onClose, onNavigate }: SearchPaletteProps) {
  const [query, setQuery] = useState("");
  const [content, setContent] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const files = useMemo(() => flattenFiles(tree), [tree]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setContent([]);
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open || !query.trim()) { setContent([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchFiles(query.trim())
        .then((results) => { if (!cancelled) setContent(results); })
        .catch(() => { if (!cancelled) setContent([]); });
    }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, query]);

  const results = useMemo<PaletteResult[]>(() => {
    if (!query.trim()) return [];
    const filenameResults = files.filter((file) => fuzzyMatch(file.name, query.trim())).slice(0, 30).map((file) => ({ key: `file:${file.path}`, path: file.path, label: file.name.replace(/\.md$/, ""), context: file.path, kind: "file" as const }));
    const contentResults = content.map((result, index) => ({ key: `content:${result.path}:${result.line}:${index}`, path: result.path, label: result.text.trim() || `Line ${result.line}`, context: `${result.path} · line ${result.line}`, kind: "content" as const }));
    return [...filenameResults, ...contentResults];
  }, [content, files, query]);

  useEffect(() => { setActive((value) => Math.max(0, Math.min(value, Math.max(results.length - 1, 0)))); }, [results.length]);
  if (!open) return null;

  const choose = (result?: PaletteResult) => {
    if (!result) return;
    onNavigate(result.path);
    onClose();
  };

  return (
    <div className="palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="search-palette" role="dialog" aria-modal="true" aria-label="Search the brain">
        <label htmlFor="global-search">Search</label>
        <input
          ref={inputRef}
          id="global-search"
          type="search"
          value={query}
          placeholder="Filename or content"
          onChange={(event) => { setQuery(event.target.value); setActive(0); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => results.length ? Math.min(value + 1, results.length - 1) : 0); }
            if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); }
            if (event.key === "Enter") { event.preventDefault(); choose(results[active]); }
          }}
        />
        <div className="palette-results" role="listbox" aria-label="Search results">
          {results.map((result, index) => (
            <button key={result.key} type="button" role="option" aria-selected={index === active} className={index === active ? "is-active" : ""} onMouseEnter={() => setActive(index)} onClick={() => choose(result)}>
              <span className="result-kind">{result.kind}</span>
              <span className="result-label">{result.label}</span>
              {result.context && <span className="result-context">{result.context}</span>}
            </button>
          ))}
          {query.trim() && results.length === 0 && <p>Nothing matches yet.</p>}
        </div>
      </section>
    </div>
  );
}
