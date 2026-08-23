import { rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { getFile } from "../server/file";
import { getLinks } from "../server/links";
import { searchFiles } from "../server/search";
import { getTree } from "../server/tree";
import { createBrainFixture } from "./fixture";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("server modules", () => {
  it("returns a tree without excluded directories", async () => {
    const root = await createBrainFixture(); roots.push(root);
    const tree = await getTree(root);
    expect(tree.map((node) => node.name)).not.toContain(".git");
    expect(tree.map((node) => node.name)).not.toContain(".claude");
    expect(tree.map((node) => node.name)).not.toContain(".gitignore");
    expect(tree.map((node) => node.name)).not.toContain("node_modules");
  });

  it("reads files, searches Markdown, and resolves wikilinks", async () => {
    const root = await createBrainFixture(); roots.push(root);
    await expect(getFile(root, "CLAUDE.md")).resolves.toMatchObject({ path: "CLAUDE.md" });
    await expect(searchFiles(root, "alpha")).resolves.toContainEqual({ path: "CLAUDE.md", line: 3, text: "See [[alpha]] and [[missing]]." });
    const links = await getLinks(root, "CLAUDE.md");
    expect(links.outbound).toEqual([
      { target: "alpha", candidates: ["wiki/concepts/alpha.md"], resolved: true, ambiguous: false },
      { target: "missing", candidates: [], resolved: false, ambiguous: false },
    ]);
    expect(links.unresolved).toEqual(["missing"]);
  });

  it("finds inbound links", async () => {
    const root = await createBrainFixture(); roots.push(root);
    await expect(getLinks(root, "projects/second-brain.md")).resolves.toMatchObject({ inbound: ["wiki/concepts/alpha.md"] });
  });

  it.each([
    ["tree", (root: string) => getTree(root, "../")],
    ["search", (root: string) => searchFiles(root, "x", "../")],
    ["links", (root: string) => getLinks(root, "../outside.md")],
  ])("%s routes paths through the guard", async (_name, operation) => {
    const root = await createBrainFixture(); roots.push(root);
    await expect(operation(root)).rejects.toMatchObject({ status: 400 });
  });
});
