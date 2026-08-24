export interface ChatEntry {
  timestamp: string;
  agent: string;
  content: string;
}

export interface ChatThread {
  path: string;
  title: string;
  status: string;
  awaiting: string;
  entries: ChatEntry[];
  lastTimestamp: string;
}

const ENTRY_HEADER = /^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC) — ([\w-]+)\s*$/gm;

export function parseChatThread(path: string, markdown: string): ChatThread {
  const title = markdown.match(/^# (.+)$/m)?.[1].trim() ?? path.replace(/^chat\//, "").replace(/\.md$/, "");
  const header = markdown.match(/^Status:\s*([^\n·]+?)\s*·\s*Awaiting:\s*([^\n·]+?)(?:\s*·|$)/m);
  const matches = [...markdown.matchAll(ENTRY_HEADER)];
  const entries = matches.map((match, index) => ({
    timestamp: match[1],
    agent: match[2].toLocaleLowerCase(),
    content: markdown.slice((match.index ?? 0) + match[0].length, matches[index + 1]?.index ?? markdown.length).trim(),
  }));
  return {
    path,
    title,
    status: header?.[1].trim().toLocaleLowerCase() ?? "unknown",
    awaiting: header?.[2].trim().toLocaleLowerCase() ?? "nobody",
    entries,
    lastTimestamp: entries.at(-1)?.timestamp ?? "",
  };
}

export function displayAgent(key: string): string {
  return ({ claude: "Thufir", chatgpt: "Teg", germano: "Germano" } as Record<string, string>)[key] ?? key;
}

export function sortChatThreads(threads: ChatThread[]): ChatThread[] {
  const priority = (thread: ChatThread) => thread.awaiting === "germano" ? 0 : thread.awaiting === "nobody" ? 2 : 1;
  return [...threads].sort((a, b) => priority(a) - priority(b) || b.lastTimestamp.localeCompare(a.lastTimestamp) || a.title.localeCompare(b.title));
}
