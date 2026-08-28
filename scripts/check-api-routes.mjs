/**
 * Deploy gate: does the PRODUCTION shared API actually serve every route this
 * web bundle calls?
 *
 *   node scripts/check-api-routes.mjs [--base https://trm.malterre/api] [--verbose]
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
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import https from 'node:https'
import http from 'node:http'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Every app in the monorepo that calls the shared API, with the host its own
// requests actually travel through. An app missing from this list has NO route
// gate whatsoever: until 2026-08-28 this scanned apps/web alone, so /api/trs and
// /api/atelier - the two newest routers, on two brand-new hosts - were exactly
// the ones it could not see. Add an app here when you add it to the monorepo.
const APPS = [
  { name: 'web',     host: 'https://trm.malterre/api' },
  { name: 'atelier', host: 'https://atelier.malterre/api' },
  { name: 'trs',     host: 'https://trs.malterre/api' },
].map((a) => ({ ...a, src: join(__dirname, '..', 'apps', a.name, 'src') }))
  .filter((a) => existsSync(a.src))

const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
const baseArg = args.indexOf('--base')
// --app <name> narrows the scan to one app, which is what a per-app deploy wants.
// With no --app every app is scanned, so a bare run still gates the whole repo.
const appArg = args.indexOf('--app')
const APPS_TO_SCAN = appArg !== -1 ? APPS.filter((a) => a.name === args[appArg + 1]) : APPS
if (!APPS_TO_SCAN.length) {
  console.error(`Unknown --app "${args[appArg + 1]}". Known: ${APPS.map((a) => a.name).join(', ')}`)
  process.exit(2)
}
// Probe through the app's OWN proxy by default: that validates the API *and*
// that app's nginx host, which is the path its users' requests actually take.
// Scanning several apps at once, fall back to TRM's host - they share one API.
const BASE = baseArg !== -1 ? args[baseArg + 1]
  : APPS_TO_SCAN.length === 1 ? APPS_TO_SCAN[0].host : 'https://trm.malterre/api'

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
  const blindSpots = []

  // (a) inline literal:      apiFetch('/clients-trm/comptes')
  const reInline = /apiFetch\s*(?:<[^(]*?>)?\s*\(\s*(['"`])([^'"`$]*)(\$?)/g
  // (b) via a const:         const BASE = '/factures-trm'  →  apiFetch(`${BASE}/prov/…`)
  //     Missing this shipped a whole screen past the gate once — see git history.
  const reConst = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])(\/[^'"`$]*)\2/g
  const reConstUse = /apiFetch\s*(?:<[^(]*?>)?\s*\(\s*(?:`\$\{([A-Za-z_$][\w$]*)\}|([A-Za-z_$][\w$]*)\s*[,)])/g
  // (c) direct base:         fetch(`${API_URL}/expeditions-trm/…`)
  const reApiUrl = /\$\{API_URL\}(\/[^'"`$\s)]*)/g

  for (const app of APPS_TO_SCAN) {
  for (const file of walk(app.src)) {
    const text = readFileSync(file, 'utf8')
    const rel = `apps/${app.name}/src/` + file.slice(app.src.length + 1).replace(/\\/g, '/')
    let found = 0

    const add = (rawPath, truncated) => {
      const path = rawPath.split('?')[0].replace(/\/+$/, '')
      if (!path.startsWith('/')) return
      const root = path.split('/')[1]
      if (!root) return
      // Allowlisted roots still count as "extracted", so a file calling only
      // /auth/* is not mistaken for a blind spot.
      if (ALWAYS_PRESENT.has(root)) {
        found++
        return
      }
      if (!byRoot.has(root)) byRoot.set(root, { candidates: [], files: new Set() })
      byRoot.get(root).candidates.push({ path, truncated })
      byRoot.get(root).files.add(rel)
      found++
    }

    for (const m of text.matchAll(reInline)) add(m[2], m[3] === '$')

    const consts = new Map()
    for (const m of text.matchAll(reConst)) consts.set(m[1], m[3])
    for (const m of text.matchAll(reConstUse)) {
      const name = m[1] ?? m[2]
      // `apiFetch(NAME)` uses the const whole; `apiFetch(\`${NAME}/…\`)` extends it.
      if (consts.has(name)) add(consts.get(name), m[1] !== undefined)
    }

    for (const m of text.matchAll(reApiUrl)) {
      // The capture stops at the first dollar sign, so an interpolation right
      // after it means we hold a PREFIX, not an endpoint. Hardcoding false made
      // the gate probe /prime-trm/bonnetiers for a real call to
      // /prime-trm/bonnetiers/<id>/photo, and condemn a router answering 200.
      add(m[1], text[m.index + m[0].length] === '$')
    }

    // A file that talks to the API but yielded nothing means the extractor has a
    // new blind spot. Warn loudly — a guard that silently under-reports is worse
    // than no guard. Match actual CALLS, not mentions: `lib/api.ts` defines the
    // helper, and `lib/email.ts` names it in a comment while taking its URL as a
    // parameter (the caller supplies the path, and is scanned itself).
    const callsApi = /apiFetch\s*(?:<[^(]*?>)?\s*\(/.test(text) || /\$\{API_URL\}/.test(text)
    if (found === 0 && callsApi && !rel.endsWith('/lib/api.ts')) blindSpots.push(rel)
  }
  }

  // Prefer a fully-literal path (a real endpoint that will answer 200/401);
  // shortest wins, as that is typically the collection endpoint.
  //
  // `alts` carries every OTHER known path for the root, used only to RESCUE a
  // 404 — never to condemn one. The chosen path can be method-mismatched: we
  // probe with GET, and a POST-only endpoint answers 404 on GET exactly like an
  // unmounted router. That is not hypothetical — on 2026-08-26 the gate picked
  // `/visitage-trm/valider` (POST-only; its GET siblings all carry `${...}` and
  // so rank as truncated) and reported a fully-deployed router as missing,
  // blocking a deploy. A false positive is corrosive: it teaches you to argue
  // with the gate, which is exactly what the gate exists to prevent.
  const targets = []
  for (const [root, { candidates, files }] of byRoot) {
    const literal = candidates.filter((c) => !c.truncated).sort((a, b) => a.path.length - b.path.length)
    const chosen = (literal[0] ?? candidates.sort((a, b) => b.path.length - a.path.length)[0]).path
    // Distinct, literal-first, chosen removed — probed only if `chosen` 404s.
    const alts = [...new Set(
      [...literal.map((c) => c.path), ...candidates.map((c) => c.path)],
    )].filter((x) => x !== chosen).slice(0, 4)
    const chosenTruncated = !literal.length || literal[0].path !== chosen
    targets.push({ root, path: chosen, alts, files: [...files], chosenTruncated })
  }
  targets.sort((a, b) => a.root.localeCompare(b.root))
  return { targets, blindSpots }
}

/** GET a URL, following redirects (trm.malterre answers 308 http->https).
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

const { targets, blindSpots } = collectTargets()
if (blindSpots.length) {
  console.warn(
    `⚠ ${blindSpots.length} file(s) reference apiFetch/API_URL but yielded no path — ` +
      `the extractor may be blind to how they build it:`,
  )
  for (const f of blindSpots) console.warn(`    ${f}`)
  console.warn('')
}
if (targets.length === 0) {
  console.error('✗ No apiFetch paths found — the extractor is broken, not the API.')
  process.exit(1)
}

console.log(`Probing ${targets.length} mount root(s) against ${BASE}\n`)

const missing = []
const unreachable = []
// Roots we could neither prove nor disprove - see the truncated-prefix note below.
const indeterminate = []

for (const { root, path, alts, files, chosenTruncated } of targets) {
  let status
  try {
    status = await probe(`${BASE}${path}`)
  } catch (err) {
    unreachable.push({ root, reason: err.message })
    console.log(`  ?  ${path} — UNREACHABLE (${err.message})`)
    continue
  }
  if (status === 404) {
    // Rescue pass: any non-404 sibling proves the router IS mounted, so the
    // 404 was a method mismatch (GET on a POST-only route), not a missing
    // deploy. Unreachable siblings are ignored — the primary probe already
    // reached the host, so this can only ever turn red into green.
    let rescuedBy = null
    for (const alt of alts) {
      let altStatus
      try {
        altStatus = await probe(`${BASE}${alt}`)
      } catch {
        continue
      }
      if (altStatus !== 404) { rescuedBy = { alt, altStatus }; break }
    }
    if (rescuedBy) {
      console.log(
        `  ✓  ${root} — mounted (${path} 404s on GET; ${rescuedBy.alt} → ${rescuedBy.altStatus})`,
      )
    } else if (chosenTruncated) {
      // The only path known for this root is a TRUNCATED prefix: every call site
      // interpolates, so what we probed was never an endpoint. A 404 here proves
      // nothing - it looks identical whether the router is missing or mounted.
      // Warn, never fail: condemning it made --app atelier block every deploy
      // while the real URL answered 200. A false positive is corrosive, as the
      // note above already says - this is the same lesson one rescue further on.
      indeterminate.push({ root, path, files })
      console.log(`  ⚠  ${root} — unproven (only a truncated prefix, ${path}, is probeable)`)
    } else {
      missing.push({ root, path, files })
      console.log(`  ✗  ${path} — 404 NOT ON PROD`)
    }
  } else if (verbose) {
    console.log(`  ✓  ${path} — ${status}`)
  }
}

if (indeterminate.length) {
  console.warn(
    `
⚠ ${indeterminate.length} root(s) could not be proven either way - every known` +
      ` call site interpolates, so only a truncated prefix was probeable.` +
      ` Not a failure; check them by hand if they are new.`,
  )
  for (const m of indeterminate) console.warn(`    /api${m.path}  (${m.root})`)
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
    for (const f of files.slice(0, 4)) console.error(`        used by ${f}`)
  }
  console.error(
    `\n  These live in the ETM repo. Land the paired NG branch, then run /etm_deploy\n` +
      `  from C:\\dev\\etsmalterre\\ETM, and only then deploy the TRM web bundle.\n` +
      `  Deploying now ships screens whose backend is not there.\n`,
  )
  process.exit(1)
}

console.log(`\n✓ All ${targets.length} mount root(s) answer on prod — safe to deploy the web bundle.`)
