import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolveInRoot } from "./paths";

export interface BrainFile {
  path: string;
  content: string;
  mtime: string;
  version: string;
}

export function contentVersion(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function getFile(root: string, relPath: string): Promise<BrainFile> {
  const absolutePath = await resolveInRoot(root, relPath);
  const [content, metadata] = await Promise.all([
    readFile(absolutePath, "utf8"),
    stat(absolutePath),
  ]);
  if (!metadata.isFile()) throw new Error("Path is not a file");
  return { path: relPath.split("\\").join("/"), content, mtime: metadata.mtime.toISOString(), version: contentVersion(content) };
}
