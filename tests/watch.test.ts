import path from "node:path";
import { rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { watchBrain, type ChangeEvent } from "../server/watch";
import { createBrainFixture } from "./fixture";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("brain watcher", () => {
  it("emits a root-relative change for an edited file", async () => {
    const root = await createBrainFixture();
    roots.push(root);
    let stop: () => void = () => undefined;
    const event = new Promise<ChangeEvent>(async (resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for change")), 2_000);
      stop = await watchBrain(root, (change) => {
        if (change.path === "CLAUDE.md") {
          clearTimeout(timeout);
          resolve(change);
        }
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await writeFile(path.join(root, "CLAUDE.md"), "# Updated\n");
    await expect(event).resolves.toEqual({ type: "change", path: "CLAUDE.md" });
    stop();
  });
});
