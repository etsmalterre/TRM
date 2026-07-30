/**
 * Deploy gate: does the PRODUCTION shared API actually serve every route this
 * web bundle calls?
 *
 *   node scripts/check-api-routes.mjs [--base https://mpstrm.malterre/api] [--verbose]
 *
 * TRM is a frontend-only repo: its `/api/` is proxied to the shared ETM API,
 * which deploys from the ETM checkout via `/etm_deploy`. A TRM feature whose
 * paired NG branch has NOT been deployed builds fine, works perfectly in dev
 * (where each TRM worktree points at its own paired API on 808N), and then
 * 404s in production. Nothing in the local dev loop can catch that — hence
 * this check, which probes the real prod API before we ship the bundle.
 *
 * It probes MOUNT ROOTS, not full paths: Express mounts routers at
 * `/api/<root>`, so a missing router is exactly what 404s, and a root that
 * answers 401 is mounted (auth-gated) and therefore fine. Only 404 (and being
 * unable to reach the API at all) fails.
 *
 * FAILS CLOSED: an unreachable API is a failure, never a silent pass. Exit 0 =
 * safe to deploy, exit 1 = do not deploy.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import https from 'node:https'
import http from 'node:http'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, '..', 'apps', 'web', 'src')

const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
const baseArg = args.indexOf('--base')
// Probe through TRM's OWN proxy by default: that validates the API *and*
// mpstrm's nginx, which is the path a TRM user's request actually takes.
const BASE = baseArg !== -1 ? args[baseArg + 1] : 'https://mpstrm.malterre/api'

/** Roots that are infrastructure rather than a feature's backend. Probing them
 *  adds noise, not signal — they have shipped for as long as the app has. */
const ALWAYS_PRESENT = new Set(['auth'])

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.tsx?$/.test(entry)) out.push(p)
  }
  return out
}

/** Collect, per mount root, a CONCRETE path to probe.
 *
 *  Probing the bare mount root does not work: Express answers 404 both for a
 *  router that was never mounted AND for a mounted router with no handler at
 *  its root (`/api/user-profiles` only serves `/me/...`). The two are
 *  indistinguishable, so we probe a real endpoint instead.
 *
 *  Extraction stops at the first `$`, so `/commandes-trm/${id}` yields the
 *  literal prefix only; such truncated paths are used solely as a fallback
 *  when a root has no fully-literal call site. */
function collectTargets() {
  const byRoot = new Map() // root -> { candidates: [{path, truncated}], files: Set }
  const re = /apiFetch\s*(?:<[^(]*?>)?\s*\(\s*(['"`])([^'"`$]*)(\$?)/g
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(re)) {
      const truncated = m[3] === '$'
      // Drop query strings and any trailing slash left by truncation.
      const path = m[2].split('?')[0].replace(/\/+$/, '')
      if (!path.startsWith('/')) continue
      const root = path.split('/')[1]
      if (!root || ALWAYS_PRESENT.has(root)) continue
      if (!byRoot.has(root)) byRoot.set(root, { candidates: [], files: new Set() })
      const entry = byRoot.get(root)
      entry.candidates.push({ path, truncated })
      entry.files.add(file.slice(SRC.length + 1).replace(/\\/g, '/'))
    }
  }

  // Prefer a fully-literal path (a real endpoint that will answer 200/401);
  // shortest wins, as that is typically the collection endpoint.
  const targets = []
  for (const [root, { candidates, files }] of byRoot) {
    const literal = candidates.filter((c) => !c.truncated).sort((a, b) => a.path.length - b.path.length)
    const chosen = (literal[0] ?? candidates.sort((a, b) => b.path.length - a.path.length)[0]).path
    targets.push({ root, path: chosen, files: [...files] })
  }
  return targets.sort((a, b) => a.root.localeCompare(b.root))
}

/** GET a URL, following redirects (mpstrm answers 308 http->https).
 *  Resolves to a status number, or rejects if the API cannot be reached. */
function probe(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http
    const req = mod.get(
      url,
      // Internal hosts use a self-signed cert; we are checking routing, not TLS.
      { rejectUnauthorized: false, timeout: 10_000 },
      (res) => {
        const { statusCode, headers } = res
        res.resume()
        if ([301, 302, 307, 308].includes(statusCode) && headers.location && redirects < 3) {
          resolve(probe(new URL(headers.location, url).toString(), redirects + 1))
        } else resolve(statusCode)
      },
    )
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}

const targets = collectTargets()
if (targets.length === 0) {
  console.error('✗ No apiFetch paths found — the extractor is broken, not the API.')
  process.exit(1)
}

console.log(`Probing ${targets.length} mount root(s) against ${BASE}\n`)

const missing = []
const unreachable = []

for (const { root, path, files } of targets) {
  let status
  try {
    status = await probe(`${BASE}${path}`)
  } catch (err) {
    unreachable.push({ root, reason: err.message })
    console.log(`  ?  ${path} — UNREACHABLE (${err.message})`)
    continue
  }
  if (status === 404) {
    missing.push({ root, path, files })
    console.log(`  ✗  ${path} — 404 NOT ON PROD`)
  } else if (verbose) {
    console.log(`  ✓  ${path} — ${status}`)
  }
}

if (unreachable.length) {
  console.error(
    `\n✗ Could not reach the API for ${unreachable.length} root(s). ` +
      `Not a pass — check the VPN/LAN, or that ${BASE} is correct.`,
  )
  process.exit(1)
}

if (missing.length) {
  console.error(`\n✗ ${missing.length} route(s) the bundle calls do NOT exist on the production API:\n`)
  for (const { path, files } of missing) {
    console.error(`    /api${path}`)
    for (const f of files.slice(0, 4)) console.error(`        used by apps/web/src/${f}`)
  }
  console.error(
    `\n  These live in the ETM repo. Land the paired NG branch, then run /etm_deploy\n` +
      `  from C:\\dev\\etsmalterre\\ETM, and only then deploy the TRM web bundle.\n` +
      `  Deploying now ships screens whose backend is not there.\n`,
  )
  process.exit(1)
}

console.log(`\n✓ All ${roots.size} mount root(s) answer on prod — safe to deploy the web bundle.`)
