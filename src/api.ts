import type { BrainFile, LinkResult, TreeNode } from "./types";

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json() as T | { error: string };
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body ? body.error : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

export const getTree = () => request<TreeNode[]>("/api/tree");
export const getFile = (path: string) => request<BrainFile>(`/api/file?path=${encodeURIComponent(path)}`);
export const getLinks = (path: string) => request<LinkResult>(`/api/links?path=${encodeURIComponent(path)}`);
