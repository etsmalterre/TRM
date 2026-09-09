# TRM Deploy Skill

## When to use

Invoke with `/trm_deploy` **from the TRM main checkout** to deploy a TRM web bundle
to production.

## Targets — the monorepo ships THREE bundles, to three hosts

`/trm_deploy [web|atelier|trs|all]`. Everything below is identical per target except
these four values — which is why this is one skill with a table, not three skills.
A per-app difference is a **parameter, never a fork**: the rule `createFinanceRouter(scope)`
and `RapportFinance basePath` already follow, and the one `mps_designer` broke by being
copied (709 lines of drift, teaching patterns ETM had already replaced).

| target | pnpm filter | dist on 10.10.20.4 | stamp | host | version lives in |
|---|---|---|---|---|---|
| `web` | `@mps-trm/web` | `/home/debian/mps_trm/dist` | `mps_trm/DEPLOYED_SHA` | `trm.malterre` | **root** `package.json` |
| `atelier` | `@mps-trm/atelier` | `/home/debian/mps_atelier/dist` | `mps_atelier/DEPLOYED_SHA` | `atelier.malterre` | `apps/atelier/package.json` |
| `trs` | `@mps-trm/trs` | `/home/debian/mps_trs/dist` | `mps_trs/DEPLOYED_SHA` | `trs.malterre` | `apps/trs/package.json` |

**With no target, deploy every bundle that is actually BEHIND** — as reported by
`preflight.mjs`, which compares each tier's stamp against its own `apps/<x>` path.
Print the plan first (`web current, skipping · trs BEHIND → deploying`), then ship
exactly those. `all` forces all three regardless.

⚠️ **Do NOT default to `web`.** It is backwards-compatible and silently wrong — the same
shape as the false green that left `atelier` and `trs` undeployed on 2026-08-28 while
preflight reported "Everything is current". Under-deploying quietly is the exact failure
this skill exists to prevent.

⚠️ **A version argument bumps the TARGET's own file** (last column). `apps/atelier` and
`apps/trs` carry their own versions on purpose — they ship on their own cadence — and only
`apps/web` reads the root `package.json`. `/trm_deploy trs v0.0.3` bumping the root would
print a wrong version in the **ERP's** header and leave TRS's unchanged. TRS is already at
0.0.2 while the root is 0.1.1; the numbers are unrelated and must never be "aligned".

**Optional version argument — `/trm_deploy trs v0.0.3`.** A version means "release this
version", so **before** building: set `version` in **the target's own file** (Targets table,
last column — root `package.json` for `web`, `apps/<target>/package.json` for the other two),
commit it as `chore(release): X.Y.Z`, and push. Each build bakes its own version in as
`__APP_VERSION__`, so bumping *after* the build ships the old number. Deploy the pushed
commit, not the pre-bump one. With no version, deploy `origin/master` as-is and change none.

⚠️ **This used to say "do NOT touch the per-package `apps/*/package.json` versions; they are
displayed nowhere", and that is now FALSE.** It was true when `apps/web` was the only app.
`apps/atelier` and `apps/trs` each read their **own** `package.json` in their `vite.config.ts`
and show it in the UI — deliberately, so an atelier release does not read as a TRM release.

**Every version here is its own.** TRM's root started at 0.0.1 on 2026-08-26 and has no
relation to ETM's; `apps/trs` and `apps/atelier` have no relation to the root or each other.
Never "align" any of them.

## Scope — this skill's *steps* build web bundles only. The *deploy* is both tiers, and it is yours to finish.

**TRM is a frontend-only repo.** Production `trm.malterre` proxies `/api/` to the
**MPS API** (`10.10.20.3:8081`), which is deployed by the **ETM** workflow
(`/etm_deploy` in `C:\dev\etsmalterre\ETM`). §Deploy Steps below builds and uploads the
TRM web bundle(s) named by the target and nothing else — never hand-roll an API deploy
out of it. `atelier.malterre` and `trs.malterre` proxy `/api/` to that same API, so an
API deploy blips all three fronts and all three want a smoke-check afterwards.

⚠️ **That is a constraint on *mechanism*, not on *agency*. `/trm_deploy` is a request to
get TRM live, and you own the whole chain — including the ETM half.** If a gate below shows
the shared API is behind, **go to `C:\dev\etsmalterre\ETM`, run `/etm_deploy` yourself, come
back, and continue** — in the same session, without asking permission and without handing
the deploy back to the user. Vincent's standing expectation, 2026-08-27: *"when I call TRM
deploy, I expect you to do the stuff you need to do on ETM without asking me."* Narrate what
you did on the way through. Stop and ask only if `/etm_deploy` itself fails, the SSH key is
disabled, or ETM `master` carries API changes that are not part of what you were asked to
ship.

**Coordination rule:** if the TRM feature you're shipping needed shared-API changes, those
changes were landed on ETM `master` via a **paired NG worktree** (see
`ETM/claude_doc/worktrees.md` §"Shared-API changes"). Before deploying the TRM web:

1. **Run the gate — do not eyeball this:**
   ```bash
   node scripts/check-api-routes.mjs --app <target>
   ```
   It extracts every `apiFetch` path in the target's `apps/<target>/src` (all three apps
   with no `--app`), picks a concrete endpoint per mount root, and probes production.
   Exit 0 = safe; exit 1 = **do not deploy**, it
   names the missing routes and the pages that call them.
2. **Check the API is not merely *present* but *current* — the route gate does NOT cover
   this.** `check-api-routes.mjs` probes one concrete path per mount root and fails only
   on 404, so it catches a router that was never deployed. It does **not** catch a router
   that is mounted with an **older handler**: a feature adding a field, a sub-route or a
   query param to an already-deployed mount (e.g. a new block inside `/prime-trm`) gets a
   green gate while prod serves the stale payload, and the screen ships broken. This is
   the diff `preflight.mjs` prints as « MPS API is BEHIND — N runtime file(s) »: the API
   host's `DEPLOYED_SHA` against ETM `origin/master` on `apps/api/**`.
   ```bash
   node C:/dev/etsmalterre/ETM/scripts/deploy/preflight.mjs
   ```
   A stamp of `none`, or one git does not know, counts as behind.
   **Exception**: a range touching only `apps/api/src/scripts/**` has no runtime effect —
   the service never imports those, so it does not warrant restarting the shared API
   (which blips `mpsng` too). Run such a script by hand instead; on the prod host that is
   `node --env-file=.env --import tsx src/scripts/<x>.ts` from `/home/debian/mps_api`
   (a bare `npx tsx` gets no env and dies with `[IM007] No data source or driver`).
3. **If either check fails, deploy the API yourself, then carry on.** That is one command,
   the same one `/etm_deploy` runs — `node scripts/deploy/deploy-api.mjs` from
   `C:\dev\etsmalterre\ETM` (§Deploy Steps step 1) — then re-run gates 1 and 2 from TRM
   until both are green and continue. This is a normal leg of `/trm_deploy`, not an
   escalation: see the ⚠️ in §Scope.
4. **Check whether a landed feature still owes a one-off script on the prod API host.** The
   gates compare *code*; they cannot see a seed that was never run, and a default-closed
   permission key granted to nobody is invisible until a user hits a 403. `preflight.mjs`
   does two things about it: it greps the host's `permissions-trm.json` for the keys it
   knows (`edit_of`, `edit_expeditions`, `screen_`) and, since 2026-09-07, it **names every
   `seed-*` / `fix-*` / `backfill-*` / `migrate-*` script that landed in the API range** so
   an owed script is never only known from the merge-log prose. A key it does not know:
   read this project's memory index, then verify the *effect* (a `grep -c <key>` on the host,
   0 = the seed never ran). Run what is owed on the host as shown in the step-2 Exception,
   **before** the web bundle that depends on it goes up. Verified 2026-08-27: `edit_of` had been gating the nine
   `/of-trm` write routes in production for a day with the key granted to nobody, so every
   non-admin was silently 403'd — the API half had shipped, the seed had not.

**Why this is a script and not a checklist item:** each TRM worktree develops against its
own paired NG API on `808N`, so a screen whose API half was never deployed works perfectly
in dev and 404s only in production. Nothing in the local loop can catch it. Verified
2026-07-30: three merged screens (`clients-trm`, `commandes-trm`, `expeditions-trm`) would
have shipped against an API that had none of them.

**Why the two checks are different.** The route gate answers "does prod have this
router?"; the SHA check answers "does prod have *this version* of it?". Both are needed
because a TRM screen and its endpoints land as **two commits in two repos** — the NG
branch first, then the TRM one — and only the API half has a deploy of its own.
Verified 2026-08-25: a deploy believed done the day before had in fact shipped nothing
(the session was cut short mid-way), and prod sat a whole feature-set behind on both
halves with no trace of it in git — the `DEPLOYED_SHA` stamps on each server were the
only way to see it. Read them before trusting any memory of "we deployed that".

The check **fails closed** — an unreachable API is a failure, never a silent pass. If you
are off the factory LAN/VPN it will say so rather than wave the deploy through.

## Infrastructure

| Component | Server | IP | User | Notes |
|-----------|--------|-----|------|-------|
| **Web** | mps-webapps (PVE `MPS-WebApps`, ssh alias `mps_webapps`; was `mfprod-erp` until 2026-09-09) | `10.10.20.4` | `debian` | nginx site `trm.malterre` |
| **API (shared, not deployed from here)** | mps-api (PVE `MPS-API`, ssh alias `mps_api`; was `mfprod-api`) | `10.10.20.3` | `debian` | `mps-api.service`, owned by ETM |

- **Dist directory**: `/home/debian/mps_trm/dist/`
- **Nginx config**: `/etc/nginx/sites-enabled/trm.malterre` — serves the dist, proxies
  `/api/` → `http://10.10.20.3:8081`, SPA fallback to `/index.html`, `index.html`/`sw.js`
  never cached, hashed assets cached 1y, `client_max_body_size 25m`.
- Same physical servers as ETM (`mpsng.malterre` lives in `/home/debian/mps_erp/dist/`
  on the same box — **don't mix up the two dist dirs**).

## SSH Access

Load the user-level **`ssh_context`** skill for the connection method and server directory.
The `claude_deploy` key is only enabled during active sessions — `Permission denied
(publickey)` means ask the user to enable it (normal, not a bug).

Key location varies per machine:
- **WSL side** (factory PC `vince`): `/home/vincent/.ssh/claude_deploy/claude_deploy` —
  connect through WSL:
  ```bash
  wsl bash -c "ssh -i /home/vincent/.ssh/claude_deploy/claude_deploy -o StrictHostKeyChecking=no debian@10.10.20.4 '<command>'"
  ```
- **Windows side** (laptop `malte`): `$HOME/.ssh/claude_deploy/claude_deploy` — use the
  Windows-native OpenSSH binary (`/c/Windows/System32/OpenSSH/ssh.exe`), NOT Git Bash's ssh.

Test with `hostname` first; if the identity file is missing at one path, try the other.

## Deploy Steps — three commands, in this order

The deploy is **scripts, not typed shell**. Since 2026-09-07 every step that used to be a
hand-composed `wsl bash -c "ssh … '…'"` line lives in `ETM/scripts/deploy/` (shared with
`/etm_deploy`, one copy for the platform). The reason is a real incident that day: a
hand-typed upload lost a shell variable in the nested quoting, the extract never ran, and
the `DEPLOYED_SHA` stamp was written anyway — preflight then read prod as current while
it served the previous build. The scripts feed remote commands to `bash -s` on stdin
(nothing to escape, `set -e`), verify the **served** bundle through nginx, and write the
stamp **last, by its own call**. Do not reproduce their steps by hand; if one refuses,
fix what it names.

Run everything with **absolute paths** — the Bash tool's cwd drifts between calls
(a `../ETM/…` form failed on 2026-09-07 after a `cd` into `dist/assets`).

0. **Sync both main checkouts, then preflight.** Since 2026-09-02 `/feature-complete`
   lands by pushing to `origin/master` and only best-effort fast-forwards the checkout, so
   a checkout behind origin is the normal case after a morning of landings:
   ```bash
   git -C /c/dev/etsmalterre/TRM fetch -q origin && git -C /c/dev/etsmalterre/TRM merge --ff-only origin/master
   git -C /c/dev/etsmalterre/ETM fetch -q origin && git -C /c/dev/etsmalterre/ETM merge --ff-only origin/master
   node C:/dev/etsmalterre/ETM/scripts/deploy/preflight.mjs      # read-only; exit 1 = blockers
   ```
   Preflight prints the five stamps, which tiers are behind, whether both trees are clean
   and at `origin/master`, the seeds it can verify, and — new — **the one-off scripts
   (`seed-*` / `fix-*` / `backfill-*` / `migrate-*`) that landed in the API range**, so an
   owed host script is named here instead of buried in the merge-log. A blocker means fix
   it, not proceed; never `reset` / `stash` past it. If a version was asked for, bump it
   (Targets table, last column), commit `chore(release): X.Y.Z`, push, **then** preflight.

1. **API first, if preflight says it is behind** (this is the ETM leg — yours to run,
   see §Scope):
   ```bash
   cd /c/dev/etsmalterre/ETM && node scripts/deploy/deploy-api.mjs        # --dry-run to rehearse
   ```
   It guards the ETM tree, refuses if prod's `src/scripts` holds files that are in no
   commit (rescue them first), ships `package.json` + `npm install` only when the
   dependencies actually differ, refuses if the host's `.env` differs from
   `.env.production` (it never writes the host's `.env`), uploads `src/` (tests excluded),
   backs up, prunes `src/scripts`, extracts, restarts, waits for `/api/health` to answer
   `"app":"MPS API"`, counts `HY090`/`Error` in the journal, smoke-checks **all four
   clients** through their own nginx (mpsng, trm, atelier, trs), and only then stamps.
   Then run the owed scripts preflight listed — on the host, `node --env-file=.env
   --import tsx src/scripts/<x>.ts` from `/home/debian/mps_api`, dry-run first — and
   **restart again if one wrote `data/*.json`** (module-load cache, see below).
   An `src/scripts/**`-only range does not go through here (a restart blips every client
   for nothing): run the script on the host by hand.

   Then the route gate, which must be green before any web bundle goes up:
   ```bash
   node C:/dev/etsmalterre/TRM/scripts/check-api-routes.mjs --app <target>
   ```

2. **Each web bundle preflight reported behind** (no target = every one that is behind;
   `all` = all three; never default to `web` alone):
   ```bash
   cd /c/dev/etsmalterre/ETM && node scripts/deploy/deploy-web.mjs --app trm       # web  → trm.malterre
   cd /c/dev/etsmalterre/ETM && node scripts/deploy/deploy-web.mjs --app atelier   # atelier.malterre
   cd /c/dev/etsmalterre/ETM && node scripts/deploy/deploy-web.mjs --app trs       # trs.malterre
   ```
   Each run: guards the app's checkout (and the ETM one for `trm`, whose build imports
   shared screens through the `@etm` alias), `pnpm install`, builds with `VITE_API_URL=/api`
   set **in the child's env** (no shell in between, so Footgun A's git-bash path mangling
   and Footgun B's unset var cannot happen), verifies every `index-*.js` chunk (no dev
   fallback, no `Program Files/Git/api`, `="/api"` present, the app's own version baked in
   where the app renders it), tars, uploads, **extracts over** the dist (never wipes —
   open tabs still lazy-load old chunks; hashed assets untouched for 14 days are swept),
   re-fetches the served `index.html` and greps the chunk **nginx actually serves**, and
   stamps last. `--dry-run` stops after the local verify; `--skip-build` verifies and
   ships the dist already there.

3. **Confirm**: `node C:/dev/etsmalterre/ETM/scripts/deploy/preflight.mjs` must now say
   « Everything is current », then open `https://trm.malterre/` in a browser (the hosts
   are **https only** — `http://` answers 308, not 200). Update the deploy-state memory.

## After the deploy — one-off prod scripts

⚠️ **A seed that writes `data/*.json` must be followed by a RESTART, in that order.**
`lib/permissions-trm.ts` on the MPS API is a *module-load cache*: the running service holds
the whole file in memory and rewrites all of it on any single admin save. A seed run as a
separate process therefore lands on disk but is invisible to the API, and the next save in
Paramètres › Utilisateurs writes the stale copy back over it — wiping every seeded grant at
once, silently, with nothing in the log. Measured 2026-08-27: 10 `edit_of` grants written at
10:35 were gone by 10:44 and nobody noticed until `preflight.mjs` checked. **Seed →
`systemctl restart mps-api` → re-`grep` the file.**

## Verification Checklist

- [ ] `preflight.mjs` reports every tier current
- [ ] `curl -sk https://trm.malterre/` returns HTML (https — http is a 308)
- [ ] `curl -sk https://trm.malterre/api/auth/users` returns JSON (proxy → shared API)
- [ ] `deploy-web.mjs` printed « served bundle: API base /api » — that line *is* the
      served-bundle check (it fetches the chunk nginx serves and greps it)
- [ ] Navigate to `https://trm.malterre/atelier/planning` in a browser

## Known issues (inherited from ETM — same infra)

- **Service Worker caching**: users may need a hard-refresh (Ctrl+Shift+R) to pick up the
  new bundle.
- **"Impossible de charger la liste" while curl works**: diagnose **server-side first** —
  check the nginx access log for the request; if the browser errors but no request is
  logged, the bundle bakes a wrong API base (Footgun A/B) — it's a bad build, not a cache
  problem. Full triage recipe in `ETM/.claude/skills/etm_deploy/SKILL.md` §Known Issues.
- **API-side problems** (500s, `HY090`, bridge storms): those are MPS API issues —
  investigate/fix/deploy from the ETM checkout, never from here.
