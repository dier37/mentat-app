import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

export async function createBrainFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "mentat-app-"));
  await mkdir(path.join(root, ".git"));
  await mkdir(path.join(root, ".claude"));
  await mkdir(path.join(root, "node_modules"));
  await mkdir(path.join(root, "wiki", "concepts"), { recursive: true });
  await mkdir(path.join(root, "projects"));
  await mkdir(path.join(root, "chat"));
  await writeFile(path.join(root, "CLAUDE.md"), "# Brain\n\nSee [[alpha]] and [[missing]]. `[[phantom]]`\n\n```md\n[[fenced-phantom]]\n```\n");
  await writeFile(path.join(root, ".git", "config"), "secret");
  await writeFile(path.join(root, ".claude", "settings.local.json"), "secret");
  await writeFile(path.join(root, ".gitignore"), "secret");
  await writeFile(path.join(root, "node_modules", "secret.md"), "secret");
  await writeFile(path.join(root, "wiki", "concepts", "alpha.md"), "# Alpha\n\nLinks [[second-brain]].\n");
  await writeFile(path.join(root, "projects", "second-brain.md"), "# Second Brain\n\nAlpha is here.\n");
  await writeFile(path.join(root, "chat", "test-thread.md"), "# Test Thread\n\n> A fixture thread.\n\nStatus: open · Awaiting: germano · Started: 2026-08-23\n\n## 2026-08-23 10:00 UTC — claude\n\nOpening.\n");
  return root;
}
