import { useMemo, useState } from "react";
import type { TreeNode } from "../types";

interface FileTreeProps {
  nodes: TreeNode[];
  selectedPath: string;
  onSelect: (path: string) => void;
}

export function fuzzyMatch(value: string, query: string): boolean {
  let cursor = 0;
  const candidate = value.toLocaleLowerCase();
  for (const character of query.toLocaleLowerCase()) {
    cursor = candidate.indexOf(character, cursor);
    if (cursor < 0) return false;
    cursor += 1;
  }
  return true;
}

function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes;
  return nodes.flatMap((node) => {
    if (node.type === "file") return fuzzyMatch(node.name, query) ? [node] : [];
    const children = filterTree(node.children ?? [], query);
    return children.length > 0 || fuzzyMatch(node.name, query) ? [{ ...node, children }] : [];
  });
}

function Branch({ node, selectedPath, onSelect, forceOpen }: { node: TreeNode; selectedPath: string; onSelect: (path: string) => void; forceOpen: boolean }) {
  const [open, setOpen] = useState(true);
  if (node.type === "folder") {
    const expanded = forceOpen || open;
    return (
      <li className={node.path === "raw" ? "tree-branch raw-branch" : "tree-branch"}>
        <button className="tree-folder" type="button" aria-expanded={expanded} onClick={() => setOpen((value) => !value)}>
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>{node.name}/
        </button>
        {expanded && <ul>{(node.children ?? []).map((child) => <Branch key={child.path} node={child} selectedPath={selectedPath} onSelect={onSelect} forceOpen={forceOpen} />)}</ul>}
      </li>
    );
  }
  return (
    <li>
      <button className={`tree-file${selectedPath === node.path ? " is-current" : ""}`} type="button" onClick={() => onSelect(node.path)}>
        {node.name.replace(/\.md$/, "")}
      </button>
    </li>
  );
}

export function FileTree({ nodes, selectedPath, onSelect }: FileTreeProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterTree(nodes, query.trim()), [nodes, query]);
  return (
    <nav className="tree" aria-label="Knowledge files">
      <div className="rail-heading"><span>Files</span><span>{nodes.length}</span></div>
      <label className="filter-label" htmlFor="tree-filter">Filter files</label>
      <input id="tree-filter" className="tree-filter" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find by name" />
      <ul className="tree-root">{filtered.map((node) => <Branch key={node.path} node={node} selectedPath={selectedPath} onSelect={onSelect} forceOpen={Boolean(query.trim())} />)}</ul>
    </nav>
  );
}
