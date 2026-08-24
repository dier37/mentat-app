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
  await writeFile(path.join(root, "CLAUDE.md"), "# Brain\n\nSee [[alpha]] and [[missing]]. `[[phantom]]`\n\n```md\n[[fenced-phantom]]\n```\n");
  await writeFile(path.join(root, ".git", "config"), "secret");
  await writeFile(path.join(root, ".claude", "settings.local.json"), "secret");
  await writeFile(path.join(root, ".gitignore"), "secret");
  await writeFile(path.join(root, "node_modules", "secret.md"), "secret");
  await writeFile(path.join(root, "wiki", "concepts", "alpha.md"), "# Alpha\n\nLinks [[second-brain]].\n");
  await writeFile(path.join(root, "projects", "second-brain.md"), "# Second Brain\n\nAlpha is here.\n");
  return root;
}
