import path from "node:path";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDataRoot } from "../server/root";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("resolveDataRoot", () => {
  it("fails clearly when CLAUDE.md is absent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mentat-no-map-")); roots.push(root);
    await expect(resolveDataRoot("/", root)).rejects.toThrow(`Mentat data root has no CLAUDE.md: ${root}`);
  });

  it("fails clearly when the directory is absent", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "mentat-missing-")); roots.push(parent);
    await expect(resolveDataRoot("/", path.join(parent, "nope"))).rejects.toThrow("Mentat data root does not exist");
  });
});
