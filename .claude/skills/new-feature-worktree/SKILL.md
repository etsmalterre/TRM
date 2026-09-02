# New Feature Worktree Skill (TRM)

## When to use

Invoke with `/new-feature-worktree <feature-name>` to start work on a new **TRM**
screen/feature in an isolated git worktree with its own web dev server on a dedicated
port slot. Run this from the **TRM main checkout** (`C:\dev\etsmalterre\TRM`,
which stays on `master`). Up to 6 TRM worktrees can run at once.

`<feature-name>` is kebab-case (e.g. `ref-tm`). It produces:
- branch `feat/<feature-name>`, worktree dir `../TRM-<feature-name>`
- lowest free slot N (1–6) → web on `517N` (no API of its own)

**A TRM worktree can never take an ETM worktree's port.** The two projects own disjoint
ranges (`PROJECTS` in `ETM/scripts/worktree/lib.mjs`): ETM = web `3000–3006` + API
`8080–8086`, TRM = web `5171–5176` only. TRM slot 1 and ETM slot 1 coexist. On top of
that, `allocateSlot()` skips any slot whose port is *actually* listening, even if the
registry has no entry for it — so an orphan or a manual `pnpm dev` can't be clobbered
either. No need to check ETM's slots before running this.

One real overlap to know about: **slot 5 is web `5175`, which is also the TRM main
checkout's own `pnpm dev` default** (see the repo's Quick Start). The port probe means a
running `pnpm dev` just makes the script skip slot 5; the reverse is not protected — if
slot 5 is allocated, `pnpm dev` in the main checkout finds `5175` busy and Vite picks
another port. Serve the main checkout from a worktree, or free slot 5 first.

**TRM is web-only.** Its web server talks to an **MPS API over HTTP**. By default
it targets the slot-0 master MPS API on `:8080`. To point it at a different MPS API
(e.g. a running NG worktree's `808N`), pass `--api <port>`.

> The worktree tooling (the `up.mjs`/`down.mjs`/`status.mjs` scripts + the shared registry)
> lives in the sibling **ETM** checkout — there is a single copy so the two projects
> never drift. This skill just calls it. The script **auto-detects the project from the
> repo you run it in**, so from the TRM checkout it defaults to a TRM worktree; you do
> not pass `trm` explicitly. (Pass `ng` only if you deliberately want an NG worktree.)

## Prerequisite: the ETM master API must be running

A TRM worktree's web server needs an MPS API on `:8080`. Start it once from an **ETM**
session with `/serve-main` (it serves master on API `8080` / web `3000`). If it isn't up,
the TRM worktree still launches but every screen shows
**« Impossible de charger la liste. Vérifiez que l'API est accessible. »**

This is not only a spin-up concern: the worktree's web server is detached and outlives
sessions, but the `:8080` API has its own independent lifetime — the same banner can appear
days later. Whenever you see it, check the API first — and check **who** answers, not just
that something does:
```bash
curl -s http://localhost:8080/api/health     # must contain "app":"MPS API"
```
⚠️ **A port that answers is not the MPS API.** On 2026-09-02 `:8080` was held by the
**MFPROD API** (another project on this workstation): `/api/health` was a 200, cookie auth
failed on every screen, and the old script printed « reachable » plus a CORS rejection that
read like a `CORS_ORIGIN` bug. `up.mjs` now probes identity (`probeApiIdentity`) and, when
no `--api` is given, **falls back by itself to `:8087`** if the MPS API answers there
(`MAIN_API_FALLBACK_PORTS` in `lib.mjs`) — the summary line says which port it chose. When
neither port is the MPS API, start it on the fallback port and never kill the stranger:
```powershell
cd C:\dev\etsmalterre\ETM\apps\api; $env:PORT='8087'; pnpm dev
```
(`/serve-main` refuses slot 0 outright when `:8080` is foreign, with the same instruction.)
Note the ports 5171–5176 are all already in the API's `CORS_ORIGIN` — the web port is
never the cause of this banner.

## Steps

1. **Validate the argument.** If no feature name was given, ask for one. It must match
   `^[a-z0-9][a-z0-9-]*$` (kebab-case). Reject names with spaces/uppercase/slashes.

2. **Run the spin-up script** (hosted in ETM) from the TRM main checkout:
   ```bash
   node C:/dev/etsmalterre/ETM/scripts/worktree/up.mjs <feature-name> [--api <port>]
   ```
   Run from the TRM checkout, it defaults to a TRM worktree: fetches origin, allocates
   a free TRM slot, creates the worktree off `origin/master`, `pnpm install`, writes
   `apps/web/.env.development.local` (`VITE_API_URL` → the chosen MPS API + the tab
   label), and starts the web dev server (`dev:517N`) detached. Logs →
   `<worktree>/.dev-logs/`; slot + PID recorded in the shared registry.

3. **Read the script's summary** (project, slot, branch, worktree path, web URL, log path).
   If it reports the web server "NOT UP", tail the log before declaring success:
   ```bash
   tail -n 40 ../TRM-<feature-name>/.dev-logs/web.log
   ```
   If it says the MPS API isn't reachable, start it (see the Prerequisite section) — the
   TRM web will show the « Impossible de charger la liste » banner until then.

4. **Report to the user** the worktree path, the web URL (`http://localhost:517N`), and the
   slot number. Tell them to **open a new Claude Code session in the worktree directory** to
   do the screen work — that session has `/feature-checkpoint` (sync) and `/feature-complete`
   (land) available.

## Feature needs shared-API changes? → paired NG worktree

TRM has no API; its endpoints live in the **MPS API**. If this feature needs new or
modified endpoints, do NOT edit the ETM main checkout (it's the integration tree).
Instead create a **pair of worktrees** with the same feature name:

```bash
# 1. NG worktree for the API changes (run from the ETM checkout, or pass `ng`):
node C:/dev/etsmalterre/ETM/scripts/worktree/up.mjs <feature-name> ng        # → API on 808N
# 2. TRM worktree pointed at that API:
node C:/dev/etsmalterre/ETM/scripts/worktree/up.mjs <feature-name> --api 808N
```

Work on the API in the NG worktree session and the screen in the TRM worktree session
(or one session, editing the sibling worktree by path). **Landing order**: NG branch first
(`/feature-complete` in the NG worktree), then the TRM branch. Deploys stay per-repo:
`/etm_deploy` ships the API, `/trm_deploy` ships the web. Full rule in
`ETM/claude_doc/worktrees.md` §"Shared-API changes".

## Notes / failure modes

- "All 6 TRM worktree slots are in use" → run `/worktree-status`; finish or tear one
  down before creating another.
- "Branch already exists" / "Worktree dir already exists" → the script aborts to avoid
  clobbering in-progress work. Pick a different name, or clean up the old one with
  `/feature-complete` (if mergeable) or the down script (see below).
- The dev server is **detached** — it keeps running after this Claude session ends. It is
  stopped by `/feature-complete`, or manually:
  `node C:/dev/etsmalterre/ETM/scripts/worktree/down.mjs <name> --remove`.
- Do NOT do feature work in the main checkout; it is the integration tree on `master`.
