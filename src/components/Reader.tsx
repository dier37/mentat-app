import { useLayoutEffect, useRef } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { renderableWikilinks, wikilinkTarget } from "../../wikilinks";
import type { BrainFile, GutterMark, LinkResult } from "../types";

interface ReaderProps {
  file?: BrainFile;
  links?: LinkResult;
  loading: boolean;
  error?: string;
  onNavigate: (path: string) => void;
  onMarks: (marks: GutterMark[]) => void;
}

function updatedDate(content: string): string | undefined {
  return content.match(/^Updated:\s*([^\n·]+)/m)?.[1].trim();
}

export function Reader({ file, links, loading, error, onNavigate, onMarks }: ReaderProps) {
  const paneRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!pane || !file || loading) { onMarks([]); return; }
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const paneTop = pane.getBoundingClientRect().top;
        const elements = [...pane.querySelectorAll<HTMLElement>("[data-wikilink]")];
        const raw = elements.map((element, index): GutterMark => {
          element.dataset.wikilinkIndex = String(index);
          const target = element.dataset.wikilink ?? "";
          const match = links?.outbound.find((link) => link.target === target);
          return {
            top: element.getBoundingClientRect().top - paneTop,
            height: 4,
            resolved: Boolean(match?.resolved && !match.ambiguous),
            target: match?.candidates.length === 1 ? match.candidates[0] : undefined,
            indexes: [index],
          };
        });
        const merged: GutterMark[] = [];
        for (const mark of raw) {
          const previous = merged.at(-1);
          if (previous && Math.abs(mark.top - previous.top) < 4) {
            previous.height += 3;
            previous.resolved = previous.resolved && mark.resolved;
            previous.target = previous.resolved ? previous.target : undefined;
            previous.indexes.push(...mark.indexes);
          } else merged.push(mark);
        }
        onMarks(merged);
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    measure();
    void document.fonts?.ready.then(measure);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [file, links, loading, onMarks]);

  if (error) return <main className="reading-pane state-message"><p>{error}</p></main>;
  if (!file || loading) return <main className="reading-pane state-message"><p>Reading the brain…</p></main>;
  return (
    <main ref={paneRef} className="reading-pane" key={file.path}>
      <header className="file-meta"><span>{file.path}</span><span>{updatedDate(file.content) ?? new Date(file.mtime).toLocaleDateString()}</span></header>
      <article className="article">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={(url) => url.startsWith("mentat:") ? url : defaultUrlTransform(url)}
          components={{
            a({ href, children }) {
              const target = wikilinkTarget(href);
              if (!target) return <a href={href}>{children}</a>;
              const match = links?.outbound.find((link) => link.target === target);
              if (!match?.resolved) return <span className="wikilink unresolved" data-wikilink={target} title="Not written yet">{children}</span>;
              if (match.ambiguous) return <span className="wikilink ambiguous" data-wikilink={target} title={`Multiple matches: ${match.candidates.join(", ")}`}>{children}</span>;
              return <a className="wikilink resolved" data-wikilink={target} href={`?path=${encodeURIComponent(match.candidates[0])}`} onClick={(event) => { event.preventDefault(); onNavigate(match.candidates[0]); }}>{children}</a>;
            },
          }}
        >{renderableWikilinks(file.content)}</ReactMarkdown>
      </article>
    </main>
  );
}
