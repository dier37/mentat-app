import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { displayAgent, parseChatThread, queuedAge, sortChatThreads } from "../src/chat";
import { ChatView } from "../src/components/ChatView";
import { routeDraft } from "../src/components/ChatComposer";

const markdown = `# Test Thread

> A conversation fixture.

Status: open · Awaiting: germano · Started: 2026-08-23

## 2026-08-23 10:00 UTC — claude

Opening position.

## 2026-08-23 10:05 UTC — chatgpt

Counter-position.

## 2026-08-23 10:07 UTC — newcomer

Third participant.
`;

describe("chat view", () => {
  it("parses stable keys and renders aliases without dropping unknown speakers", () => {
    const thread = parseChatThread("chat/test-thread.md", markdown);
    expect(thread).toMatchObject({ title: "Test Thread", status: "open", awaiting: "germano" });
    expect(thread.entries.map((entry) => entry.agent)).toEqual(["claude", "chatgpt", "newcomer"]);
    expect(displayAgent("claude")).toBe("Thufir");
    expect(displayAgent("chatgpt")).toBe("Teg");
    expect(displayAgent("newcomer")).toBe("newcomer");

    const markup = renderToStaticMarkup(<ChatView file={{ path: thread.path, content: markdown, mtime: "2026-08-23T10:07:00Z", version: "fixture-version" }} onUpdated={() => undefined} />);
    expect(markup).toContain("Thufir");
    expect(markup).toContain("Teg");
    expect(markup).toContain("newcomer");
    expect(markup).toContain("awaiting-germano");
    expect(markup).toContain("A conversation fixture.");
  });

  it("sorts Germano's turn first, then active turns, then idle threads", () => {
    const base = parseChatThread("chat/base.md", markdown);
    const sorted = sortChatThreads([
      { ...base, path: "chat/idle.md", awaiting: "nobody" },
      { ...base, path: "chat/teg.md", awaiting: "chatgpt" },
      { ...base, path: "chat/germano.md", awaiting: "germano" },
    ]);
    expect(sorted.map((thread) => thread.path)).toEqual(["chat/germano.md", "chat/teg.md", "chat/idle.md"]);
  });

  it("reports the honest age of turns queued for Teg", () => {
    expect(queuedAge("2026-08-23 10:05 UTC", new Date("2026-08-23T10:07:00Z"))).toBe("2m");
    expect(queuedAge("2026-08-23 10:05 UTC", new Date("2026-08-23T12:20:00Z"))).toBe("2h");
  });

  it("previews tag routing and rejects competing turn tags", () => {
    expect(routeDraft("Review this #thufir")).toMatchObject({ awaiting: "claude", valid: true });
    expect(routeDraft("Queue this #teg")).toMatchObject({ awaiting: "chatgpt", valid: true });
    expect(routeDraft("Keep idle")).toMatchObject({ awaiting: "nobody", valid: true });
    expect(routeDraft("#thufir and #teg").valid).toBe(false);
  });
});
