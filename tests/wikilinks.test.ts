import { describe, expect, it } from "vitest";
import { extractWikilinks, renderableWikilinks } from "../wikilinks";

const markdown = [
  "Before [[alpha]] and [[missing]].",
  "",
  "| Link |",
  "|---|",
  "| [[table-link]] |",
  "",
  "`[[inline-code]]` after [[near-code]].",
  "",
  "```md",
  "[[fenced-code]]",
  "```",
].join("\n");

describe("shared wikilink extraction", () => {
  it("finds prose and table links while excluding inline and fenced code", () => {
    expect(extractWikilinks(markdown).map((link) => link.target)).toEqual(["alpha", "missing", "table-link", "near-code"]);
  });

  it("uses the same occurrences to prepare renderable Markdown", () => {
    const rendered = renderableWikilinks(markdown);
    expect(rendered).toContain("[alpha](mentat:alpha)");
    expect(rendered).toContain("[table-link](mentat:table-link)");
    expect(rendered).toContain("`[[inline-code]]`");
    expect(rendered).toContain("[[fenced-code]]");
  });
});
