import { useEffect, useRef, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ApiError, keepQueryAnswer } from "../api";
import type { BrainFile } from "../types";

type QueryEvent =
  | { type: "start"; session: string; model: string; tools: string[] }
  | { type: "reading"; tool: string; target: string }
  | { type: "blocked"; tool: string }
  | QueryLimits
  | { type: "text"; text: string }
  | QueryDone
  | { type: "error"; message: string };

interface QueryDone {
  type: "done";
  answer: string;
  equivalentUsd: number | null;
  durationMs: number | null;
  turns: number | null;
  denials: number;
  read: string[];
  blocked: string[];
  limits: Omit<QueryLimits, "type"> | null;
}

interface QueryLimits { type: "limits"; status: string; limitType: string; resetsAt: string | null; usingOverage: boolean; overageAvailable: boolean }

export function slugFromQuestion(question: string): string {
  return question.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64).replace(/-+$/g, "");
}

export function readableTarget(target: string): boolean {
  return target.endsWith(".md") && !target.startsWith("/") && !target.includes("*") && !target.split(/[\\/]/).some((part) => !part || part === "." || part === "..");
}

interface QueryPaneProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onKept: (file: BrainFile) => void;
}

export function QueryPane({ open, onClose, onNavigate, onKept }: QueryPaneProps) {
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState("");
  const [events, setEvents] = useState<QueryEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<QueryDone>();
  const [error, setError] = useState("");
  const [slug, setSlug] = useState("");
  const [keeping, setKeeping] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const closeStream = () => { sourceRef.current?.close(); sourceRef.current = null; };
  const dismiss = () => {
    closeStream();
    setQuestion(""); setAskedQuestion(""); setEvents([]); setRunning(false); setDone(undefined); setError(""); setSlug("");
    onClose();
  };
  useEffect(() => {
    if (!open) closeStream();
    return () => closeStream();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => inputRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { dismiss(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), textarea:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex='-1'])") ?? [])];
      if (focusable.length === 0) { event.preventDefault(); dialogRef.current?.focus(); return; }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, [open]);
  if (!open) return null;

  const ask = (event: FormEvent) => {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!nextQuestion || nextQuestion.length > 2000 || running) return;
    closeStream();
    setEvents([]); setDone(undefined); setError(""); setRunning(true);
    setAskedQuestion(nextQuestion);
    setSlug(slugFromQuestion(nextQuestion));
    const source = new EventSource(`/api/query?q=${encodeURIComponent(nextQuestion)}`);
    sourceRef.current = source;
    source.onmessage = (message) => {
      let incoming: QueryEvent;
      try { incoming = JSON.parse(message.data) as QueryEvent; }
      catch { return; }
      setEvents((current) => [...current, incoming]);
      if (incoming.type === "done") { setDone(incoming); setRunning(false); closeStream(); }
      if (incoming.type === "error") { setError(incoming.message); setRunning(false); closeStream(); }
    };
    source.onerror = () => {
      if (sourceRef.current !== source) return;
      setError("The query stream could not be opened. Try again in a moment.");
      setRunning(false); closeStream();
    };
  };

  const keep = async () => {
    if (!done || !slug || keeping) return;
    setKeeping(true); setError("");
    try {
      const created = await keepQueryAnswer({ slug, question: askedQuestion, answer: done.answer, read: done.read, equivalentUsd: done.equivalentUsd, durationMs: done.durationMs, turns: done.turns });
      setQuestion(""); setAskedQuestion(""); setEvents([]); setDone(undefined); setSlug("");
      onKept(created);
    } catch (reason) {
      setError(reason instanceof ApiError && reason.status === 409 ? "That output name is taken. Choose another slug." : reason instanceof Error ? reason.message : "The answer could not be kept.");
    } finally { setKeeping(false); }
  };

  const trace = events.filter((item) => item.type === "reading" || item.type === "blocked") as Array<Extract<QueryEvent, { type: "reading" | "blocked" }>>;
  const limits = events.filter((item): item is QueryLimits => item.type === "limits").at(-1);
  const limitWarning = limits && (limits.status !== "allowed" || limits.usingOverage);
  return (
    <div className="query-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <section ref={dialogRef} className="query-pane" role="dialog" aria-modal="true" aria-label="Ask the wiki" tabIndex={-1}>
        <header className="query-header"><div><span>Query</span><small>Ask the wiki, then keep only what matters.</small></div><button type="button" onClick={dismiss}>Close</button></header>
        <form className="query-form" onSubmit={ask}>
          <label htmlFor="wiki-question">Question</label>
          <textarea ref={inputRef} id="wiki-question" value={question} maxLength={2000} rows={3} onChange={(event) => { setQuestion(event.target.value); if (done) { setDone(undefined); setEvents([]); setError(""); } }} disabled={running} placeholder="What does the brain know about…?" />
          <div><small>{question.length} / 2000</small><button type="submit" disabled={!question.trim() || running}>{running ? "Reading…" : "Ask"}</button></div>
        </form>
        {(running || trace.length > 0) && <section className="query-trace" aria-live="polite"><h2>{running ? "Reading now" : "Read trace"}</h2><ol>{trace.map((item, index) => <li key={`${item.type}-${index}`}>{item.type === "blocked" ? <><strong>Blocked</strong> {item.tool}</> : <><strong>{item.tool}</strong> {readableTarget(item.target) ? <button type="button" onClick={() => { dismiss(); onNavigate(item.target); }}>{item.target}</button> : <span>{item.target}</span>}</>}</li>)}</ol>{running && <p className="query-wait">Building the answer from these sources…</p>}</section>}
        {limitWarning && <p className="query-limit" role="status">Five-hour limit: {limits.status}{limits.resetsAt ? ` · resets ${new Date(limits.resetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}{limits.usingOverage ? " · using overage" : ""}</p>}
        {done && <section className="query-result"><div className="query-metrics"><span>{done.turns ?? "—"} turns</span><span>{done.durationMs === null ? "—" : `${(done.durationMs / 1000).toFixed(1)}s`}</span><span title="Equivalent API-rate cost; the subscription is not billed this amount">{done.equivalentUsd === null ? "—" : `~$${done.equivalentUsd.toFixed(4)} API equivalent`}</span></div><div className="article query-answer"><ReactMarkdown remarkPlugins={[remarkGfm]}>{done.answer}</ReactMarkdown></div><div className="keep-answer"><label htmlFor="output-slug">Keep in outputs/</label><div><input id="output-slug" value={slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" onChange={(event) => setSlug(event.target.value)} aria-label="Output slug" /><span>.md</span><button type="button" disabled={!slug || keeping} onClick={() => void keep()}>{keeping ? "Keeping…" : "Keep"}</button></div></div></section>}
        {error && <p className="query-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}
