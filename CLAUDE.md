# TRM

> **Note**: this project was called `MPS-TRM` until 2026-07-30, when the repo and
> folder were renamed to **TRM** (alongside its sister `MPS_NG` → **ETM**).
> Deliberately unchanged because they are deployed infrastructure, not the project
> identity: the production hostname `mpstrm.malterre`, the server dist path
> `/home/debian/mps_trm`, and the workspace package name `@mps-trm/web`.

## Project Overview

TRM is the ERP web app for **Tricotage Malterre (TRM)**, the knitting production company of the Malterre Holding. It is the sister app of **ETM** (`C:\dev\etsmalterre\ETM`, the ETS Malterre ERP) and replicates its design and architecture exactly, migrating the legacy WinDev app's "Tricotage Malterre" mode screen by screen.

- **Company**: Tricotage Malterre (TRM) — knitting production (tricotage)
- **Owner**: Vincent Malterre
- **Legacy system**: the WinDev MPS app (`C:\Mes Projets\MPS\`) in Tricotage Malterre mode (red banner), plus the older standalone `C:\Mes Projets\TRMPROD\`
- **Sister project**: ETM (`C:\dev\etsmalterre\ETM`) — same design system, same conventions, same DB, same API

## Architecture — frontend-only repo, shared API and DB

**This repo contains only the web frontend.** There is deliberately no API here:

- **Database**: the shared HFSQL `MPS` database (same server as ETM). Shared tables (`client`, `commande_client`, …) are partitioned by `IDsociete` — **TRM = 2** (ETM = 1, Confection = 3). Every TRM write must set `IDsociete = 2`.
- **API**: the **ETM API** (`C:\dev\etsmalterre\ETM\apps\api`, dev port 8080). All HFSQL footgun-handling (encoding repair, bridge storm protection, accented columns, positional inserts) and TRM-specific logic (ETM↔TRM cross-ledger bridge, `isTricotageMalterreSst`) already live there. **New TRM endpoints get added to the ETM API**, scoped `IDsociete = 2` — never build a second API stack on the shared tables.
- **Auth**: the shared cookie auth (`mps_uid`) against the same API — login/user-picker, permissions and admin gating work identically to ETM.
- **Dev CORS**: this app runs on port **5175**, which is already in the ETM API's `CORS_ORIGIN` list (`apps/api/.env.development`). If the port changes, update that list.

When implementing a feature here you will therefore usually touch **two repos**: the screen in `TRM/apps/web`, and its endpoints in `ETM/apps/api`. All HFSQL rules from `ETM/CLAUDE.md` apply to those endpoints — read them before writing any route.

**Paired-worktree rule for API changes**: API work is done in an **ETM worktree** (never in the ETM main checkout — that's NG's integration tree) and lands through NG's own pipeline (`feat/*` → NG `master` → `/etm_deploy`). A TRM feature needing endpoints = a pair of same-named worktrees, the TRM one spun up with `--api 808N` pointing at the NG one. Landing order: NG branch first, then TRM. Full rule: `ETM/claude_doc/worktrees.md` §"Shared-API changes"; the `/feature-complete` skill enforces the guardrail.

## Production / deploy

- **Host**: `http://mpstrm.malterre` — nginx on `mfprod-erp` (`10.10.2.165`), dist at `/home/debian/mps_trm/dist`, `/api/` proxied to the shared ETM API (`10.10.2.163:8081`).
- **Deploy ownership**: this repo's `/trm_deploy` skill ships the **TRM web bundle only**. The shared API (and `mpsng.malterre`) is deployed exclusively from the ETM checkout with its `/etm_deploy`. If a TRM feature needed API changes, the API deploy (from ETM) must happen **before or with** the TRM web deploy.

## Branding

Identical to ETM — same colors, same design system:

| Color | Hex | Usage |
|-------|-----|-------|
| **Primary Blue** | #143D6B | Sidebar, navigation, headers |
| **Vivid Gold** | #F2B80A | CTAs, highlights, active states |
| **Accent Blue** | #3B7DC9 | Links, alternative accent |

Full design system: **`../ETM/.claude/skills/mps_designer/SKILL.md`** — the one and only
copy. This repo's `.claude/skills/mps_designer/SKILL.md` is a short **pointer** to it, not a
duplicate: it used to be a full copy with a "re-sync when it changes" note, that never
happened, and by 2026-07-30 it was 709 lines behind and teaching patterns ETM had already
replaced. Never restore the copy — improve ETM's file instead.

The `public/logo-*.png` files are currently the ETM logos as placeholders — replace with TRM logos when available.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript 5.7, Vite 6, Tailwind CSS 3.4 |
| UI | Radix primitives (shadcn-style), Lucide icons |
| State | TanStack React Query 5 |
| Monorepo | pnpm + Turborepo (apps/web only for now) |
| API (external) | ETM Express API on HFSQL — see Architecture above |

## Navigation Structure

Mirrors the legacy WinDev app in Tricotage Malterre mode (top → bottom):

1. **Tableau de bord** (`/`) — placeholder
2. **Clients** — Commandes, Expéditions, Facturation, **Gestion** (`/clients/gestion`, implemented — see "Clients › Gestion" below), Planning
3. **Fils** — Références, Stock, Fournisseurs
4. **Tombé Métier** — **Références** (`/tombe-metier/references`, implemented — shared verbatim with ETM, see "Shared screens" below), Échantillons, **Stock** (`/tombe-metier/stock`, implemented — TRM-specific, NOT shared, see below). Menu icon is the custom `TmRollIcon`.
5. **Production** — Gestion des OF, Visitage, Prime, TRS
6. **Atelier** — Maintenance, Productivité, Bonnetier, **Planning** (`/atelier/planning`, implemented — weekly bonnetier grid over `planning_bonnetier` + desiderata dialog; API route `ETM/apps/api/src/routes/planning-atelier.ts`)
7. **Qualité** — Défauts récents, Retour client, Analyse
8. **Rapports** — Production, Lots de fils, État stock fil, Analyse
9. **Paramètres** — Utilisateurs (admin-only)

All other screens are `PagePlaceholder`s for now. Legacy references for each domain: `FEN_Gestion_des_OF.wdw`, `FEN_Machines.wdw`, `FEN_Rapport_de_production.wdw`, etc. in `C:\Mes Projets\TRMPROD\` and the main MPS WinDev project (`FI_Planning_Atelier.wdw`, `FEN_Desiderata.wdw` in TRM mode).

### Tombé Métier › Stock data model — why it is NOT a shared screen

`stock_ecru` is partitioned by `IDsociete`, and the two halves are **different objects**,
so the ETM screen could not simply take a `societe` param. TRM has its own screen
(`apps/web/src/pages/TombeMetierStock.tsx`) over its own endpoints
(`ETM/apps/api/src/routes/stock-ecru-trm.ts`, mounted at `/api/stock/ecru-trm`):

| | ETM écru (IDsociete 1) | TRM écru (IDsociete 2) |
|---|---|---|
| Origin | bought from a tricoteur | knitted in-house: `IDordre_fabrication` → `ordre_fabrication.IDmachine` → `machine.nom` (the métier), `IDpiece_production` for the visitage timings |
| Storage | `IDmagasin` → `sous_traitant` | always 0 — TRM has no magasin dimension |
| Next step | affected to an ennoblisseur (`IDref_commande_affectation`), then becomes a `stock_fini` | shipped to the customer, usually ETM |
| "Still in stock" | `IDligne_expedition_ETM = 0` + no `stock_fini` child | `IDligne_expedition_TRM = 0` (~1k of ~6.7k rows) |
| Client reservation | `IDligne_commande_client` | **`IDLigne_Commande_TRM`** — `IDligne_commande_client` is 0 on every TRM row |
| Status filter | Disponible / En teinture / Tous | Disponible / Affecté / Tous — there is no teinture step in TRM's ledger |

`lot` and `metrage` are empty on TRM rows, so neither gets a column. The chain
`ligne_commande_client → commande_client → client` is identical, so
`resolveClientReservations` is **exported** from `stock-ecru.ts` and reused rather than
duplicated — same for `fetchDefectsByEcru` / `defautSummary`.

The screen is read-only: pieces are created and closed by the production/visitage flow,
never edited from here.

### Clients › Gestion (`/clients/gestion`) — port of `FI_Gestion_Client_TRM.wdw`

"Classeur" layout (`mps_designer §39`): left list · detail header · master-tabbed center · Info/Contacts/Adresses sidebar. Screen `apps/web/src/pages/ClientsGestion.tsx`; API `ETM/apps/api/src/routes/clients-trm.ts` (mounted `/api/clients-trm`, scoped `IDsociete = 2` — 27 clients).

**Not a shared `@etm` screen, on purpose.** ETM has the same window but a different fiche (tarifs/références catalog, marchandise expédiée, journal commercial) and a different ledger. Only the *server* plumbing is shared, via `ETM/apps/api/src/lib/clients-common.ts` — which both `clients.ts` and `clients-trm.ts` import, and which also registers the polymorphic contact/adresse CRUD on both mounts. Improve that lib rather than forking helpers.

- **TRM-only fields**: `client.rib`, `client.domiciliation`, `client.IDtransporteur`, and « Attente paiement facture » = the accented **`client.bloqué`** flag. Writes to it go through `setClientFlag` (delete + positional reinsert), never a named `SET` — the Linux bridge rejects accented identifiers, and prod is Linux.
- **Fields the TRM fiche does NOT have** (they belong to the ETM one): `client_interne`, `IDsecteur_activite`, `IDactivite`, `journal_commercial`, `dernier_contact`, `inclureRapportQualite`, `pct_ajeol` — so there is no « Général » card in the Info tab, and « Nouveau client » asks only for the nom and the compte. The API **must never name those columns in an UPDATE**: unnamed keeps the stored value, named would zero it. (All 27 société-2 rows currently hold 0 for the first three, which is itself evidence the legacy screen never wrote them.)
- **`tva` and `code_comptable` are partitioned by société.** TRM's « Vente à façon » is a different row from ETM's « VENTE FACON »; always use the `/clients-trm/lookups/*` endpoints, never ETM's.
- **Historique des commandes** — `commande_client` société 2, **including** the ETM-mirrored orders (`IDcommande_ETM > 0`): on this side those 2 518 rows *are* the knitting ETM ordered from TRM. Line types 1 (écru) / 2 (fini) / 3 (divers) / **4 (Confectionneur — `type_sst` 4, resolved against the écru catalog)**.
- **Stocks de fil** — `stock_fil.IDclient` is the yarn's owner (TRM knits à façon, the client supplies the fil).
- **Two deliberate gaps**, both because the legacy `.wdw` is PCS-compressed and unreadable:
  - the « En Attente » radio of Stocks de fil is **not implemented** (only En cours / Historique / Tous). `terminé` is the single state flag on `stock_fil`; `niveau` is the rack level, `controlé` is 0 on every open lot, and OF affectation doesn't fit either — nothing backs a third state. Do not invent one.
  - the historique's « Marge Brute » column is **rendered but always empty** (`marge_brute: null` from the API). Every observable legacy value is 0,00 %, so the formula could not be recovered. Fill it in when the calculation is specified.

### Atelier planning data model (legacy, shared HFSQL)

- `planning_bonnetier` — `IDplanning_bonnetier`, `date_debut`/`date_fin` (DATETIME, one row per bonnetier per worked day), `IDbonnetier`. No équipe column: the shift (Matin/Après-Midi/Nuit) is derived from the start hour. Overnight (Nuit) shifts end on the next day.
- `bonnetier` — accented columns `prénom`/`archivé` (HFSQL accent rules apply). Grid rows = `archivé=0 AND regleur=0`; regleurs are excluded (roles in `role_employe`: apprenti/bonnetier/visiteur/regleur).
- `desiderata` — `DATE` (reserved word → returns uppercased; 8-char YYYYMMDD), `description`, `IDbonnetier`, `justifie`, `declare`. Writes use positional INSERT (max+1 PK) to avoid naming the reserved column. "En cours" = date ≥ today.

## Shared screens (live cross-repo link with ETM)

Some screens are pixel-identical in both apps and hit the same non-partitioned data (e.g. Tombé Métier → Références over `/references-ecru`). Those are **not copied** — TRM imports the ETM source file directly, so editing the one file updates both apps:

- **Import**: `import { TombeMetierReferences } from '@etm/pages/TombeMetierReferences'` in `router.tsx`. The `@etm` alias points at `../../../ETM/apps/web/src` (vite.config.ts + tsconfig paths) — the two repos **must stay sibling directories** under `C:\dev\etsmalterre\` (worktrees like `TRM-ref-tm` are siblings too, so they work).
- **`@/` imports inside a shared screen resolve to THIS app's src** — the screen uses TRM's local copies of components/lib/hooks. Keep those copies in sync with ETM (they currently differ only in line endings, plus the `API_URL` dev fallback in `lib/api.ts`).
- **The source of truth lives in ETM** — improve the screen there (or from here via the alias path, it's the same file). Never fork a TRM copy of a shared screen.
- **Adding a new shared screen**: (1) import it via `@etm/pages/...` in `router.tsx`; (2) add its file path to the `content` array in `tailwind.config.js` (explicitly — no globs — or its Tailwind classes won't be generated); (3) check the data it touches is either non-partitioned or already TRM-scoped; (4) if it needs modules TRM doesn't have yet, copy those from ETM first.
- **Guardrails already in vite.config.ts** — `server.fs.allow` (serves out-of-root files in dev) and `resolve.dedupe` (prevents a second React copy from ETM's node_modules, which would crash hooks). Don't remove either.
- Consequence: TRM builds require the ETM checkout to be present at the sibling path.

## Design system rule

**Before building or modifying any user-facing screen, component, button, tab, card, dialog, or interaction pattern, you MUST invoke the `mps_designer` skill (`Skill(skill: "mps_designer")`).** Not optional — same rule as ETM. The skill is a pointer, so its first instruction is to `Read` ETM's canonical file — do that before writing code, not after.

**Before inventing a pattern, grep the ETM gold-standard reference screens** (`C:\dev\etsmalterre\ETM\apps\web\src\pages\`): `Entreprises.tsx`, `FilsGestion.tsx`, `FilsStock.tsx`, `FilsCommandes.tsx`, `EtudesColoris.tsx`. Reuse the exact same icons, strings and dialog structures.

Key invariants (full detail in the skill):
- Panel backgrounds `bg-zinc-100/80` (list/sidebar) / `bg-zinc-200/50` (header/footer) / `bg-white` (cards); `scrollbar-transparent` on scrollable panels. **Never hardcode hex values.**
- OS system font stack only — **no web fonts** (`@import`/`<link>`/`@font-face` are banned in `index.css`).
- "Modifier" CTA is always `<Button variant="gold">`.
- 3-panel `MasterDetailLayout` for master-detail screens; table-centric pattern (§27) for row-list screens; unsaved-changes guard (§28) on every edit-mode screen.
- Native `<select>` is banned — use `PopoverSelect` / `SearchableCombobox`.

## React / frontend rules (inherited from ETM)

- **Hooks before early returns** — violating crashes production builds (React error #310).
- **Shared `apiFetch`** (`src/lib/api.ts`) for every API call — sets `credentials: 'include'` for cookie auth. Never duplicate per page.
- **SW denylist for `/api/`** in `vite.config.ts` — never remove.
- **Never revert web build to `tsc -b`** — emitted `.js` in `src/` shadows `.tsx` sources in Vite. Build is `tsc --noEmit && vite build`.
- HFSQL booleans are `0`/`1` — always `!!value &&` in JSX to avoid rendering `0`.
- **`<Badge className="badge-warning">` renders navy, not amber.** The `.badge-*` helpers live in `@layer components` while the Badge's own `bg-primary` is a plain utility, and utilities beat components — the helper silently loses. For a coloured badge, pass `variant="outline"` plus explicit utilities (`bg-amber-500/15 text-amber-800 border-amber-500/30`). Applies to ETM's copy of `badge.tsx` too.

## Conventions

- **Code**: English. **UI**: French. **Comments**: English.
- **"check last screenshot"** → read the latest file in `%USERPROFILE%\Pictures\Screenshots`.
- Git remote: `github.com/etsmalterre/TRM` (etsmalterre account).

## Quick Start

```bash
pnpm install
pnpm dev          # web on http://localhost:5175

# The ETM API must be running (dev port 8080):
#   cd C:\dev\etsmalterre\ETM && pnpm dev
```

## Business Domain (Quick Reference)

Same glossary as ETM (`C:\dev\etsmalterre\ETM\claude_doc\business_glossary.md`).

| French | English |
|--------|---------|
| Tricotage | Knitting |
| Métier | Knitting machine |
| OF (Ordre de fabrication) | Production order |
| Tombé métier | Greige fabric off the machine |
| Visitage | Piece inspection |
| Bonnetier | Knitter (machine operator) |
| Fonture | Needle bed |
| Jauge | Gauge |
