# mentat-app

A local, read-only reader for the Mentat second brain — the Markdown knowledge base at
`../mentat`.

**Status:** not built yet. See [PLAN.md](PLAN.md) for the build plan and
[BUILD-LOG.md](BUILD-LOG.md) for what has been decided along the way.

## Specification

The spec lives in the brain, not here:

    /home/gbs/repo/mentat/projects/mentat-app.md

It is authoritative. This repo does not restate it — two copies would drift. The argument
behind it is in `/home/gbs/repo/mentat/chat/app-architecture.md` (closed).

## Running it

Once built:

    npm install
    npm run dev        # http://127.0.0.1:5173

Point it at a different brain with `MENTAT_ROOT=/path/to/brain npm run dev`. It defaults to
`../mentat` and refuses to start if that directory has no `CLAUDE.md`.

## What it is not

It does not write. No editing, renaming, or deleting — not in the UI, not in the API. The
knowledge base is written by its agents and by hand; this is for reading it.
