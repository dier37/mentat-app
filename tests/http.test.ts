import { createServer, type Server } from "node:http";
import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiMiddleware } from "../server/http";
import { createBrainFixture } from "./fixture";

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
  ])("rejects %s", async (wirePath) => {
    expect(await status(wirePath)).toBe(400);
  });

  it("serves sane JSON", async () => {
    const response = await fetch(`${baseUrl}/api/file?path=CLAUDE.md`);
    await expect(response.json()).resolves.toMatchObject({ path: "CLAUDE.md" });
  });
});
