import path from "node:path";
import { readdir } from "node:fs/promises";
import { PathError, resolveInRoot, toPosixRelative } from "./paths";

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
}

const EXCLUDED = new Set([".git", "node_modules"]);

async function walk(root: string, absoluteDirectory: string): Promise<TreeNode[]> {
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const nodes: TreeNode[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (EXCLUDED.has(entry.name)) continue;
    const relPath = toPosixRelative(root, path.join(absoluteDirectory, entry.name));
    let guarded: string;
    try {
      guarded = await resolveInRoot(root, relPath);
    } catch (error) {
      if (error instanceof PathError) continue;
      throw error;
    }

    if (entry.isDirectory()) {
      nodes.push({ name: entry.name, path: relPath, type: "folder", children: await walk(root, guarded) });
    } else if (entry.isFile()) {
      nodes.push({ name: entry.name, path: relPath, type: "file" });
    }
  }
  return nodes;
}

export async function getTree(root: string, relPath = "."): Promise<TreeNode[]> {
  const absoluteRoot = await resolveInRoot(root, ".");
  const directory = await resolveInRoot(root, relPath);
  return walk(absoluteRoot, directory);
}

export async function listMarkdownFiles(root: string, relPath = "."): Promise<string[]> {
  const nodes = await getTree(root, relPath);
  const files: string[] = [];
  const collect = (items: TreeNode[]) => {
    for (const item of items) {
      if (item.type === "folder") collect(item.children ?? []);
      else if (item.path.endsWith(".md")) files.push(item.path);
    }
  };
  collect(nodes);
  return files;
}
