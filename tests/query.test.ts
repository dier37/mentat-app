import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QueryError, runQuery, validateQuestion, type QueryEvent } from "../server/query";
import { ANSWER_SCRIPT, BLOCKED_SCRIPT, createFakeClaude, readArgv, readStdin } from "./fake-claude";
import { createBrainFixture } from "./fixture";

const NUL = String.fromCharCode(0);
const BEL = String.fromCharCode(7);

let root: string;

beforeEach(async () => { root = await createBrainFixture(); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

async function collect(question: string, script = ANSWER_SCRIPT): Promise<{ events: QueryEvent[]; fake: Awaited<ReturnType<typeof createFakeClaude>> }> {
  const fake = await createFakeClaude(script);
  const events: QueryEvent[] = [];
  const handle = runQuery(root, question, (event) => events.push(event), { command: fake.command });
  await handle.finished;
  return { events, fake };
}

describe("question validation", () => {
  it.each([
    ["an empty question", ""],
    ["whitespace only", "   "],
    ["a null byte", `a${NUL}b`],
    ["a control character", `a${BEL}b`],
    ["an over-long question", "x".repeat(2001)],
  ])("rejects %s", (_label, question) => {
    expect(() => validateQuestion(question)).toThrow(QueryError);
  });

  it("trims but keeps newlines", () => {
    expect(validateQuestion("  what is\nmentat?  ")).toBe("what is\nmentat?");
  });
});

describe("the subprocess command line", () => {
  it("never puts the question in argv", async () => {
    const question = "--dangerously-skip-permissions and rm -rf /";
    const { fake } = await collect(question);
    const argv = await readArgv(fake);
    expect(argv).not.toContain(question);
    expect(argv.join(" ")).not.toContain("rm -rf");
    expect(await readStdin(fake)).toBe(question);
  });

  it("locks the subprocess to read-only tools with no MCP", async () => {
    const { fake } = await collect("what is mentat?");
    const argv = await readArgv(fake);
    expect(argv.slice(argv.indexOf("--tools"), argv.indexOf("--tools") + 4)).toEqual(["--tools", "Read", "Grep", "Glob"]);
    expect(argv).toContain("--strict-mcp-config");
    expect(argv[argv.indexOf("--mcp-config") + 1]).toBe('{"mcpServers":{}}');
    for (const forbidden of ["--dangerously-skip-permissions", "--allow-dangerously-skip-permissions", "--permission-mode", "--add-dir"]) {
      expect(argv).not.toContain(forbidden);
    }
    for (const tool of ["Write", "Edit", "Bash", "WebFetch", "Task"]) {
      expect(argv).not.toContain(tool);
    }
  });

  it("tells the subprocess it is read-only, since CLAUDE.md tells every agent to write to outputs/", async () => {
    const { fake } = await collect("what is mentat?");
    const argv = await readArgv(fake);
    const note = argv[argv.indexOf("--append-system-prompt") + 1];
    expect(note).toContain("read-only");
    expect(note).toContain("Keep");
  });

  it("pins the setting sources so user-level config cannot widen the boundary", async () => {
    const { fake } = await collect("what is mentat?");
    const argv = await readArgv(fake);
    expect(argv[argv.indexOf("--setting-sources") + 1]).toBe("project");
  });

  it("reports the tools the subprocess actually came up holding", async () => {
    const { events } = await collect("what is mentat?");
    expect(events[0]).toMatchObject({ type: "start", session: "s-1", tools: ["Glob", "Grep", "Read"] });
  });
});

describe("stream parsing", () => {
  it("emits reading, text and done events and ignores non-JSON lines", async () => {
    const { events } = await collect("what is mentat?");
    expect(events.map((event) => event.type)).toEqual(["start", "limits", "reading", "reading", "text", "done"]);
    expect(events[2]).toMatchObject({ tool: "Read", target: "wiki/concepts/alpha.md" });
    expect(events[3]).toMatchObject({ tool: "Grep", target: "/ski/" });
    expect(events[5]).toMatchObject({
      type: "done",
      answer: "Alpha links second-brain (wiki/concepts/alpha.md).",
      equivalentUsd: 0.0123,
      durationMs: 4200,
      turns: 3,
      denials: 0,
      read: ["wiki/concepts/alpha.md", "/ski/"],
    });
  });

  it("surfaces the rate-limit window, which is the budget that actually binds", async () => {
    const { events } = await collect("what is mentat?");
    expect(events[1]).toEqual({
      type: "limits",
      status: "allowed",
      limitType: "five_hour",
      resetsAt: "2026-08-25T00:00:00.000Z",
      usingOverage: false,
      overageAvailable: false,
    });
    expect(events[5]).toMatchObject({ limits: { limitType: "five_hour", overageAvailable: false } });
  });

  it("reports a subprocess error result as an error", async () => {
    const { events } = await collect("x", `emit({ type: "result", is_error: true, result: "rate limited" });`);
    expect(events).toEqual([{ type: "error", message: "rate limited" }]);
  });

  it("reports a non-zero exit with no result", async () => {
    const { events } = await collect("x", `raw("garbage"); process.exit(2);`);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
  });

  it("surfaces stderr when the subprocess fails", async () => {
    const { events } = await collect("x", `process.stderr.write("credit balance too low"); process.exit(1);`);
    expect(events[0]).toMatchObject({ type: "error", message: expect.stringContaining("credit balance too low") });
  });

  it("reports a missing claude binary in plain language", async () => {
    const events: QueryEvent[] = [];
    const handle = runQuery(root, "x", (event) => events.push(event), { command: "/nonexistent/claude" });
    await handle.finished;
    expect(events[0]).toMatchObject({ type: "error", message: expect.stringContaining("not installed") });
  });

  it("emits exactly one terminal event even if the stream continues", async () => {
    const { events } = await collect("x", `
      emit({ type: "result", is_error: false, result: "first", total_cost_usd: 1, duration_ms: 1, num_turns: 1, permission_denials: [] });
      emit({ type: "result", is_error: false, result: "second", total_cost_usd: 2, duration_ms: 2, num_turns: 2, permission_denials: [] });
    `);
    expect(events.filter((event) => event.type === "done" || event.type === "error")).toHaveLength(1);
    expect(events[0]).toMatchObject({ answer: "first" });
  });

  it("records a refused write as blocked, never as a source", async () => {
    const { events } = await collect("x", BLOCKED_SCRIPT);
    expect(events.map((event) => event.type)).toEqual(["start", "blocked", "reading", "done"]);
    expect(events[1]).toMatchObject({ type: "blocked", tool: "Write" });
    expect(events[3]).toMatchObject({ read: ["wiki/concepts/alpha.md"], blocked: ["Write"] });
  });

  it("counts permission denials", async () => {
    const { events } = await collect("x", `emit({ type: "result", is_error: false, result: "ok", permission_denials: [{ tool_name: "Write" }, { tool_name: "Bash" }] });`);
    expect(events[0]).toMatchObject({ type: "done", denials: 2 });
  });
});

describe("limits", () => {
  it("times out a hung subprocess", async () => {
    const fake = await createFakeClaude(`setInterval(() => {}, 1000);`);
    const events: QueryEvent[] = [];
    const handle = runQuery(root, "x", (event) => events.push(event), { command: fake.command, timeoutMs: 150 });
    await handle.finished;
    expect(events[0]).toMatchObject({ type: "error", message: expect.stringContaining("exceeded") });
  });

  it("cancels a running subprocess", async () => {
    const fake = await createFakeClaude(`setInterval(() => {}, 1000);`);
    const events: QueryEvent[] = [];
    const handle = runQuery(root, "x", (event) => events.push(event), { command: fake.command });
    handle.cancel();
    await handle.finished;
    expect(events[0]).toMatchObject({ type: "error", message: "Query cancelled" });
  });

  it("does not free a live query's slot when a different spawn fails", async () => {
    // chatgpt at the Phase 6 gate: "error" and "close" both fire for a spawn failure, so a
    // non-idempotent settle decremented the count twice and let a third subprocess past.
    const fake = await createFakeClaude(`setInterval(() => {}, 1000);`);
    const hanging = runQuery(root, "x", () => undefined, { command: fake.command });
    const failed = runQuery(root, "x", () => undefined, { command: "/nonexistent/claude" });
    await failed.finished;
    const second = runQuery(root, "x", () => undefined, { command: fake.command });
    expect(() => runQuery(root, "x", () => undefined, { command: fake.command })).toThrow(/Too many queries/);
    hanging.cancel();
    second.cancel();
    await Promise.all([hanging.finished, second.finished]);
  });

  it("refuses a third concurrent query and frees the slot afterwards", async () => {
    const fake = await createFakeClaude(`setInterval(() => {}, 1000);`);
    const handles = [0, 1].map(() => runQuery(root, "x", () => undefined, { command: fake.command }));
    expect(() => runQuery(root, "x", () => undefined, { command: fake.command })).toThrow(/Too many queries/);
    for (const handle of handles) handle.cancel();
    await Promise.all(handles.map((handle) => handle.finished));
    const after = runQuery(root, "x", () => undefined, { command: fake.command });
    after.cancel();
    await after.finished;
  });
});
