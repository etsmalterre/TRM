# TRM Deploy Skill

## When to use

Invoke with `/trm_deploy` **from the TRM main checkout** to deploy the TRM webapp
to production (`http://mpstrm.malterre`).

## Scope — web only. NEVER deploy the API from here.

**TRM is a frontend-only repo.** Production `mpstrm.malterre` proxies `/api/` to the
**shared ETM API** (`10.10.2.163:8081`), which is owned and deployed by the **ETM**
deploy workflow (`/etm_deploy` in `C:\dev\etsmalterre\ETM`). This skill only builds and
uploads the TRM web bundle.

**Coordination rule:** if the TRM feature you're shipping needed shared-API changes, those
changes were landed on ETM `master` via a **paired NG worktree** (see
`ETM/claude_doc/worktrees.md` §"Shared-API changes"). Before deploying the TRM web:

1. Verify the API side is already deployed: the endpoint the screen needs must respond on
   `https://mpsng.malterre/api/...` (or ask the user / the ETM deploy session).
2. If it isn't, deploy the API first **from the ETM checkout** with its `/etm_deploy` —
   not from here.

Deploying TRM web against a stale API fails soft (404s on the new endpoints), but don't
ship it knowingly.

## Infrastructure

| Component | Server | IP | User | Notes |
|-----------|--------|-----|------|-------|
| **Web** | mfprod-erp | `10.10.2.165` | `debian` | nginx site `mpstrm.malterre` |
| **API (shared, not deployed from here)** | mfprod-api | `10.10.2.163` | `debian` | `mps-api.service`, owned by ETM |

- **Dist directory**: `/home/debian/mps_trm/dist/`
- **Nginx config**: `/etc/nginx/sites-enabled/mpstrm.malterre` — serves the dist, proxies
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
   B=$(ls apps/web/dist/assets/index-*.js)
   grep -oc 'localhost:8080'        "$B"   # must be 0  (Footgun B — TRM's dev fallback)
   grep -oc 'Program Files/Git/api' "$B"   # must be 0  (Footgun A)
   grep -oE '="/api"'               "$B" | head -1   # MUST match — API base is literally /api
   ```
   If the positive `="/api"` assertion doesn't match, do NOT deploy.

3. **Upload** (tar for speed; adjust ssh/scp invocation per the SSH Access block):
   ```bash
   tar czf /tmp/mps_trm_dist.tar.gz -C apps/web/dist .
   # scp the tarball to debian@10.10.2.165:/home/debian/ then:
   #   rm -rf /home/debian/mps_trm/dist/* && tar xzf /home/debian/mps_trm_dist.tar.gz -C /home/debian/mps_trm/dist/
   ```

4. **No restart needed** — nginx serves static files. Verify:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://mpstrm.malterre/          # 200
   curl -s http://mpstrm.malterre/api/auth/users | head -c 100             # JSON through the proxy
   ```

## Verification Checklist

- [ ] `curl http://mpstrm.malterre/` returns HTML
- [ ] `curl http://mpstrm.malterre/api/auth/users` returns JSON (proxy → shared API)
- [ ] The served bundle has the right API base:
      `curl -s http://mpstrm.malterre/$(curl -s http://mpstrm.malterre/ | grep -oE 'assets/index-[^"]+\.js')`
      then check for `="/api"` (and absence of `localhost:8080` / `Program Files`)
- [ ] Navigate to `http://mpstrm.malterre/atelier/planning` in a browser

## Known issues (inherited from ETM — same infra)

- **Service Worker caching**: users may need a hard-refresh (Ctrl+Shift+R) to pick up the
  new bundle.
- **"Impossible de charger la liste" while curl works**: diagnose **server-side first** —
  check the nginx access log for the request; if the browser errors but no request is
  logged, the bundle bakes a wrong API base (Footgun A/B) — it's a bad build, not a cache
  problem. Full triage recipe in `ETM/.claude/skills/etm_deploy/SKILL.md` §Known Issues.
- **API-side problems** (500s, `HY090`, bridge storms): those are ETM API issues —
  investigate/fix/deploy from the ETM checkout, never from here.
