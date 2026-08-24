import path from "node:path";
import { getFile } from "./file";
import { resolveInRoot } from "./paths";
import { listMarkdownFiles } from "./tree";
import { extractWikilinks } from "../wikilinks";

export interface OutboundLink {
  target: string;
  candidates: string[];
  resolved: boolean;
  ambiguous: boolean;
}

export interface LinkResult {
  outbound: OutboundLink[];
  inbound: string[];
  unresolved: string[];
}

function targets(content: string): string[] {
  return extractWikilinks(content).map((link) => link.target);
}

export async function getLinks(root: string, relPath: string): Promise<LinkResult> {
  await resolveInRoot(root, relPath);
  const files = await listMarkdownFiles(root);
  const byBasename = new Map<string, string[]>();
  for (const file of files) {
    const basename = path.posix.basename(file, ".md");
    byBasename.set(basename, [...(byBasename.get(basename) ?? []), file]);
  }

  const source = await getFile(root, relPath);
  const outbound = targets(source.content).map((target) => {
    const candidates = byBasename.get(target) ?? [];
    return { target, candidates, resolved: candidates.length > 0, ambiguous: candidates.length > 1 };
  });
  const thisBasename = path.posix.basename(relPath, ".md");
  const inbound: string[] = [];
  for (const file of files) {
    if (file === relPath) continue;
    if (targets((await getFile(root, file)).content).includes(thisBasename)) inbound.push(file);
  }
  return {
    outbound,
    inbound,
    unresolved: [...new Set(outbound.filter((link) => !link.resolved).map((link) => link.target))],
  };
}
