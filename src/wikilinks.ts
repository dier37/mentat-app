interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

const WIKILINK = /\[\[([^\]]+)\]\]/g;

function splitText(node: MdNode): MdNode[] {
  const value = node.value ?? "";
  const parts: MdNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(WIKILINK)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ type: "text", value: value.slice(cursor, index) });
    const target = match[1].trim();
    parts.push({ type: "link", url: `mentat:${encodeURIComponent(target)}`, children: [{ type: "text", value: target }] });
    cursor = index + match[0].length;
  }
  if (cursor < value.length) parts.push({ type: "text", value: value.slice(cursor) });
  return parts.length > 0 ? parts : [node];
}

function transform(parent: MdNode): void {
  if (!parent.children) return;
  parent.children = parent.children.flatMap((child) => {
    WIKILINK.lastIndex = 0;
    if (child.type === "text" && WIKILINK.test(child.value ?? "")) {
      WIKILINK.lastIndex = 0;
      return splitText(child);
    }
    if (child.type !== "code" && child.type !== "inlineCode" && child.type !== "link") transform(child);
    return child;
  });
}

export function remarkWikilinks() {
  return (tree: MdNode) => transform(tree);
}

export function wikilinkTarget(href?: string): string | undefined {
  if (!href?.startsWith("mentat:")) return undefined;
  return decodeURIComponent(href.slice("mentat:".length));
}
