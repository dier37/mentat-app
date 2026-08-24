import { createServer, type Server } from "node:http";
import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiMiddleware } from "../server/http";
import { createBrainFixture } from "./fixture";
import { ANSWER_SCRIPT, createFakeClaude } from "./fake-claude";

let root: string;
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  root = await createBrainFixture();
  const middleware = createApiMiddleware(root);
  server = createServer((request, response) => void middleware(request, response));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(root, { recursive: true, force: true });
});

async function status(wirePath: string): Promise<number> {
  return (await fetch(`${baseUrl}${wirePath}`)).status;
}

async function post(route: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("HTTP path boundary", () => {
  it.each([
    "/api/file?path=../../etc/passwd",
    "/api/file?path=%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "/api/file?path=%252e%252e%252fetc%252fpasswd",
    "/api/file?path=.git/config",
    "/api/file?path=CLAUDE.md&path=MEMORY.md",
    "/api/file",
    "/api/tree?path=../",
    "/api/search?q=x&path=../",
    "/api/links?path=../outside.md",
    "/api/query",
    "/api/query?q=one&q=two",
    "/api/query?q=",
  ])("rejects %s", async (wirePath) => {
    expect(await status(wirePath)).toBe(400);
  });

  it("serves sane JSON", async () => {
    const response = await fetch(`${baseUrl}/api/file?path=CLAUDE.md`);
    await expect(response.json()).resolves.toMatchObject({ path: "CLAUDE.md" });
  });
});

describe("chat HTTP boundary", () => {
  it.each(["../CLAUDE.md", "meta/onboarding-chatgpt.md", "README.md"])("rejects reply target %s with 400", async (thread) => {
    const response = await post("/api/chat/reply", { thread, body: "attack", awaiting: "nobody", version: "x" });
    expect(response.status).toBe(400);
  });

  it("returns current thread content with a stale-version 409", async () => {
    const response = await post("/api/chat/reply", { thread: "chat/test-thread.md", body: "draft", awaiting: "nobody", version: "stale" });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ current: { path: "chat/test-thread.md", content: expect.stringContaining("Opening.") } });
  });

  it("returns 409 when a thread slug already exists", async () => {
    const response = await post("/api/chat/thread", { slug: "test-thread", title: "Duplicate", summary: "No overwrite.", body: "draft", awaiting: "nobody" });
    expect(response.status).toBe(409);
  });
});

describe("the query endpoints", () => {
  afterEach(() => { delete process.env.MENTAT_CLAUDE_BIN; });

  it("streams query events as SSE", async () => {
    const fake = await createFakeClaude(ANSWER_SCRIPT);
    process.env.MENTAT_CLAUDE_BIN = fake.command;
    const response = await fetch(`${baseUrl}/api/query?q=what%20is%20mentat%3F`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const body = await response.text();
    const events = body.split("\n\n").map((chunk) => chunk.trim())
      .filter((chunk) => chunk.startsWith("data: "))
      .map((chunk) => JSON.parse(chunk.slice(6)) as { type: string });
    expect(events.map((event) => event.type)).toEqual(["start", "limits", "reading", "reading", "text", "done"]);
  });

  it("reports a failed subprocess over the stream, not as an HTTP error", async () => {
    const fake = await createFakeClaude(`process.exit(3);`);
    process.env.MENTAT_CLAUDE_BIN = fake.command;
    const response = await fetch(`${baseUrl}/api/query?q=x`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"type":"error"');
  });

  it.each([
    { slug: "../chat/test-thread", question: "q", answer: "a" },
    { slug: "chat/test-thread", question: "q", answer: "a" },
    { slug: "Talo", question: "q", answer: "a" },
    { slug: "talo-lease", question: "", answer: "a" },
    { slug: "talo-lease", question: "q", answer: "" },
  ])("rejects keeping %j", async (body) => {
    expect((await post("/api/query/keep", body)).status).toBe(400);
  });

  it("keeps an answer in outputs/ and refuses to overwrite it", async () => {
    const body = { slug: "talo-lease", question: "Should I renew?", answer: "Not yet.", read: ["wiki/concepts/alpha.md"] };
    const first = await post("/api/query/keep", body);
    expect(first.status).toBe(201);
    expect((await first.json() as { path: string }).path).toBe("outputs/talo-lease.md");
    expect((await post("/api/query/keep", body)).status).toBe(409);
  });
});
