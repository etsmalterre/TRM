# TRM Deploy Skill

## When to use

Invoke with `/trm_deploy` **from the TRM main checkout** to deploy the TRM webapp
to production (`http://trm.malterre`).

**Optional version argument — `/trm_deploy v0.0.2`.** A version means "release this
version", so **before** building: set `version` in the **root** `package.json` (the single
source of truth — see CLAUDE.md §Versioning), commit it as `chore(release): X.Y.Z`, and
push. The web build bakes it in as `__APP_VERSION__` and the header profile menu shows it,
so bumping *after* the build ships the old number. Deploy the pushed commit, not the
pre-bump one. With no argument, deploy `origin/master` as-is and change no version.
Do NOT touch the per-package `apps/*/package.json` versions; they are displayed nowhere.
**TRM's version is its own** — it started at 0.0.1 on 2026-08-26 and has no relation to
ETM's number; never "align" them.

## Scope — this skill's *steps* build web only. The *deploy* is both tiers, and it is yours to finish.

**TRM is a frontend-only repo.** Production `trm.malterre` proxies `/api/` to the
**shared ETM API** (`10.10.2.163:8081`), which is deployed by the **ETM** workflow
(`/etm_deploy` in `C:\dev\etsmalterre\ETM`). Steps 1–4 of §Deploy Steps build and upload
the TRM web bundle and nothing else — never hand-roll an API deploy out of them.

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
   cd /c/dev/etsmalterre/TRM && node scripts/check-api-routes.mjs
   ```
   It extracts every `apiFetch` path in `apps/web/src`, picks a concrete endpoint per
   mount root, and probes production. Exit 0 = safe; exit 1 = **do not deploy**, it
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

0. **Gate on the production API — before building anything:**
   ```bash
   cd /c/dev/etsmalterre/TRM && node scripts/check-api-routes.mjs
   ```
   Exit 1 → stop and read §Scope's coordination rule. Deploying past a red gate ships
   screens whose backend is not on the server. Use `--verbose` to see every probe, and
   `--base <url>` to point at another API (e.g. `https://mpsng.malterre/api` to test the
   API directly rather than through TRM's nginx).

1. **Build locally — use PowerShell, NOT the Bash tool.** `VITE_API_URL=/api` MUST be set:
   ```powershell
   cd C:\dev\etsmalterre\TRM; $env:VITE_API_URL='/api'; pnpm --filter web build
   ```
   Produces `apps/web/dist/` with hashed assets.

   **The two build footguns from ETM apply verbatim** (full write-ups in
   `ETM/.claude/skills/etm_deploy/SKILL.md` — both caused prod outages there):
   - **Footgun A — git-bash path mangling**: `VITE_API_URL=/api` set through the Bash tool
     gets rewritten to `C:/Program Files/Git/api`. Build with PowerShell.
   - **Footgun B — unset var**: the bundle silently bakes in TRM's dev fallback
     `http://localhost:8080/api` (`apps/web/src/lib/api.ts`).

   **Note**: the TRM build imports shared screens from the sibling `ETM` checkout via the
   `@etm` alias — the ETM checkout must be present and on the code you intend to ship
   (normally `master`). If ETM master moved for a shared screen, both apps need a deploy.

2. **Verify the built bundle BEFORE upload — negative AND positive checks:**
   ```bash
   cd apps/web/dist/assets
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

3. **Upload** (tar for speed; adjust ssh/scp invocation per the SSH Access block):
   ```bash
   tar czf /tmp/mps_trm_dist.tar.gz -C apps/web/dist .
   # scp the tarball to debian@10.10.2.165:/home/debian/ then:
   #   rm -rf /home/debian/mps_trm/dist/* && tar xzf /home/debian/mps_trm_dist.tar.gz -C /home/debian/mps_trm/dist/
   ```

4. **No restart needed** — nginx serves static files. Verify:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://trm.malterre/          # 200
   curl -s http://trm.malterre/api/auth/users | head -c 100             # JSON through the proxy
   ```

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
- **API-side problems** (500s, `HY090`, bridge storms): those are ETM API issues —
  investigate/fix/deploy from the ETM checkout, never from here.
