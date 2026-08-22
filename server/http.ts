import type { IncomingMessage, ServerResponse } from "node:http";
import { getFile } from "./file";
import { getLinks } from "./links";
import { PathError } from "./paths";
import { searchFiles } from "./search";
import { getTree } from "./tree";
import { watchBrain, type ChangeEvent } from "./watch";

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
      const status = error instanceof PathError ? error.status : 500;
      const message = error instanceof Error ? error.message : "Unknown error";
      return json(response, status, { error: status === 500 ? "Internal server error" : message });
    }
  };
}
