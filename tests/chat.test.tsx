import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { displayAgent, parseChatThread, sortChatThreads } from "../src/chat";
import { ChatView } from "../src/components/ChatView";

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

    const markup = renderToStaticMarkup(<ChatView file={{ path: thread.path, content: markdown, mtime: "2026-08-23T10:07:00Z" }} />);
    expect(markup).toContain("Thufir");
    expect(markup).toContain("Teg");
    expect(markup).toContain("newcomer");
    expect(markup).toContain("awaiting-germano");
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
});
