import { useState, type FormEvent } from "react";
import { ApiError, createThread, replyToThread } from "../api";
import type { BrainFile } from "../types";

type Awaiting = "claude" | "chatgpt" | "nobody";

export function routeDraft(body: string): { awaiting: Awaiting; label: string; valid: boolean } {
  const thufir = /(^|\s)#thufir\b/i.test(body);
  const teg = /(^|\s)#teg\b/i.test(body);
  if (thufir && teg) return { awaiting: "nobody", label: "Choose one turn tag", valid: false };
  if (thufir) return { awaiting: "claude", label: "Passes the turn to Thufir · watched", valid: true };
  if (teg) return { awaiting: "chatgpt", label: "Queues for Teg", valid: true };
  return { awaiting: "nobody", label: "Leaves the thread idle", valid: true };
}

interface ReplyComposerProps {
  file: BrainFile;
  onUpdated: (file: BrainFile) => void;
}

export function ReplyComposer({ file, onUpdated }: ReplyComposerProps) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const route = routeDraft(draft);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || !route.valid || sending) return;
    setSending(true);
    setNotice("");
    try {
      const updated = await replyToThread({ thread: file.path, body: draft, awaiting: route.awaiting, version: file.version });
      onUpdated(updated);
      setDraft("");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const current = (error.payload as { current?: BrainFile } | undefined)?.current;
        if (current) onUpdated(current);
        setNotice("The thread changed. Review the new entry, then send your draft again.");
      } else setNotice(error instanceof Error ? error.message : "The reply could not be posted.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="reply-composer" onSubmit={submit}>
      <label htmlFor="thread-reply">Reply as Germano</label>
      <textarea id="thread-reply" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a reply. Add #thufir or #teg to pass the turn." rows={6} />
      <div className="composer-footer">
        <span className={route.valid ? "route-preview" : "route-preview invalid"}>{route.label}</span>
        <button type="submit" disabled={!draft.trim() || !route.valid || sending}>{sending ? "Posting…" : "Post reply"}</button>
      </div>
      {notice && <p className="composer-notice" role="status">{notice}</p>}
    </form>
  );
}

interface NewThreadComposerProps {
  open: boolean;
  onClose: () => void;
  onCreated: (file: BrainFile) => void;
}

export function NewThreadComposer({ open, onClose, onCreated }: NewThreadComposerProps) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const route = routeDraft(body);
  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !slug.trim() || !summary.trim() || !body.trim() || !route.valid || sending) return;
    setSending(true);
    setNotice("");
    try {
      const created = await createThread({ slug, title, summary, body, awaiting: route.awaiting });
      onCreated(created);
      setTitle(""); setSlug(""); setSummary(""); setBody("");
      onClose();
    } catch (error) {
      setNotice(error instanceof ApiError && error.status === 409 ? "That thread already exists. Choose another slug." : error instanceof Error ? error.message : "The thread could not be created.");
    } finally { setSending(false); }
  };

  return (
    <div className="palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="new-thread-composer" role="dialog" aria-modal="true" aria-label="Start a thread" onSubmit={submit}>
        <header><span>New thread</span><button type="button" onClick={onClose}>Close</button></header>
        <label htmlFor="thread-title">Title</label>
        <input id="thread-title" required value={title} onChange={(event) => { const value = event.target.value; setTitle(value); setSlug(value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} />
        <label htmlFor="thread-slug">Slug</label>
        <input id="thread-slug" required value={slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" onChange={(event) => setSlug(event.target.value)} />
        <label htmlFor="thread-summary">One-line summary</label>
        <input id="thread-summary" required value={summary} onChange={(event) => setSummary(event.target.value)} />
        <label htmlFor="thread-opening">Opening message</label>
        <textarea id="thread-opening" required value={body} onChange={(event) => setBody(event.target.value)} rows={8} placeholder="Add #thufir or #teg to pass the turn." />
        <div className="composer-footer"><span className={route.valid ? "route-preview" : "route-preview invalid"}>{route.label}</span><button type="submit" disabled={sending || !route.valid || !title.trim() || !slug.trim() || !summary.trim() || !body.trim()}>{sending ? "Creating…" : "Start thread"}</button></div>
        {notice && <p className="composer-notice" role="status">{notice}</p>}
      </form>
    </div>
  );
}
