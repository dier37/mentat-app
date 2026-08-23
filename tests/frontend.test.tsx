import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Reader } from "../src/components/Reader";
import { fuzzyMatch } from "../src/components/FileTree";
import type { BrainFile, LinkResult } from "../src/types";

const file: BrainFile = {
  path: "MEMORY.md",
  content: "# Memory\n\n> A standfirst.\n\nSee [[second-brain]] and [[not-written]]. `[[literal]]`\n",
  mtime: "2026-08-23T00:00:00.000Z",
};

const links: LinkResult = {
  outbound: [
    { target: "second-brain", candidates: ["projects/second-brain.md"], resolved: true, ambiguous: false },
    { target: "not-written", candidates: [], resolved: false, ambiguous: false },
  ],
  inbound: [],
  unresolved: ["not-written"],
};

describe("Phase 2 frontend", () => {
  it("matches filenames by ordered fuzzy characters", () => {
    expect(fuzzyMatch("source-conflict-handling.md", "sch")).toBe(true);
    expect(fuzzyMatch("MEMORY.md", "mry")).toBe(true);
    expect(fuzzyMatch("MEMORY.md", "yrm")).toBe(false);
  });

  it("renders resolved and unresolved wikilinks without transforming code", () => {
    const markup = renderToStaticMarkup(<Reader file={file} links={links} loading={false} onNavigate={() => undefined} />);
    expect(markup).toContain('class="wikilink resolved"');
    expect(markup).toContain('href="#projects/second-brain.md"');
    expect(markup).toContain('class="wikilink unresolved"');
    expect(markup).toContain('title="Not written yet"');
    expect(markup).toContain("<code>[[literal]]</code>");
    expect(markup).not.toContain('href="#not-written"');
  });
});
