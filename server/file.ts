import { readFile, stat } from "node:fs/promises";
import { resolveInRoot } from "./paths";

export interface BrainFile {
  path: string;
  content: string;
  mtime: string;
}

export async function getFile(root: string, relPath: string): Promise<BrainFile> {
  const absolutePath = await resolveInRoot(root, relPath);
  const [content, metadata] = await Promise.all([
    readFile(absolutePath, "utf8"),
    stat(absolutePath),
  ]);
  if (!metadata.isFile()) throw new Error("Path is not a file");
  return { path: relPath.split("\\").join("/"), content, mtime: metadata.mtime.toISOString() };
}
