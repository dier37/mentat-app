import path from "node:path";
import { writeFile } from "node:fs/promises";
import { contentVersion, type BrainFile } from "./file";
import { PathError, resolveInRoot } from "./paths";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ANSWER = 256 * 1024;

export class OutputConflictError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = "OutputConflictError";
  }
}

export interface SaveInput {
  slug: string;
  question: string;
  answer: string;
  read?: string[];
  equivalentUsd?: number | null;
  durationMs?: number | null;
  turns?: number | null;
}

function outputsPathFromSlug(slug: unknown): string {
  if (typeof slug !== "string" || !SLUG.test(slug)) {
    throw new PathError("Slug must be lowercase words separated by hyphens");
  }
  if (slug === "readme") throw new PathError("Slug is reserved");
  return `outputs/${slug}.md`;
}

/** Resolve the write target inside outputs/, the only folder this module can reach. */
export async function resolveOutput(root: string, slug: string): Promise<string> {
  const relPath = outputsPathFromSlug(slug);
  const outputsRoot = await resolveInRoot(root, "outputs");
  return path.join(outputsRoot, path.basename(relPath));
}

/** Markdown files the query actually opened, as wikilinks. Grep and Glob patterns are not links. */
function sourceLinks(read: string[] | undefined): string[] {
  const links: string[] = [];
  for (const target of read ?? []) {
    if (!target.endsWith(".md") || target.includes("*") || target.startsWith("/")) continue;
    if (target.startsWith("outputs/")) continue;
    const name = path.basename(target, ".md");
    if (name.startsWith("_") || links.includes(name)) continue;
    links.push(name);
  }
  return links;
}

function provenance(input: SaveInput): string {
  const parts = ["Asked in the mentat-app query pane"];
  if (typeof input.turns === "number") parts.push(`${input.turns} turn${input.turns === 1 ? "" : "s"}`);
  if (typeof input.durationMs === "number") parts.push(`${(input.durationMs / 1000).toFixed(1)}s`);
  if (typeof input.equivalentUsd === "number") parts.push(`~$${input.equivalentUsd.toFixed(4)} at API rates`);
  return parts.join(" · ");
}

export async function saveAnswer(root: string, input: SaveInput, now = new Date()): Promise<BrainFile> {
  const relPath = outputsPathFromSlug(input.slug);
  if (typeof input.question !== "string" || !input.question.trim()) throw new PathError("Question is required");
  if (typeof input.answer !== "string" || !input.answer.trim()) throw new PathError("Answer is required");
  if (input.answer.length > MAX_ANSWER) throw new PathError("Answer is too large to file");
  const question = input.question.trim().replace(/\s+/g, " ");

  const absolutePath = await resolveOutput(root, input.slug);
  const links = sourceLinks(input.read);
  const sources = links.length ? links.map((name) => `[[${name}]]`).join(", ") : "none recorded";
  const header = `# ${question.replace(/[?？]+$/, "")}\n\n> ${question}\n\nUpdated: ${now.toISOString().slice(0, 10)} · Sources: ${sources}\n`;
  const content = `${header}\n${input.answer.trim()}\n\n---\n\n${provenance(input)}\n`;

  await writeFile(absolutePath, content, { encoding: "utf8", flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new OutputConflictError(`outputs/${input.slug}.md already exists`);
    throw error;
  });
  return { path: relPath, content, mtime: new Date().toISOString(), version: contentVersion(content) };
}
