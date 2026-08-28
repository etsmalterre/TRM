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

| target | pnpm filter | dist on 10.10.2.165 | stamp | host | version lives in |
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
**MPS API** (`10.10.2.163:8081`), which is deployed by the **ETM** workflow
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
   green gate while prod serves the stale payload, and the screen ships broken. Compare
   the API host's deploy stamp against ETM master:
   ```bash
   # factory PC (wsl transport — see §SSH Access for the laptop form)
   API_SHA=$(wsl bash -c "ssh $WOPTS debian@10.10.2.163 'cat /home/debian/mps_api/DEPLOYED_SHA 2>/dev/null || echo none'" | tr -d '[:space:]')
   cd /c/dev/etsmalterre/ETM && git fetch origin -q
   git log --oneline ${API_SHA}..origin/master -- apps/api      # empty = API is current
   ```
   Non-empty output = the shared API is behind on `apps/api/**` → deploy it first. An
   `API_SHA` of `none`, or one git does not know, counts as behind.
   **Exception**: a range touching only `apps/api/src/scripts/**` has no runtime effect —
   the service never imports those, so it does not warrant restarting the shared API
   (which blips `mpsng` too). Run such a script by hand instead; on the prod host that is
   `node --env-file=.env --import tsx src/scripts/<x>.ts` from `/home/debian/mps_api`
   (a bare `npx tsx` gets no env and dies with `[IM007] No data source or driver`).
3. **If either check fails, deploy the API yourself, then carry on.** Invoke `/etm_deploy`
   from `C:\dev\etsmalterre\ETM` — that skill owns the build, upload and `mps-api.service`
   restart, so do not reproduce its steps here — then re-run gates 1 and 2 from TRM until
   both are green and continue into §Deploy Steps. This is a normal leg of `/trm_deploy`,
   not an escalation: see the ⚠️ in §Scope.
4. **Check whether a landed feature still owes a one-off script on the prod API host.** The
   gates compare *code*; they cannot see a seed that was never run, and a default-closed
   permission key granted to nobody is invisible until a user hits a 403. Read this
   project's memory index for lines naming a prod script (`seed-*.ts --write`), and verify
   the *effect* rather than trusting the note — for a permission key that is:
   ```bash
   # 0 = the seed never ran
   wsl bash -c "ssh $WOPTS debian@10.10.2.163 'grep -c edit_of /home/debian/mps_api/data/permissions-trm.json'"
   ```
   Run what is owed on the host as shown in the step-2 Exception, **before** the web bundle
   that depends on it goes up. Verified 2026-08-27: `edit_of` had been gating the nine
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
| **Web** | mfprod-erp | `10.10.2.165` | `debian` | nginx site `trm.malterre` |
| **API (shared, not deployed from here)** | mfprod-api | `10.10.2.163` | `debian` | `mps-api.service`, owned by ETM |

- **Dist directory**: `/home/debian/mps_trm/dist/`
- **Nginx config**: `/etc/nginx/sites-enabled/trm.malterre` — serves the dist, proxies
  `/api/` → `http://10.10.2.163:8081`, SPA fallback to `/index.html`, `index.html`/`sw.js`
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
  wsl bash -c "ssh -i /home/vincent/.ssh/claude_deploy/claude_deploy -o StrictHostKeyChecking=no debian@10.10.2.165 '<command>'"
  ```
- **Windows side** (laptop `malte`): `$HOME/.ssh/claude_deploy/claude_deploy` — use the
  Windows-native OpenSSH binary (`/c/Windows/System32/OpenSSH/ssh.exe`), NOT Git Bash's ssh.

Test with `hostname` first; if the identity file is missing at one path, try the other.

## Deploy Steps

0. **Preflight — one read-only command, before building anything:**
   ```bash
   node ../ETM/scripts/deploy/preflight.mjs   # whole platform; exit 1 = blockers
   ```
   Stamps for all three tiers, what is behind (runtime `apps/api/**` vs `src/scripts/**`),
   whether **both** main checkouts are clean and on master, and whether a landed feature
   still owes a seed on the prod host. It fails closed — unreachable servers exit 2.
   A blocker means fix it, not proceed: the tree-clean check exists because on 2026-08-27
   a local `dist/` had been rebuilt from master **plus** an uncommitted edit, and uploading
   it would have shipped unreviewed code under a `DEPLOYED_SHA` that did not contain it.

0b. **Then the route gate:**
   ```bash
   node scripts/check-api-routes.mjs --app <target>
   ```
   Exit 1 → do **not** build; go deploy the API yourself per §Scope (run `/etm_deploy` in
   the ETM checkout), then come back to this step. This gate is the weaker of the two —
   run the step-2 SHA diff and step 4's owed-script check too. Deploying past a red gate
   ships screens whose backend is not on the server. Use `--verbose` to see every probe, and
   `--base <url>` to point at another API (e.g. `https://mpsng.malterre/api` to test the
   API directly rather than through TRM's nginx).

1. **Build locally — use PowerShell, NOT the Bash tool.** `VITE_API_URL=/api` MUST be set,
   for every target:
   ```powershell
   cd C:\dev\etsmalterre\TRM; $env:VITE_API_URL='/api'; pnpm --filter <filter> build
   ```
   `<filter>` from the Targets table. Produces `apps/<target>/dist/` with hashed assets.
   All three apps share the same `lib/api.ts` dev fallback, so both footguns below
   apply to all three identically.

   **The two build footguns from ETM apply verbatim** (full write-ups in
   `ETM/.claude/skills/etm_deploy/SKILL.md` — both caused prod outages there):
   - **Footgun A — git-bash path mangling**: `VITE_API_URL=/api` set through the Bash tool
     gets rewritten to `C:/Program Files/Git/api`. Build with PowerShell.
   - **Footgun B — unset var**: the bundle silently bakes in TRM's dev fallback
     `http://localhost:8080/api` (each app's own `src/lib/api.ts` — all three carry the same fallback).

   **Note**: the TRM build imports shared screens from the sibling `ETM` checkout via the
   `@etm` alias — the ETM checkout must be present and on the code you intend to ship
   (normally `master`). If ETM master moved for a shared screen, both apps need a deploy.

2. **Verify the built bundle BEFORE upload — negative AND positive checks:**
   ```bash
   cd apps/<target>/dist/assets
   grep -l 'localhost:8080'        index-*.js   # must print NOTHING (Footgun B — dev fallback)
   grep -l 'Program Files/Git/api' index-*.js   # must print NOTHING (Footgun A)
   grep -l '="/api"'               index-*.js   # MUST print the main chunk
   grep -ohE 'Version ","[0-9.]+'  index-*.js   # the injected __APP_VERSION__
   ```
   ⚠️ **Glob every chunk, never a single `$B`.** The build emits more than one
   `index-*.js` (a small ~14 KB chunk beside the ~1.2 MB main one), so the old
   `B=$(ls ...)` form expanded to two paths and every grep died with
   `No such file or directory` — which reads like a clean '0' pass if you only
   check the exit code. Only the main chunk carries `="/api"`; that is expected.
   If the positive `="/api"` assertion doesn't match, do NOT deploy.

3. **Upload** (tar for speed; adjust ssh/scp invocation per the SSH Access block).
   `<dist>` and `<stamp>` come from the Targets table:
   ```bash
   tar czf /tmp/dist.tar.gz -C apps/<target>/dist .
   # scp to debian@10.10.2.165:/home/debian/ then, on the host:
   #   rm -rf <dist>.bak && cp -a <dist> <dist>.bak       # rollback point
   #   rm -rf <dist>/* && tar xzf /home/debian/dist.tar.gz -C <dist>/
   #   echo <sha> > <stamp>
   ```
   ⚠️ **Never nest `$(…)` inside `wsl bash -c "ssh … '…'"`** — it silently yields the
   fallback branch, so a stamp written that way reports success while writing nothing.
   Substitute locally and send a plain command.

   **Stamp every target you shipped.** A tier with no stamp reads as `none` to
   `preflight.mjs`, which counts as behind.

4. **No restart needed** — nginx serves static files. Verify:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://trm.malterre/          # 200
   curl -s http://trm.malterre/api/auth/users | head -c 100             # JSON through the proxy
   ```

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

- [ ] `curl http://trm.malterre/` returns HTML
- [ ] `curl http://trm.malterre/api/auth/users` returns JSON (proxy → shared API)
- [ ] The served bundle has the right API base:
      `curl -s http://trm.malterre/$(curl -s http://trm.malterre/ | grep -oE 'assets/index-[^"]+\.js')`
      then check for `="/api"` (and absence of `localhost:8080` / `Program Files`)
- [ ] Navigate to `http://trm.malterre/atelier/planning` in a browser

## Known issues (inherited from ETM — same infra)

- **Service Worker caching**: users may need a hard-refresh (Ctrl+Shift+R) to pick up the
  new bundle.
- **"Impossible de charger la liste" while curl works**: diagnose **server-side first** —
  check the nginx access log for the request; if the browser errors but no request is
  logged, the bundle bakes a wrong API base (Footgun A/B) — it's a bad build, not a cache
  problem. Full triage recipe in `ETM/.claude/skills/etm_deploy/SKILL.md` §Known Issues.
- **API-side problems** (500s, `HY090`, bridge storms): those are MPS API issues —
  investigate/fix/deploy from the ETM checkout, never from here.
