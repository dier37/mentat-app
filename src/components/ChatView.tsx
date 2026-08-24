import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { displayAgent, parseChatThread, sortChatThreads, type ChatThread } from "../chat";
import type { BrainFile } from "../types";

interface ChatViewProps {
  file: BrainFile;
}

export function ChatView({ file }: ChatViewProps) {
  const thread = parseChatThread(file.path, file.content);
  return (
    <main className={`reading-pane chat-view${thread.awaiting === "germano" ? " awaiting-germano" : ""}`}>
      <header className="file-meta"><span>{file.path}</span><span>{thread.status}</span></header>
      <article className="conversation">
        <header className="conversation-header">
          <p className="conversation-kicker">Conversation</p>
          <h1>{thread.title}</h1>
          <p className="thread-status">Status: {thread.status} · Awaiting: {displayAgent(thread.awaiting)}</p>
        </header>
        {thread.entries.map((entry, index) => (
          <section className={`speaker-block speaker-${entry.agent}`} key={`${entry.timestamp}-${entry.agent}-${index}`}>
            <header><span>{displayAgent(entry.agent)}</span><time>{entry.timestamp}</time></header>
            <div className="speaker-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown></div>
          </section>
        ))}
      </article>
    </main>
  );
}

interface ChatThreadRailProps {
  threads: ChatThread[];
  selectedPath: string;
  onNavigate: (path: string) => void;
}

export function ChatThreadRail({ threads, selectedPath, onNavigate }: ChatThreadRailProps) {
  const sorted = sortChatThreads(threads);
  return (
    <aside className="context-rail chat-rail" aria-label="Chat threads">
      <div className="rail-heading"><span>Threads</span><span>{threads.length}</span></div>
      <ul>{sorted.map((thread) => (
        <li key={thread.path} className={thread.awaiting === "germano" ? "awaiting-germano" : ""}>
          <button className={thread.path === selectedPath ? "is-current" : ""} type="button" onClick={() => onNavigate(thread.path)}>
            <span>{thread.title}</span>
            <small>{thread.status} · {displayAgent(thread.awaiting)}</small>
          </button>
        </li>
      ))}</ul>
    </aside>
  );
}
