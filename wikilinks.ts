export interface WikilinkOccurrence {
  target: string;
  start: number;
  end: number;
}

function runLength(value: string, start: number, character: string): number {
  let end = start;
  while (value[end] === character) end += 1;
  return end - start;
}

export function extractWikilinks(markdown: string): WikilinkOccurrence[] {
  const occurrences: WikilinkOccurrence[] = [];
  let offset = 0;
  let fence: { character: string; length: number } | undefined;
  let inlineTicks = 0;

  for (const lineWithBreak of markdown.match(/.*(?:\n|$)/g) ?? []) {
    if (!lineWithBreak) continue;
    const line = lineWithBreak.endsWith("\n") ? lineWithBreak.slice(0, -1) : lineWithBreak;
    const fenceMatch = inlineTicks === 0 ? line.match(/^ {0,3}(`{3,}|~{3,})/) : null;
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) fence = { character: marker[0], length: marker.length };
      else if (marker[0] === fence.character && marker.length >= fence.length) fence = undefined;
      offset += lineWithBreak.length;
      continue;
    }
    if (fence) { offset += lineWithBreak.length; continue; }

    let index = 0;
    while (index < line.length) {
      if (line[index] === "`") {
        const length = runLength(line, index, "`");
        if (inlineTicks === 0) inlineTicks = length;
        else if (inlineTicks === length) inlineTicks = 0;
        index += length;
        continue;
      }
      if (inlineTicks === 0 && line.startsWith("[[", index)) {
        const close = line.indexOf("]]", index + 2);
        if (close >= 0) {
          const target = line.slice(index + 2, close).trim();
          if (target) occurrences.push({ target, start: offset + index, end: offset + close + 2 });
          index = close + 2;
          continue;
        }
      }
      index += 1;
    }
    offset += lineWithBreak.length;
  }
  return occurrences;
}

export function renderableWikilinks(markdown: string): string {
  const occurrences = extractWikilinks(markdown);
  let result = markdown;
  for (const occurrence of [...occurrences].reverse()) {
    const replacement = `[${occurrence.target}](mentat:${encodeURIComponent(occurrence.target)})`;
    result = result.slice(0, occurrence.start) + replacement + result.slice(occurrence.end);
  }
  return result;
}

export function wikilinkTarget(href?: string): string | undefined {
  if (!href?.startsWith("mentat:")) return undefined;
  return decodeURIComponent(href.slice("mentat:".length));
}
