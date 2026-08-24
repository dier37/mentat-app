import type { BrainFile, LinkResult, SearchResult, TreeNode } from "./types";

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json() as T | { error: string };
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body ? body.error : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

export class ApiError<T = unknown> extends Error {
  constructor(readonly status: number, message: string, readonly payload?: T) {
    super(message);
    this.name = "ApiError";
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new ApiError(response.status, payload.error ?? `Request failed (${response.status})`, payload);
  return payload;
}

export const getTree = () => request<TreeNode[]>("/api/tree");
export const getFile = (path: string) => request<BrainFile>(`/api/file?path=${encodeURIComponent(path)}`);
export const getLinks = (path: string) => request<LinkResult>(`/api/links?path=${encodeURIComponent(path)}`);
export const searchFiles = (query: string) => request<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`);
export const replyToThread = (input: { thread: string; body: string; awaiting: "claude" | "chatgpt" | "nobody"; version: string }) => post<BrainFile>("/api/chat/reply", input);
export const createThread = (input: { slug: string; title: string; summary: string; body: string; awaiting: "claude" | "chatgpt" | "nobody" }) => post<BrainFile>("/api/chat/thread", input);
export const keepQueryAnswer = (input: { slug: string; question: string; answer: string; read: string[]; equivalentUsd: number | null; durationMs: number | null; turns: number | null }) => post<BrainFile>("/api/query/keep", input);
