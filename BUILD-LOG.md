# Build Log

Decisions made during the build, and every deviation from the spec. Newest last.

Format:

    ## YYYY-MM-DD — phase N — short title
    What was decided, and why. If it departs from the spec, say which line and what
    replaced it. If a chat thread covers it, link the thread.

---

## 2026-08-22 — phase 1 — allow guarded root operations

The spec's literal `root + path.sep` prefix rule excludes the root itself, while tree,
search, and watch must operate on the root and must all use `resolveInRoot`. The guard
therefore accepts canonical root equality for the explicit relative path `.`, while empty
and whitespace paths remain invalid. This is the standard containment predicate and does
not permit access outside the root. Discussion: `mentat/chat/path-guard-root.md`.

## 2026-08-23 — phase 2 — blanket dot-entry exclusion

The Phase 1 gate exposed `.claude/` through the reader. Germano accepted blanket exclusion
for any path segment beginning with `.`, including `.gitignore`; `node_modules/` remains
explicit. The authoritative spec was corrected before implementation, so this records a
Phase 1 behavior change rather than a deviation from the current spec.
