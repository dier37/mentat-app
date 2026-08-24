import path from "node:path";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

export interface FakeClaude { command: string; argvPath: string; stdinPath: string }

/**
 * A stand-in for the claude CLI: records the argv and stdin it was given, then replays
 * canned stream-json lines. Nothing here talks to a model, so the tests cost nothing and
 * still assert the exact command line the server builds.
 */
export async function createFakeClaude(script: string): Promise<FakeClaude> {
  const dir = await mkdtemp(path.join(tmpdir(), "fake-claude-"));
  const argvPath = path.join(dir, "argv.json");
  const stdinPath = path.join(dir, "stdin.txt");
  const command = path.join(dir, "claude");
  const source = `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(argvPath)}, JSON.stringify(process.argv.slice(2)));
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.writeFileSync(${JSON.stringify(stdinPath)}, stdin);
  const emit = (line) => process.stdout.write(JSON.stringify(line) + "\\n");
  const raw = (line) => process.stdout.write(line + "\\n");
  ${script}
});
`;
  await writeFile(command, source, "utf8");
  await chmod(command, 0o755);
  return { command, argvPath, stdinPath };
}

export async function readArgv(fake: FakeClaude): Promise<string[]> {
  return JSON.parse(await readFile(fake.argvPath, "utf8")) as string[];
}

export async function readStdin(fake: FakeClaude): Promise<string> {
  return readFile(fake.stdinPath, "utf8");
}

export const BLOCKED_SCRIPT = `
  emit({ type: "system", subtype: "init", session_id: "s-2", model: "claude-opus-5", tools: ["Glob", "Grep", "Read"], mcp_servers: [] });
  emit({ type: "assistant", message: { content: [{ type: "tool_use", name: "Write", input: { file_path: process.cwd() + "/outputs/talo-lease.md" } }] } });
  emit({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: process.cwd() + "/wiki/concepts/alpha.md" } }] } });
  emit({ type: "result", subtype: "success", is_error: false, result: "Answered in the pane.", total_cost_usd: 0.01, duration_ms: 100, num_turns: 2, permission_denials: [] });
`;

export const ANSWER_SCRIPT = `
  emit({ type: "system", subtype: "init", session_id: "s-1", model: "claude-opus-5", tools: ["Glob", "Grep", "Read"], mcp_servers: [] });
  raw("not json at all");
  emit({ type: "rate_limit_event", rate_limit_info: { status: "allowed", resetsAt: 1787616000, rateLimitType: "five_hour", overageStatus: "rejected", isUsingOverage: false } });
  emit({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: process.cwd() + "/wiki/concepts/alpha.md" } }] } });
  emit({ type: "assistant", message: { content: [{ type: "tool_use", name: "Grep", input: { pattern: "ski" } }] } });
  emit({ type: "assistant", message: { content: [{ type: "text", text: "Alpha links second-brain." }] } });
  emit({ type: "result", subtype: "success", is_error: false, result: "Alpha links second-brain (wiki/concepts/alpha.md).", total_cost_usd: 0.0123, duration_ms: 4200, num_turns: 3, permission_denials: [] });
`;
