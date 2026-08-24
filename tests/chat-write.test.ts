import path from "node:path";
import { readFile, rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatConflictError, createThread, replyToThread } from "../server/chat";
import { getFile } from "../server/file";
import { PathError } from "../server/paths";
import { createBrainFixture } from "./fixture";

let root: string;

beforeEach(async () => { root = await createBrainFixture(); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("chat write boundary", () => {
  it("appends a server-timestamped reply, changes Awaiting, and strips the routing tag", async () => {
    const before = await getFile(root, "chat/test-thread.md");
    const updated = await replyToThread(root, {
      thread: "chat/test-thread.md",
      body: "Please review this. #thufir",
      awaiting: "claude",
      version: before.version,
    }, new Date("2026-08-24T15:16:30Z"));

    expect(updated.content).toContain("Status: open · Awaiting: claude · Started: 2026-08-23");
    expect(updated.content).toContain("## 2026-08-24 15:16 UTC — germano\n\nPlease review this.");
    expect(updated.content).not.toContain("#thufir");
  });

  it("returns a conflict with current content and writes nothing for a stale version", async () => {
    const before = await readFile(path.join(root, "chat", "test-thread.md"), "utf8");
    await expect(replyToThread(root, {
      thread: "chat/test-thread.md", body: "Late draft", awaiting: "nobody", version: "stale",
    })).rejects.toBeInstanceOf(ChatConflictError);
    await expect(readFile(path.join(root, "chat", "test-thread.md"), "utf8")).resolves.toBe(before);
  });

  it.each(["../CLAUDE.md", "meta/onboarding-chatgpt.md", "README.md"])("rejects %s before writing", async (thread) => {
    await expect(replyToThread(root, { thread, body: "attack", awaiting: "nobody", version: "x" })).rejects.toBeInstanceOf(PathError);
  });

  it("creates the standard thread format and refuses collisions without changing the file", async () => {
    const created = await createThread(root, {
      slug: "new-ruling", title: "New Ruling", summary: "A narrow decision.", body: "Please inspect. #teg", awaiting: "chatgpt",
    }, new Date("2026-08-24T16:20:00Z"));
    expect(created.content).toContain("> A narrow decision.");
    expect(created.content).toContain("Status: open · Awaiting: chatgpt · Started: 2026-08-24");
    expect(created.content).toContain("## 2026-08-24 16:20 UTC — germano\n\nPlease inspect.");
    expect(created.content).not.toContain("#teg");

    const before = await readFile(path.join(root, "chat", "new-ruling.md"), "utf8");
    await expect(createThread(root, {
      slug: "new-ruling", title: "Overwrite", summary: "Should not land.", body: "No", awaiting: "nobody",
    })).rejects.toBeInstanceOf(ChatConflictError);
    await expect(readFile(path.join(root, "chat", "new-ruling.md"), "utf8")).resolves.toBe(before);
  });

  it("rejects invented Awaiting values and mismatched routing", async () => {
    const before = await getFile(root, "chat/test-thread.md");
    await expect(replyToThread(root, {
      thread: "chat/test-thread.md", body: "Hello #thufir", awaiting: "nobody", version: before.version,
    })).rejects.toBeInstanceOf(PathError);
    await expect(replyToThread(root, {
      thread: "chat/test-thread.md", body: "Hello", awaiting: "germano", version: before.version,
    })).rejects.toBeInstanceOf(PathError);
  });
});
