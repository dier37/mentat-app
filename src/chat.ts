export interface ChatEntry {
  timestamp: string;
  agent: string;
  content: string;
}

export interface ChatThread {
  path: string;
  title: string;
  summary?: string;
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
  const preamble = markdown.slice(0, matches[0]?.index ?? markdown.length);
  const summary = preamble.match(/^>\s*(.+(?:\n>\s*.*)*)$/m)?.[1].replace(/\n>\s*/g, " ").trim();
  const entries = matches.map((match, index) => ({
    timestamp: match[1],
    agent: match[2].toLocaleLowerCase(),
    content: markdown.slice((match.index ?? 0) + match[0].length, matches[index + 1]?.index ?? markdown.length).trim(),
  }));
  return {
    path,
    title,
    summary,
    status: header?.[1].trim().toLocaleLowerCase() ?? "unknown",
    awaiting: header?.[2].trim().toLocaleLowerCase() ?? "nobody",
    entries,
    lastTimestamp: entries.at(-1)?.timestamp ?? "",
  };
}

export function queuedAge(timestamp: string, now = new Date()): string {
  const instant = new Date(`${timestamp.slice(0, 10)}T${timestamp.slice(11, 16)}:00Z`).getTime();
  const minutes = Math.max(0, Math.floor((now.getTime() - instant) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function displayAgent(key: string): string {
  return ({ claude: "Thufir", chatgpt: "Teg", germano: "Germano" } as Record<string, string>)[key] ?? key;
}

export function sortChatThreads(threads: ChatThread[]): ChatThread[] {
  const priority = (thread: ChatThread) => thread.awaiting === "germano" ? 0 : thread.awaiting === "nobody" ? 2 : 1;
  return [...threads].sort((a, b) => priority(a) - priority(b) || b.lastTimestamp.localeCompare(a.lastTimestamp) || a.title.localeCompare(b.title));
}
