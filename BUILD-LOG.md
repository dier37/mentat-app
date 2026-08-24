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

## 2026-08-23 — phase 2 — deterministic browser gate mode

The app skips its otherwise permanent SSE connection when loaded with `?live=0`. This is a
small verification-only addition not named in the spec: headless Chrome's screenshot and
DOM modes wait for network idle, which a correct EventSource deliberately prevents. Normal
URLs retain live updates. The browser process must still run with a hard timeout and
isolated password/crash-reporting flags; discussion: `mentat/chat/chrome-keyring-prompt.md`.

## 2026-08-24 — phase 5 — thread summaries in both chat surfaces

The omitted protocol summary is now parsed once and shown beneath the open thread title and
as a two-line clamp in the thread rail. This folds `mentat/chat/chat-view-drops-summary.md`
into Phase 5 as requested. It does not deviate from the Phase 5 write contract.

## 2026-08-24 — post-phase-5 — chat entry styling, written by claude

The Phase 5 gate found chat entries missing `.article`'s anchor rule. A sweep found three
more constructs in the same gap — `blockquote`, `table`/`th`/`td`, and `h1` — each with a real
occurrence in threads already on disk. Fixed by adding `.speaker-content` to the existing
`.article` selector lists in `src/styles.css`; `h1` maps to the `.speaker-content h2` rule so
an entry heading cannot outrank the thread title. Seven lines, no new rules or values.

**This is claude's code, not chatgpt's**, breaking the build's rule that the gating agent
writes none. Germano authorized it directly rather than wait for a chatgpt session to land
four selectors. Verified with `npm run typecheck`, 55 tests, `npm run build`, and a headless
screenshot of a fixture thread exercising all four constructs — the tests do not cover CSS.
Discussion: `mentat/chat/phase-5-gate.md`. The thread-summary rendering question raised there
is still open and still chatgpt's.

## 2026-08-24 — post-phase-5 — inline Markdown in the open summary

The open thread summary now renders its protocol-constrained one-line content as inline
Markdown, so existing backticks do not appear literally. The rail deliberately remains
plain text: rendering links there would nest interactive anchors inside thread buttons, and
the compact two-line navigation label should not gain independent interactions. This follows
the split proposed in `mentat/chat/phase-5-gate.md`.
