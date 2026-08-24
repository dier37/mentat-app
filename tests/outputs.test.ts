import path from "node:path";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OutputConflictError, resolveOutput, saveAnswer } from "../server/outputs";
import { PathError } from "../server/paths";
import { createBrainFixture } from "./fixture";

let root: string;

beforeEach(async () => { root = await createBrainFixture(); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

const base = { question: "Should I renew the Talo lease?", answer: "Not yet — the CCM transition lands first." };

describe("the outputs write guard", () => {
  it.each([
    "../chat/test-thread",
    "../../etc/passwd",
    "chat/test-thread",
    "wiki/concepts/alpha",
    "Talo-Lease",
    "talo_lease",
    "-talo",
    "talo--lease",
    "",
    "readme",
    ".",
  ])("refuses the slug %j", async (slug) => {
    await expect(saveAnswer(root, { ...base, slug })).rejects.toThrow(PathError);
  });

  it("refuses a slug that is not a string", async () => {
    await expect(saveAnswer(root, { ...base, slug: 1 as unknown as string })).rejects.toThrow(PathError);
  });

  it("resolves only inside outputs/", async () => {
    const resolved = await resolveOutput(root, "talo-lease");
    expect(path.dirname(resolved)).toBe(path.join(await import("node:fs/promises").then((fs) => fs.realpath(root)), "outputs"));
  });

  it("writes nothing outside outputs/ when a slug is refused", async () => {
    const before = await readdir(path.join(root, "chat"));
    await expect(saveAnswer(root, { ...base, slug: "../chat/evil" })).rejects.toThrow();
    expect(await readdir(path.join(root, "chat"))).toEqual(before);
  });
});

describe("saving an answer", () => {
  it("writes the brain's file shape with sources and provenance", async () => {
    const saved = await saveAnswer(root, {
      ...base,
      slug: "talo-lease",
      read: ["wiki/concepts/housing.md", "wiki/concepts/housing.md", "/talo/", "wiki/sources/_template.md", "**/*.md"],
      equivalentUsd: 0.4231,
      durationMs: 18400,
      turns: 9,
    }, new Date("2026-08-24T12:00:00Z"));

    expect(saved.path).toBe("outputs/talo-lease.md");
    const written = await readFile(path.join(root, "outputs", "talo-lease.md"), "utf8");
    expect(written).toBe(saved.content);
    expect(written).toBe(
      "# Should I renew the Talo lease\n\n" +
      "> Should I renew the Talo lease?\n\n" +
      "Updated: 2026-08-24 · Sources: [[housing]]\n\n" +
      "Not yet — the CCM transition lands first.\n\n" +
      "---\n\n" +
      "Asked in the mentat-app query pane · 9 turns · 18.4s · ~$0.4231 at API rates\n");
  });

  it("never files an output as its own source", async () => {
    const saved = await saveAnswer(root, { ...base, slug: "self-source", read: ["outputs/self-source.md", "wiki/concepts/alpha.md"] });
    expect(saved.content).toContain("Sources: [[alpha]]");
    expect(saved.content).not.toContain("[[self-source]]");
  });

  it("records no sources when the query only grepped", async () => {
    const saved = await saveAnswer(root, { ...base, slug: "no-reads", read: ["/ski/", "**/*.md"] });
    expect(saved.content).toContain("Sources: none recorded");
  });

  it("refuses to overwrite an existing output", async () => {
    await writeFile(path.join(root, "outputs", "talo-lease.md"), "mine");
    await expect(saveAnswer(root, { ...base, slug: "talo-lease" })).rejects.toThrow(OutputConflictError);
    expect(await readFile(path.join(root, "outputs", "talo-lease.md"), "utf8")).toBe("mine");
  });

  it.each([
    ["an empty question", { question: "   " }],
    ["an empty answer", { answer: "" }],
    ["an oversized answer", { answer: "x".repeat(256 * 1024 + 1) }],
  ])("refuses %s", async (_label, override) => {
    await expect(saveAnswer(root, { ...base, ...override, slug: "bad-input" })).rejects.toThrow(PathError);
    await expect(readFile(path.join(root, "outputs", "bad-input.md"), "utf8")).rejects.toThrow();
  });
});
