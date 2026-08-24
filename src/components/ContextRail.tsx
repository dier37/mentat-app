import type { LinkResult } from "../types";

interface ContextRailProps {
  links?: LinkResult;
  onNavigate: (path: string) => void;
}

export function ContextRail({ links, onNavigate }: ContextRailProps) {
  const outbound = links?.outbound ?? [];
  const outboundGroups = [...outbound.reduce((groups, link) => {
    const existing = groups.get(link.target);
    if (existing) existing.count += 1;
    else groups.set(link.target, { link, count: 1 });
    return groups;
  }, new Map<string, { link: (typeof outbound)[number]; count: number }>()).values()];
  const inbound = links?.inbound ?? [];
  const unresolved = links?.unresolved ?? [];
  return (
    <aside className="context-rail" aria-label="Document context">
      <div className="rail-heading"><span>Context</span><span>{outbound.length + inbound.length}</span></div>
      <section className="context-section unresolved-list">
        <h2>Unresolved <span>{unresolved.length}</span></h2>
        {unresolved.length ? <ul>{unresolved.map((target) => <li key={target}>{target}</li>)}</ul> : <p>None</p>}
      </section>
      <section className="context-section">
        <h2>Inbound <span>{inbound.length}</span></h2>
        {inbound.length ? <ul>{inbound.map((path) => <li key={path}><button type="button" onClick={() => onNavigate(path)}>{path.replace(/\.md$/, "")}</button></li>)}</ul> : <p>None</p>}
      </section>
      <section className="context-section">
        <h2>Outbound <span>{outbound.length}</span></h2>
        {outboundGroups.length ? <ul>{outboundGroups.map(({ link, count }) => (
          <li key={link.target}>
            {link.candidates.length === 1
              ? <button type="button" onClick={() => onNavigate(link.candidates[0])}>{link.target}{count > 1 && <span className="link-count"> ×{count}</span>}</button>
              : link.candidates.length > 1
                ? <details><summary>{link.target}{count > 1 && <span className="link-count"> ×{count}</span>} <span>{link.candidates.length}</span></summary>{link.candidates.map((candidate) => <button key={candidate} type="button" onClick={() => onNavigate(candidate)}>{candidate}</button>)}</details>
                : <span>{link.target}{count > 1 && <span className="link-count"> ×{count}</span>}</span>}
          </li>
        ))}</ul> : <p>None</p>}
      </section>
    </aside>
  );
}
