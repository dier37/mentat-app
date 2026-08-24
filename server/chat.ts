import path from "node:path";
import { writeFile } from "node:fs/promises";
import { contentVersion, getFile, type BrainFile } from "./file";
import { PathError, resolveInRoot } from "./paths";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AWAITING = new Set(["claude", "chatgpt", "nobody"]);

export class ChatConflictError extends Error {
  readonly status = 409;
  constructor(message: string, readonly current?: BrainFile) {
    super(message);
    this.name = "ChatConflictError";
  }
}

export interface ReplyInput { thread: string; body: string; awaiting: string; version: string }
export interface ThreadInput { slug: string; title: string; summary: string; body: string; awaiting: string }

function chatPathFromThread(thread: string): string {
  const match = thread.match(/^chat\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/);
  if (!match || !SLUG.test(match[1])) throw new PathError("Thread must be chat/<slug>.md");
  return thread;
}

export async function resolveChatThread(root: string, thread: string, existing: boolean): Promise<string> {
  const relPath = chatPathFromThread(thread);
  if (existing) return resolveInRoot(root, relPath);
  const chatRoot = await resolveInRoot(root, "chat");
  return path.join(chatRoot, path.basename(relPath));
}

function routedBody(body: string, awaiting: string): { body: string; awaiting: "claude" | "chatgpt" | "nobody" } {
  if (typeof body !== "string" || !body.trim()) throw new PathError("Reply body is required");
  if (!AWAITING.has(awaiting)) throw new PathError("Invalid awaiting value");
  const thufir = /(^|\s)#thufir\b/i.test(body);
  const teg = /(^|\s)#teg\b/i.test(body);
  if (thufir && teg) throw new PathError("A reply can pass the turn to only one agent");
  const derived = thufir ? "claude" : teg ? "chatgpt" : "nobody";
  if (awaiting !== derived) throw new PathError("Awaiting does not match the reply tag");
  const stripped = body.replace(/(^|\s)#(?:thufir|teg)\b/gi, "$1").trim();
  if (!stripped) throw new PathError("Reply body is required after removing the tag");
  return { body: stripped, awaiting: derived };
}

function utcMinute(date = new Date()): string {
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)} UTC`;
}

function setAwaiting(content: string, awaiting: string): string {
  const updated = content.replace(/^(Status:\s*[^\n·]+·\s*Awaiting:\s*)[^\n·]+/m, `$1${awaiting} `);
  if (updated === content) throw new PathError("Thread has no valid Status/Awaiting header");
  return updated;
}

export async function replyToThread(root: string, input: ReplyInput, now = new Date()): Promise<BrainFile> {
  const relPath = chatPathFromThread(input.thread);
  const absolutePath = await resolveChatThread(root, relPath, true);
  const current = await getFile(root, relPath);
  if (typeof input.version !== "string" || input.version !== current.version) {
    throw new ChatConflictError("Thread changed since it was loaded", current);
  }
  const routed = routedBody(input.body, input.awaiting);
  const withTurn = setAwaiting(current.content, routed.awaiting);
  const content = `${withTurn.trimEnd()}\n\n## ${utcMinute(now)} — germano\n\n${routed.body}\n`;
  await writeFile(absolutePath, content, "utf8");
  return { ...current, content, mtime: new Date().toISOString(), version: contentVersion(content) };
}

export async function createThread(root: string, input: ThreadInput, now = new Date()): Promise<BrainFile> {
  if (typeof input.slug !== "string" || !SLUG.test(input.slug)) throw new PathError("Slug must be lowercase words separated by hyphens");
  if (typeof input.title !== "string" || !input.title.trim()) throw new PathError("Title is required");
  if (typeof input.summary !== "string" || !input.summary.trim() || /[\r\n]/.test(input.summary.trim())) throw new PathError("A one-line summary is required");
  const routed = routedBody(input.body, input.awaiting);
  const relPath = `chat/${input.slug}.md`;
  const absolutePath = await resolveChatThread(root, relPath, false);
  try {
    await resolveInRoot(root, relPath);
    throw new ChatConflictError("A thread with this slug already exists");
  } catch (error) {
    if (!(error instanceof PathError) || error.status !== 404) throw error;
  }
  const timestamp = utcMinute(now);
  const content = `# ${input.title.trim()}\n\n> ${input.summary.trim()}\n\nStatus: open · Awaiting: ${routed.awaiting} · Started: ${timestamp.slice(0, 10)}\n\n## ${timestamp} — germano\n\n${routed.body}\n`;
  await writeFile(absolutePath, content, { encoding: "utf8", flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new ChatConflictError("A thread with this slug already exists");
    throw error;
  });
  return { path: relPath, content, mtime: new Date().toISOString(), version: contentVersion(content) };
}
