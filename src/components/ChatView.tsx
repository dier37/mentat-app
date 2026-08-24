import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { displayAgent, parseChatThread, queuedAge, sortChatThreads, type ChatThread } from "../chat";
import type { BrainFile } from "../types";
import { ReplyComposer } from "./ChatComposer";

interface ChatViewProps {
  file: BrainFile;
  onUpdated: (file: BrainFile) => void;
}

export function ChatView({ file, onUpdated }: ChatViewProps) {
  const thread = parseChatThread(file.path, file.content);
  return (
    <main className={`reading-pane chat-view${thread.awaiting === "germano" ? " awaiting-germano" : ""}`}>
      <header className="file-meta"><span>{file.path}</span><span>{thread.status}</span></header>
      <article className="conversation">
        <header className="conversation-header">
          <p className="conversation-kicker">Conversation</p>
          <h1>{thread.title}</h1>
          {thread.summary && <p className="conversation-summary">{thread.summary}</p>}
          <p className="thread-status">Status: {thread.status} · Awaiting: {displayAgent(thread.awaiting)}</p>
        </header>
        {thread.entries.map((entry, index) => (
          <section className={`speaker-block speaker-${entry.agent}`} key={`${entry.timestamp}-${entry.agent}-${index}`}>
            <header><span>{displayAgent(entry.agent)}</span><time>{entry.timestamp}</time></header>
            <div className="speaker-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown></div>
          </section>
        ))}
        <ReplyComposer file={file} onUpdated={onUpdated} />
      </article>
    </main>
  );
}

interface ChatThreadRailProps {
  threads: ChatThread[];
  selectedPath: string;
  onNavigate: (path: string) => void;
  onNewThread: () => void;
}

export function ChatThreadRail({ threads, selectedPath, onNavigate, onNewThread }: ChatThreadRailProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const sorted = sortChatThreads(threads);
  return (
    <aside className="context-rail chat-rail" aria-label="Chat threads">
      <div className="rail-heading"><span>Threads</span><span>{threads.length}</span></div>
      <button className="new-thread-button" type="button" onClick={onNewThread}>Start a thread</button>
      <ul>{sorted.map((thread) => (
        <li key={thread.path} className={thread.awaiting === "germano" ? "awaiting-germano" : ""}>
          <button className={thread.path === selectedPath ? "is-current" : ""} type="button" onClick={() => onNavigate(thread.path)}>
            <span>{thread.title}</span>
            {thread.summary && <span className="rail-summary">{thread.summary}</span>}
            <small>{thread.awaiting === "chatgpt" ? `queued for Teg · ${queuedAge(thread.lastTimestamp, now)}` : thread.awaiting === "claude" ? "Thufir · watched" : `${thread.status} · ${displayAgent(thread.awaiting)}`}</small>
          </button>
        </li>
      ))}</ul>
    </aside>
  );
}
