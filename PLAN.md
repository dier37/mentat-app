# Build Plan — mentat-app

For the agent implementing this app (**chatgpt**). Claude scaffolded this repo, reviews each
phase, and does not write application code.

## Before you start

1. Read the specification: **`/home/gbs/repo/mentat/projects/mentat-app.md`**. It is
   authoritative and this plan does not restate it. Where the two disagree, the spec wins —
   and tell Claude, because that means this plan has a bug.
2. Read `/home/gbs/repo/mentat/CLAUDE.md` for what the data actually is.
3. Read `/home/gbs/repo/mentat/chat/README.md` for the thread protocol. You will need it.
4. Skim `/home/gbs/repo/mentat/chat/app-architecture.md` — the closed thread where this spec
   was argued out. Your own four findings are in it; they are already incorporated.

Toolchain here: Node v20.19.3, npm 10.8.2. **Pin Vite 7.x** — Node 20.19.3 clears its floor
(`^20.19.0`) by a hair, and a resolution that bumps the requirement breaks the build.

## The four phases

Each ends at a gate. Claude verifies against the spec's numbered acceptance criteria before
you start the next. A failed gate comes back with specifics — not a rewrite request.

Work in phase order. Do not start UI while the guard is unverified.

### Phase 1 — Server modules and the path guard

The security-critical layer, built and tested before any UI exists.

- `server/paths.ts` — `resolveInRoot(root, relPath)`, the single guard. Three steps in the
  order the spec gives: syntactic rejection before touching disk → `path.resolve` + ordinal
  prefix check → `fs.realpath` + re-check when the target exists. It returns an absolute
  path inside the root or throws. There is no third outcome.
- `server/tree.ts`, `file.ts`, `search.ts`, `links.ts`, `watch.ts` — every one routes
  through `resolveInRoot`. No endpoint gets its own approximation of the check; that is how
  one of them ends up subtly weaker than the rest.
- `server/root.ts` — resolve `MENTAT_ROOT` (default `../mentat`), fail loudly at startup if
  the directory is missing or has no `CLAUDE.md`.
- `vite.config.ts` — plugin wiring only, via `configureServer`. No logic in this file. Bind
  `127.0.0.1`.
- `tests/` — both layers. Unit tests against `resolveInRoot` directly, and HTTP tests
  through the middleware using wire-form attacks (`%2e%2e%2f`, double-encoded, repeated
  `?path=`, missing param). The second layer is not optional: by the time a module sees a
  string, `URLSearchParams` has decoded it, so a unit test given `%2e%2e%2f` proves nothing
  about what the middleware passes. Also assert `tree`, `search`, and `links` each reject an
  out-of-root path.

**Gate:** AC 2, 11, 12, plus `curl` against the real brain returning sane JSON.

### Phase 2 — Shell, tree, reading pane

- Three-pane layout at the specified widths. Vite + React + TS.
- Tree from `/api/tree`: mono, collapsible, fuzzy filter, `--sapho` left bar on the current
  file, `raw/` visually recessed.
- Reading pane: `react-markdown` + `remark-gfm`, Newsreader 18px/1.62, 68ch measure. The
  `>` line at the top of every file in this brain is a standfirst — style it as one, not as
  a quote box.
- `[[wikilink]]` transform before render. Resolved: solid underline, clickable. Unresolved:
  dashed, dim, **inert**, title "Not written yet". Do not offer to create the file.
- SSE client on `/api/events`. Open file re-renders, tree updates, no prompt or banner.

**Gate:** AC 1, 3, 4, 9.

### Phase 3 — Gutter, context rail, search

- **The link gutter.** Positions come from *rendered geometry* — measure each link element's
  offset within the reading pane after layout, recompute on `ResizeObserver` and
  `document.fonts.ready`. Never source line numbers. There is no proportional fallback; it
  was cut deliberately because a mark that looks precise while being approximate is worse
  than no mark. Marks within 4px merge, mixed groups render hollow, unresolved marks are not
  clickable, and the gutter is `aria-hidden="true"` since it duplicates links already
  reachable inline and in the rail.
- Context rail: inbound / outbound / unresolved with counts. Give unresolved the most weight
  — they are the actionable ones.
- `Cmd/Ctrl+K` palette: filename matches first, then content matches with the matched line
  as context. Arrow keys and Enter.

**Gate:** AC 5, 6, 7, 8 — and specifically: resize the window, confirm marks re-align,
including links inside tables.

You argued for cutting this feature and were overruled by Germano. Build it as specified;
the rendered-geometry approach exists because your critique of line alignment was correct.

### Phase 4 — Chat view and design pass

- Chat view over `chat/*.md`, excluding `README.md` and `meta/`. Parse entries from
  `## YYYY-MM-DD HH:MM UTC — <agent>` headers into speaker blocks with per-agent left rules.
  `--sapho` for anything awaiting Germano. Sort threads by turn, `Awaiting: germano` first.
- Design pass against the spec's direction section: one accent rationed to three uses, six
  type sizes, the single 120ms crossfade with staggered gutter marks,
  `prefers-reduced-motion` honoured.
- Quality floor: keyboard-navigable throughout, visible focus rings, WCAG AA, single column
  under 900px, no jank on a 5,000-line file.

**Gate:** AC 10, plus a design review against the direction.

### Phase 5 — Writing back to chat

Added 2026-08-23 by Germano's ruling. **Do not start this before Phase 4 is gated.**

The read-only seam you predicted bit within a day: the chat view brings Germano to a ruling
and cannot let him make it. This builds the narrow fix you named in advance — a
protocol-aware reply action, not general editing.

Scope: `chat/` only. Reply to a thread, start a thread, and `#thufir` / `#teg` to pass the
turn. Nothing else in the brain becomes writable. Full design is in the spec under
**Phase 5 — Writing back**, including the endpoints, the `resolveChatThread` write guard,
the 409 behaviour, and the gate.

One disagreement to settle in a thread before you build it: you predicted this seam would be
the event justifying the deferred .NET service. I do not think it is — a guarded append is
about forty lines, and the backend question is about running standalone rather than about
writes. Argue it if you still hold the position.

## Rules for the build

- **Read-only is a rule, not a default.** No `writeFile`, `rename`, `unlink`, or `mkdir`
  against the data root anywhere in `server/`. Claude greps for these at every gate.
- **Ask before adding a dependency** beyond the spec's list. A component library in
  particular would undo the entire design direction.
- **Keep `server/` free of Vite imports.** It is the part that outlives this architecture.
- **The design direction is specification, not a mood board.** If you reach for a gradient,
  a second accent colour, or a rounded card, stop and ask.

## When you hit an ambiguity

Open a thread in `/home/gbs/repo/mentat/chat/` per that folder's README — one file per
question, UTC-timestamped entry, `Awaiting: claude` for build questions or
`Awaiting: germano` for scope. Then **carry on with unblocked work**; do not stall the phase
waiting for an answer.

Append every deviation from the spec to `BUILD-LOG.md`, whether or not you asked about it
first. A decision that is not in that file did not happen.

## Your access

Write: this repo, and `/home/gbs/repo/mentat/chat/` in the brain.
Read: the rest of the brain — you need to see real data shapes, and the app reads that tree.
Never write anywhere else in the brain. Claude files decisions into `decisions.md`, not you.
