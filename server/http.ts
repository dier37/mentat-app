import type { IncomingMessage, ServerResponse } from "node:http";
import { getFile } from "./file";
import { getLinks } from "./links";
import { PathError } from "./paths";
import { searchFiles } from "./search";
import { getTree } from "./tree";
import { watchBrain, type ChangeEvent } from "./watch";
import { ChatConflictError, createThread, replyToThread, type ReplyInput, type ThreadInput } from "./chat";
import { OutputConflictError, saveAnswer, type SaveInput } from "./outputs";
import { QueryError, runQuery, type QueryEvent } from "./query";

type Next = (error?: unknown) => void;

function json(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function single(params: URLSearchParams, name: string, required = false): string | undefined {
  const values = params.getAll(name);
  if (values.length > 1) throw new PathError(`Repeated ${name} parameter`);
  const value = values[0];
  if (required && value === undefined) throw new PathError(`${name} parameter is required`);
  if (value && /%(?:00|2e|2f|5c)/i.test(value)) throw new PathError(`Invalid encoded ${name} parameter`);
  return value;
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  if (!request.headers["content-type"]?.toLocaleLowerCase().startsWith("application/json")) {
    throw new PathError("Content-Type must be application/json");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new PathError("Request body is too large");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch {
    throw new PathError("Request body must be valid JSON");
  }
}

export function createApiMiddleware(root: string) {
  const streams = new Set<ServerResponse>();
  let stopWatcher: (() => void) | undefined;
  const broadcast = (event: ChangeEvent) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const stream of streams) stream.write(data);
  };

  return async (request: IncomingMessage, response: ServerResponse, next: Next = () => undefined) => {
    try {
      if (!request.url) return next();
      const url = new URL(request.url, "http://127.0.0.1");
      if (!url.pathname.startsWith("/api/")) return next();
      if (request.method === "POST" && url.pathname === "/api/chat/reply") {
        return json(response, 200, await replyToThread(root, await readJson<ReplyInput>(request)));
      }
      if (request.method === "POST" && url.pathname === "/api/chat/thread") {
        return json(response, 201, await createThread(root, await readJson<ThreadInput>(request)));
      }
      if (request.method === "POST" && url.pathname === "/api/query/keep") {
        return json(response, 201, await saveAnswer(root, await readJson<SaveInput>(request)));
      }
      if (request.method !== "GET") return json(response, 405, { error: "Method not allowed" });

      if (url.pathname === "/api/tree") {
        return json(response, 200, await getTree(root, single(url.searchParams, "path") ?? "."));
      }
      if (url.pathname === "/api/file") {
        return json(response, 200, await getFile(root, single(url.searchParams, "path", true)!));
      }
      if (url.pathname === "/api/search") {
        const query = single(url.searchParams, "q") ?? "";
        const relPath = single(url.searchParams, "path") ?? ".";
        return json(response, 200, await searchFiles(root, query, relPath));
      }
      if (url.pathname === "/api/links") {
        return json(response, 200, await getLinks(root, single(url.searchParams, "path", true)!));
      }
      if (url.pathname === "/api/query") {
        const question = single(url.searchParams, "q", true)!;
        const handle = runQuery(root, question, (event: QueryEvent) => {
          if (!response.writableEnded) response.write(`data: ${JSON.stringify(event)}\n\n`);
        });
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/event-stream");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Connection", "keep-alive");
        response.write("\n");
        request.on("close", () => handle.cancel());
        await handle.finished;
        if (!response.writableEnded) response.end();
        return;
      }
      if (url.pathname === "/api/events") {
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/event-stream");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Connection", "keep-alive");
        response.write("\n");
        streams.add(response);
        stopWatcher ??= await watchBrain(root, broadcast);
        request.on("close", () => {
          streams.delete(response);
          if (streams.size === 0 && stopWatcher) {
            stopWatcher();
            stopWatcher = undefined;
          }
        });
        return;
      }
      return json(response, 404, { error: "API route not found" });
    } catch (error) {
      if (error instanceof ChatConflictError) {
        return json(response, 409, { error: error.message, current: error.current });
      }
      if (error instanceof OutputConflictError) {
        return json(response, 409, { error: error.message });
      }
      if (error instanceof QueryError) {
        return json(response, error.status, { error: error.message });
      }
      const status = error instanceof PathError ? error.status : 500;
      const message = error instanceof Error ? error.message : "Unknown error";
      return json(response, status, { error: status === 500 ? "Internal server error" : message });
    }
  };
}
