import path from "node:path";
import { realpath, stat } from "node:fs/promises";

const EXCLUDED_SEGMENTS = new Set(["node_modules"]);

export class PathError extends Error {
  constructor(message: string, readonly status: 400 | 404 = 400) {
    super(message);
    this.name = "PathError";
  }
}

function isContained(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function validateRelativePath(relPath: string): void {
  if (typeof relPath !== "string" || relPath.trim().length === 0) {
    throw new PathError("Path is required");
  }
  if (relPath.includes("\0")) throw new PathError("Path contains a null byte");
  if (path.isAbsolute(relPath) || path.win32.isAbsolute(relPath)) {
    throw new PathError("Absolute paths are not allowed");
  }

  const segments = relPath.split(/[\\/]+/);
  if (segments.includes("..")) throw new PathError("Path traversal is not allowed");
  if (segments.some((segment) => (segment.startsWith(".") && segment !== ".") || EXCLUDED_SEGMENTS.has(segment))) {
    throw new PathError("Path is excluded");
  }
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function resolveInRoot(root: string, relPath: string): Promise<string> {
  validateRelativePath(relPath);

  const canonicalRoot = await realpath(path.resolve(root));
  const resolved = path.resolve(canonicalRoot, relPath);
  if (!isContained(canonicalRoot, resolved)) throw new PathError("Path leaves the data root");
  if (!(await exists(resolved))) throw new PathError("Path not found", 404);

  const canonicalTarget = await realpath(resolved);
  if (!isContained(canonicalRoot, canonicalTarget)) {
    throw new PathError("Symlink leaves the data root");
  }
  return canonicalTarget;
}

export function toPosixRelative(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}
