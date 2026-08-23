import path from "node:path";
import { rm, symlink } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { PathError, resolveInRoot } from "../server/paths";
import { createBrainFixture } from "./fixture";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("resolveInRoot", () => {
  it("resolves an existing file and the explicit root", async () => {
    const root = await createBrainFixture(); roots.push(root);
    await expect(resolveInRoot(root, "CLAUDE.md")).resolves.toBe(path.join(root, "CLAUDE.md"));
    await expect(resolveInRoot(root, ".")).resolves.toBe(root);
  });

  it.each(["../outside", "wiki/../../outside", "..\\outside", "/etc/passwd", "C:\\Windows\\win.ini", ".git/config", ".claude/settings.local.json", ".gitignore", "node_modules/x", "", "   ", "bad\0path"])(
    "rejects hostile path %j",
    async (relPath) => {
      const root = await createBrainFixture(); roots.push(root);
      await expect(resolveInRoot(root, relPath)).rejects.toBeInstanceOf(PathError);
    },
  );

  it("rejects a symlink whose real path leaves the root", async () => {
    const root = await createBrainFixture(); roots.push(root);
    await symlink("/etc/passwd", path.join(root, "outside.md"));
    await expect(resolveInRoot(root, "outside.md")).rejects.toMatchObject({ status: 400 });
  });

  it("returns 404 for a missing path", async () => {
    const root = await createBrainFixture(); roots.push(root);
    await expect(resolveInRoot(root, "missing.md")).rejects.toMatchObject({ status: 404 });
  });
});
