# New Feature Worktree Skill (TRM)

## When to use

Invoke with `/new-feature-worktree <feature-name>` to start work on a new **TRM**
screen/feature in an isolated git worktree with its own web dev server on a dedicated
port slot. Run this from the **TRM main checkout** (`C:\dev\etsmalterre\TRM`,
which stays on `master`). Up to 6 TRM worktrees can run at once.

`<feature-name>` is kebab-case (e.g. `ref-tm`). It produces:
- branch `feat/<feature-name>`, worktree dir `../TRM-<feature-name>`
- lowest free slot N (1–6) → web on `517N` (no API of its own)

**TRM is web-only.** Its web server talks to an **ETM API over HTTP**. By default
it targets the slot-0 master ETM API on `:8080`. To point it at a different ETM API
(e.g. a running NG worktree's `808N`), pass `--api <port>`.

> The worktree tooling (the `up.mjs`/`down.mjs`/`status.mjs` scripts + the shared registry)
> lives in the sibling **ETM** checkout — there is a single copy so the two projects
> never drift. This skill just calls it. The script **auto-detects the project from the
> repo you run it in**, so from the TRM checkout it defaults to a TRM worktree; you do
> not pass `trm` explicitly. (Pass `ng` only if you deliberately want an NG worktree.)

## Prerequisite: the ETM master API must be running

A TRM worktree's web server needs an ETM API on `:8080`. Start it once from an **ETM**
session with `/serve-main` (it serves master on API `8080` / web `3000`). If it isn't up,
the TRM worktree still launches but every screen shows
**« Impossible de charger la liste. Vérifiez que l'API est accessible. »**

This is not only a spin-up concern: the worktree's web server is detached and outlives
sessions, but the `:8080` API has its own independent lifetime — the same banner can appear
days later. Whenever you see it, check the API first:
```powershell
Test-NetConnection localhost -Port 8080 -InformationLevel Quiet
```
If it's down and no ETM session is around for `/serve-main`, starting it directly works:
`cd C:\dev\etsmalterre\ETM\apps\api && pnpm dev` (verify `/api/health` returns 200).
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
   `apps/web/.env.development.local` (`VITE_API_URL` → the chosen ETM API + the tab
   label), and starts the web dev server (`dev:517N`) detached. Logs →
   `<worktree>/.dev-logs/`; slot + PID recorded in the shared registry.

3. **Read the script's summary** (project, slot, branch, worktree path, web URL, log path).
   If it reports the web server "NOT UP", tail the log before declaring success:
   ```bash
   tail -n 40 ../TRM-<feature-name>/.dev-logs/web.log
   ```
   If it says the ETM API isn't reachable, start it (see the Prerequisite section) — the
   TRM web will show the « Impossible de charger la liste » banner until then.

4. **Report to the user** the worktree path, the web URL (`http://localhost:517N`), and the
   slot number. Tell them to **open a new Claude Code session in the worktree directory** to
   do the screen work — that session has `/feature-checkpoint` (sync) and `/feature-complete`
   (land) available.

## Feature needs shared-API changes? → paired NG worktree

TRM has no API; its endpoints live in the **ETM API**. If this feature needs new or
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
