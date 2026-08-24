import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

/** Read-only tools the query subprocess is allowed to hold. Never add a writing tool here. */
const QUERY_TOOLS = ["Read", "Grep", "Glob"] as const;
const NO_MCP = '{"mcpServers":{}}';

/**
 * CLAUDE.md tells any agent in this brain to write an answer to `outputs/` rather than to the
 * terminal. This subprocess cannot: it holds no writing tool, by design. Without this note it
 * spends a turn attempting a Write and opens the answer apologising for the failure.
 */
const MODE_NOTE = [
  "You are answering one question in the mentat-app query pane.",
  "You are read-only here: Write, Edit and Bash are unavailable by design, not by accident.",
  "Do not attempt to write a file and do not apologise for not writing one — give the full answer in this reply.",
  "If it is worth keeping, Germano presses Keep and the app files it to outputs/ for you.",
  "Everything else in CLAUDE.md still applies: the reading protocol, citing the file behind every claim,",
  "marking inferences and dated snapshots, and saying plainly when something is not in the brain.",
].join(" ");

const MAX_QUESTION = 2000;
const MAX_CONCURRENT = 2;
const TIMEOUT_MS = 300_000;
const KILL_GRACE_MS = 5_000;
const MAX_STREAM_BYTES = 8 * 1024 * 1024;
const MAX_LINE_BYTES = 1024 * 1024;

export class QueryError extends Error {
  constructor(message: string, readonly status: 400 | 429 | 500 = 400) {
    super(message);
    this.name = "QueryError";
  }
}

export interface QueryStart { type: "start"; session: string; model: string; tools: string[] }
export interface QueryReading { type: "reading"; tool: string; target: string }
export interface QueryBlocked { type: "blocked"; tool: string }
export interface QueryLimits {
  type: "limits";
  status: string;
  limitType: string;
  resetsAt: string | null;
  usingOverage: boolean;
  overageAvailable: boolean;
}
export interface QueryText { type: "text"; text: string }
/**
 * `equivalentUsd` is what the run would have cost at API rates. Germano is on a subscription and
 * has no API key set, so it is a size indicator, not a bill. The budget that actually binds is
 * the five-hour rate-limit window in `limits`, which this pane shares with his interactive
 * sessions — and with overage disabled at the org level, exhausting it fails queries outright.
 */
export interface QueryDone {
  type: "done";
  answer: string;
  equivalentUsd: number | null;
  durationMs: number | null;
  turns: number | null;
  denials: number;
  read: string[];
  blocked: string[];
  limits: Omit<QueryLimits, "type"> | null;
}
export interface QueryFailed { type: "error"; message: string }
export type QueryEvent = QueryStart | QueryReading | QueryBlocked | QueryLimits | QueryText | QueryDone | QueryFailed;

export interface QueryHandle { cancel: () => void; finished: Promise<void> }

let running = 0;

export function validateQuestion(question: unknown): string {
  if (typeof question !== "string") throw new QueryError("Question is required");
  const trimmed = question.trim();
  if (!trimmed) throw new QueryError("Question is required");
  if (trimmed.length > MAX_QUESTION) throw new QueryError(`Question is longer than ${MAX_QUESTION} characters`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(trimmed)) throw new QueryError("Question contains control characters");
  return trimmed;
}

/**
 * The target a read-only tool call touched, for the "watching it read" affordance.
 * Read takes an absolute path; Grep and Glob take a pattern plus an optional path.
 */
function readTarget(root: string, name: string, input: Record<string, unknown>): string {
  const filePath = typeof input.file_path === "string" ? input.file_path : undefined;
  if (filePath) {
    const relative = filePath.startsWith(root) ? filePath.slice(root.length).replace(/^[/\\]+/, "") : filePath;
    return relative.split("\\").join("/");
  }
  const pattern = typeof input.pattern === "string" ? input.pattern : "";
  const scope = typeof input.path === "string" && input.path !== root ? ` in ${input.path}` : "";
  return `${name === "Grep" ? "/" : ""}${pattern}${name === "Grep" ? "/" : ""}${scope}`;
}

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: "text"; text: string } =>
      typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text")
    .map((block) => block.text)
    .join("");
}

interface StreamState { answer: string; read: string[]; blocked: string[]; limits: Omit<QueryLimits, "type"> | null }

function handleEvent(root: string, event: Record<string, unknown>, state: StreamState, emit: (event: QueryEvent) => void): void {
  if (event.type === "system" && event.subtype === "init") {
    emit({
      type: "start",
      session: typeof event.session_id === "string" ? event.session_id : "",
      model: typeof event.model === "string" ? event.model : "",
      tools: Array.isArray(event.tools) ? event.tools.filter((tool): tool is string => typeof tool === "string") : [],
    });
    return;
  }
  if (event.type === "rate_limit_event") {
    const info = (event.rate_limit_info ?? {}) as Record<string, unknown>;
    const resets = typeof info.resetsAt === "number" ? new Date(info.resetsAt * 1000).toISOString() : null;
    state.limits = {
      status: typeof info.status === "string" ? info.status : "unknown",
      limitType: typeof info.rateLimitType === "string" ? info.rateLimitType : "unknown",
      resetsAt: resets,
      usingOverage: info.isUsingOverage === true,
      overageAvailable: info.overageStatus === "allowed",
    };
    emit({ type: "limits", ...state.limits });
    return;
  }
  if (event.type === "assistant") {
    const message = event.message as { content?: unknown } | undefined;
    const content = Array.isArray(message?.content) ? message.content : [];
    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const typed = block as { type?: unknown; name?: unknown; input?: unknown; text?: unknown };
      if (typed.type === "tool_use" && typeof typed.name === "string") {
        // A tool outside the allowlist was attempted and refused. It never touched the file,
        // so it is not a source — recording it as one would file the answer's own path as
        // the article it came from.
        if (!(QUERY_TOOLS as readonly string[]).includes(typed.name)) {
          if (!state.blocked.includes(typed.name)) state.blocked.push(typed.name);
          emit({ type: "blocked", tool: typed.name });
          continue;
        }
        const target = readTarget(root, typed.name, (typed.input ?? {}) as Record<string, unknown>);
        if (target && !state.read.includes(target)) state.read.push(target);
        emit({ type: "reading", tool: typed.name, target });
      }
      if (typed.type === "text" && typeof typed.text === "string" && typed.text) {
        emit({ type: "text", text: typed.text });
      }
    }
    return;
  }
  if (event.type === "result") {
    const answer = typeof event.result === "string" ? event.result : textOf(event.result);
    state.answer = answer;
    if (event.is_error === true) {
      emit({ type: "error", message: answer || "The query subprocess reported an error" });
      return;
    }
    emit({
      type: "done",
      answer,
      equivalentUsd: typeof event.total_cost_usd === "number" ? event.total_cost_usd : null,
      durationMs: typeof event.duration_ms === "number" ? event.duration_ms : null,
      turns: typeof event.num_turns === "number" ? event.num_turns : null,
      denials: Array.isArray(event.permission_denials) ? event.permission_denials.length : 0,
      read: [...state.read],
      blocked: [...state.blocked],
      limits: state.limits,
    });
  }
}

export interface RunQueryOptions { command?: string; timeoutMs?: number }

/**
 * Run one question against the brain in a read-only Claude Code subprocess.
 *
 * The prompt goes over stdin, never argv, so no question text is ever parsed as a flag.
 * The child is spawned without a shell, holds only Read/Grep/Glob, and has every MCP
 * server stripped: with no Bash, no WebFetch and no MCP, a source that tries to instruct
 * the model has no channel out of the process.
 */
export function runQuery(
  root: string,
  question: string,
  emit: (event: QueryEvent) => void,
  options: RunQueryOptions = {},
): QueryHandle {
  const prompt = validateQuestion(question);
  if (running >= MAX_CONCURRENT) throw new QueryError("Too many queries are already running", 429);

  const child: ChildProcessWithoutNullStreams = spawn(
    options.command ?? process.env.MENTAT_CLAUDE_BIN ?? "claude",
    [
      "-p",
      "--tools", ...QUERY_TOOLS,
      "--strict-mcp-config",
      "--mcp-config", NO_MCP,
      "--setting-sources", "project",
      "--append-system-prompt", MODE_NOTE,
      "--output-format", "stream-json",
      "--verbose",
    ],
    { cwd: root, shell: false, stdio: ["pipe", "pipe", "pipe"] },
  );

  running += 1;
  const state: StreamState = { answer: "", read: [], blocked: [], limits: null };
  let settled = false;
  let stderr = "";
  let buffer = "";
  let streamed = 0;
  let killTimer: NodeJS.Timeout | undefined;

  const fail = (message: string) => {
    if (settled) return;
    settled = true;
    emit({ type: "error", message });
  };

  const stop = (reason: string) => {
    if (!child.killed) child.kill("SIGTERM");
    killTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
    killTimer.unref?.();
    fail(reason);
  };

  const timeout = setTimeout(() => stop(`Query exceeded ${Math.round((options.timeoutMs ?? TIMEOUT_MS) / 1000)}s`), options.timeoutMs ?? TIMEOUT_MS);
  timeout.unref?.();

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    streamed += chunk.length;
    if (streamed > MAX_STREAM_BYTES) return stop("Query produced too much output");
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        try {
          handleEvent(root, JSON.parse(line) as Record<string, unknown>, state, (event) => {
            if (event.type === "done" || event.type === "error") {
              if (settled) return;
              settled = true;
            }
            emit(event);
          });
        } catch {
          // A non-JSON line is the CLI talking to a human; it is not part of the answer.
        }
      }
      newline = buffer.indexOf("\n");
    }
    if (buffer.length > MAX_LINE_BYTES) stop("Query produced an oversized event");
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-4000);
  });

  const finished = new Promise<void>((resolve) => {
    // Both "error" and "close" fire for a spawn failure, so this must run exactly once —
    // otherwise one failed child decrements the slot count twice and erases a live query
    // from it, letting a third subprocess past the cap. Found by chatgpt at the Phase 6 gate.
    let released = false;
    const settle = () => {
      if (released) return;
      released = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      running -= 1;
      resolve();
    };
    child.on("error", (error) => {
      fail(error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT"
        ? "The claude CLI is not installed or not on PATH"
        : `Could not start the query: ${error.message}`);
      settle();
    });
    child.on("close", (code) => {
      if (!settled) fail(stderr.trim() || `Query exited with code ${code ?? "unknown"}`);
      settle();
    });
  });

  child.stdin.on("error", () => undefined);
  child.stdin.end(prompt, "utf8");

  return { cancel: () => stop("Query cancelled"), finished };
}
