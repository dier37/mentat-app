import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkWikilinks, wikilinkTarget } from "../wikilinks";
import type { BrainFile, LinkResult } from "../types";

interface ReaderProps {
  file?: BrainFile;
  links?: LinkResult;
  loading: boolean;
  error?: string;
  onNavigate: (path: string) => void;
}

function updatedDate(content: string): string | undefined {
  return content.match(/^Updated:\s*([^\n·]+)/m)?.[1].trim();
}

export function Reader({ file, links, loading, error, onNavigate }: ReaderProps) {
  if (error) return <main className="reading-pane state-message"><p>{error}</p></main>;
  if (!file || loading) return <main className="reading-pane state-message"><p>Reading the brain…</p></main>;
  return (
    <main className="reading-pane" key={file.path}>
      <header className="file-meta"><span>{file.path}</span><span>{updatedDate(file.content) ?? new Date(file.mtime).toLocaleDateString()}</span></header>
      <article className="article">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkWikilinks]}
          urlTransform={(url) => url.startsWith("mentat:") ? url : defaultUrlTransform(url)}
          components={{
            a({ href, children }) {
              const target = wikilinkTarget(href);
              if (!target) return <a href={href}>{children}</a>;
              const match = links?.outbound.find((link) => link.target === target);
              if (!match?.resolved) return <span className="wikilink unresolved" title="Not written yet">{children}</span>;
              if (match.ambiguous) return <span className="wikilink ambiguous" title={`Multiple matches: ${match.candidates.join(", ")}`}>{children}</span>;
              return <a className="wikilink resolved" href={`#${match.candidates[0]}`} onClick={(event) => { event.preventDefault(); onNavigate(match.candidates[0]); }}>{children}</a>;
            },
          }}
        >{file.content}</ReactMarkdown>
      </article>
    </main>
  );
}
