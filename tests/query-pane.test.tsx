import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueryPane, readableTarget, slugFromQuestion } from "../src/components/QueryPane";

describe("query pane", () => {
  it("builds safe, useful default output slugs", () => {
    expect(slugFromQuestion("Should I renew the Talo lease?")).toBe("should-i-renew-the-talo-lease");
    expect(slugFromQuestion("  Café / costs  ")).toBe("caf-costs");
    expect(slugFromQuestion("?".repeat(20))).toBe("");
    expect(slugFromQuestion("a".repeat(100))).toHaveLength(64);
  });

  it("links only direct relative Markdown read targets", () => {
    expect(readableTarget("wiki/concepts/housing.md")).toBe(true);
    for (const target of ["/etc/passwd.md", "../outside.md", "wiki/**/*.md", "/lease/", "wiki/"]) {
      expect(readableTarget(target)).toBe(false);
    }
  });

  it("renders a labelled, keyboard-focusable query form", () => {
    const markup = renderToStaticMarkup(<QueryPane open onClose={() => undefined} onNavigate={() => undefined} onKept={() => undefined} />);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('id="wiki-question"');
    expect(markup).toContain("Ask the wiki");
    expect(markup).toContain("keep only what matters");
  });
});
