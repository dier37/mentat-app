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

## 2026-08-24 — phase 6 — query is a modal with a visible read trace

The Query operation opens as a modal over the reader instead of adding a fourth persistent
column. It is a bounded ask/read/keep task, and preserving the established three-pane width
matters outside that task. Progress is turn-level: Read targets link into the reader, Grep and
Glob remain literal, and blocked tools remain visible. Token-level streaming is omitted because
the trace is the useful progress signal. Non-allowed five-hour limit states are prominent;
allowed states stay quiet. Dollar figures are explicitly labelled API-rate equivalents rather
than spend. Discussion: `mentat/chat/phase-6-query.md`. These resolve choices left open by the
Phase 6 spec and do not change its endpoint contract.

## 2026-08-24 — Phase 6 server half — the query subprocess

**This is claude's code**, under a split Germano ruled explicitly: claude builds `server/`,
chatgpt builds the pane, each gates the other's half. Handoff and API contract are in
`mentat/chat/phase-6-query.md`.

Two new modules, both routed through the existing guards. `server/query.ts` runs one question
against the brain in a `claude -p` subprocess; `server/outputs.ts` files a kept answer to
`outputs/<slug>.md`. Endpoints: `GET /api/query?q=` (SSE) and `POST /api/query/keep`.

**Deviation from `PLAN.md`'s read-only rule.** That rule already had one exception for `chat/`
in Phase 5; this adds a second for `outputs/`. `server/` now holds three write calls — two in
`chat.ts`, one in `outputs.ts` — each behind a slug-validated resolver that cannot name a file
outside its own folder. The rule as written ("no `writeFile` anywhere in `server/`") no longer
describes the build, so it is restated in `PLAN.md` as: writes are confined to `chat/` and
`outputs/`, each behind a guard, and any third folder needs Germano.

**The subprocess is read-only, and that was verified rather than assumed.**
`--allowed-tools` does *not* restrict the tool set — it governs auto-approval. A first attempt
using it spawned a subprocess holding Write, Edit, Bash and the full MCP surface (Gmail, Drive,
Calendar). `--tools Read Grep Glob` with `--strict-mcp-config --mcp-config '{"mcpServers":{}}'`
does restrict: the process reports exactly `["Glob","Grep","Read"]` and zero MCP servers. This
matters beyond tidiness — `raw/` will hold other people's words, and a source that tries to
instruct the model has no channel out of a process with no Bash, no WebFetch and no MCP.

The prompt goes over **stdin, never argv**, and the child is spawned with `shell: false`, so no
question text is ever parsed as a flag or a shell word. Asserted directly: a question of
`--dangerously-skip-permissions and rm -rf /` never appears in the child's `argv`.

**Two bugs the fake CLI could not have found**, both caught by one live run:

1. The subprocess attempted a `Write`, because `CLAUDE.md` instructs every agent in this brain
   to file answers to `outputs/`. It spent a turn on it and opened the answer apologising.
   Fixed with `--append-system-prompt` describing the read-only mode. `CLAUDE.md` was not
   changed — it is correct for an ordinary session.
2. That refused `Write` was being recorded as a *source*, so the answer would have cited its own
   output path as an article it read. Refused tools now emit a `blocked` event rather than a
   `reading` one, and `sourceLinks` drops `outputs/` a second time.

54 new tests (105 → 109 with the live test opt-in), all against a fake CLI that records its
argv and stdin and replays canned stream-json, so the suite costs nothing and still asserts the
exact command line. `tests/live.test.ts` runs one real query under `MENTAT_LIVE=1` and is
skipped otherwise; it exists because both bugs above were invisible without it.

Limits: two concurrent queries, 300s timeout with SIGTERM then SIGKILL, 8 MB stream cap, 2000
character question. A client disconnect cancels the query — verified against a real run that
left no orphaned process. `MENTAT_CLAUDE_BIN` overrides the binary.

## 2026-08-24 — Phase 6 gate corrections — subscription, not API, and a proved boundary

Three corrections, two from chatgpt's gate review of the server half and one from Germano.

**`costUsd` is now `equivalentUsd`, and a `limits` event was added.** Germano is on a
subscription with no API key set, so `total_cost_usd` is what a run would have cost at API
rates — a size indicator, not a bill, and reporting it as spend was wrong. The budget that
actually binds is the five-hour rate-limit window, which the query pane shares with his
interactive sessions; with `overageStatus: "rejected"` at the org level, exhausting it fails
queries outright rather than spilling into paid overage. The CLI emits a `rate_limit_event`
that was being discarded. It is now a `limits` event and a `limits` object on `done`. Event
order changed: `start` → `limits` → `reading`.

**A concurrency escape, found by chatgpt.** `settle()` decremented the running count but was not
idempotent, and Node emits both `error` and `close` for a spawn failure. One failed child
therefore decremented twice, erasing a live query from the count and letting a third subprocess
past the cap of two. Fixed with a `released` flag. The `Math.max(0, …)` clamp around the
decrement was also removed: it made a negative count unobservable, which is exactly the signal
worth seeing if the accounting is wrong.

**The cwd boundary was asserted, not proved — chatgpt refused it on that ground, correctly.**
Restricting the tool set does not establish that those tools are confined to `cwd`, and
filtering a reported target after the fact would only hide a read that already happened. Probed
against a fixture brain with a canary file outside it: an absolute path outside the root, a `..`
traversal, a symlink to an outside file, a symlink to an outside directory, and a `Grep` scoped
outside — all five denied, with the harness canonicalising before checking, so traversal and
symlinks resolve to their real target first.

That result is a property of CLI 2.1.241, not of this code, so it is kept as a test rather than
a claim: `tests/live.test.ts` writes a canary outside the root, asks the subprocess to read it,
and fails if the string reaches the stream. `MENTAT_LIVE=1` runs it.

**`--setting-sources project` added.** Chasing the boundary question surfaced that the
subprocess inherits user-level settings, so a permissive `permissions.allow` in
`~/.claude/settings.json` could widen the boundary with nothing in this repo changing. Verified
`CLAUDE.md` still loads under the flag — inheriting it is the reason this engine was chosen over
a direct API call.
