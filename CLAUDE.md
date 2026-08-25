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

1. **Tableau de bord** (`/`, `/tableau-de-bord/:id`) — implemented, the ETM widget grid shared verbatim (see "Tableau de bord" below). First widget: **Poids des pièces**.
2. **Clients** — **Commandes** (`/clients/commandes`, implemented — voir "Commandes clients" ci-dessous), **Expéditions** (`/clients/expeditions`, implemented — TRM-specific, NOT shared, see below), **Facturation** (`/clients/facturation`, implemented — TRM-specific, NOT shared, see below), **Gestion** (`/clients/gestion`, implemented — see "Clients › Gestion" below), Planning
3. **Fils** — **Références** (`/fils/references`, shared verbatim with ETM), **Stock** (`/fils/stock`, implemented — TRM-specific, NOT shared, see "Fils › Stock" below), **Fournisseurs** (`/fils/fournisseurs`, shared verbatim with ETM)
4. **Tombé Métier** — **Références** (`/tombe-metier/references`, implemented — shared verbatim with ETM, see "Shared screens" below), Échantillons, **Stock** (`/tombe-metier/stock`, implemented — TRM-specific, NOT shared, see below). Menu icon is the custom `TmRollIcon`.
5. **Production** — **Gestion des OF** (`/production/of`, implemented — see "Production › Gestion des OF" below), Visitage, **Prime** (`/production/prime`, implemented — see "Production › Prime" below), TRS
6. **Atelier** — Maintenance, Productivité, Bonnetier, **Planning** (`/atelier/planning`, implemented — weekly bonnetier grid over `planning_bonnetier` + desiderata dialog; API route `ETM/apps/api/src/routes/planning-atelier.ts`)
7. **Qualité** — Défauts récents, Retour client, Analyse
8. **Rapports** — **Finance** (`/rapports/finance`, implemented — the menu's only screen, shared verbatim with ETM; see "Rapports › Finance" below). The Production / Lots de fils / État stock fil / Analyse placeholders were removed with it.
9. **Paramètres** — **Utilisateurs** (`/settings/utilisateurs`, implemented, admin-only — see "Paramètres › Utilisateurs" below)

All other screens are `PagePlaceholder`s for now. Legacy references for each domain: `FEN_Gestion_des_OF.wdw`, `FEN_Machines.wdw`, `FEN_Rapport_de_production.wdw`, etc. in `C:\Mes Projets\TRMPROD\` and the main MPS WinDev project (`FI_Planning_Atelier.wdw`, `FEN_Desiderata.wdw` in TRM mode).

### Commandes clients data model (legacy, shared HFSQL)

- Le registre TRM, c'est `commande_client` / `ligne_commande_client` **scopés `IDsociete = 2`** — les mêmes tables que l'écran ETM, autre partition. Une ligne TRM est toujours `TYPE = 1` (écru) et se compte en Kg : TRM tricote du tombé métier, rien d'autre.
- ⚠️ **Une commande dont `IDcommande_ETM > 0` est un miroir d'une commande sous-traitant ETM, et elle est en LECTURE SEULE ici.** ETM pilote son entête et ses lignes et les redescend ; il n'y a **pas** de synchro retour, donc une écriture côté TRM diverge en silence. C'est le cas courant, pas le cas limite : 93 % du registre. L'écran masque Modifier / l'édition des lignes / la clôture, et l'API refuse en 409 (`commande_miroir_etm`). Seules les commandes natives (`IDcommande_ETM = 0`) sont éditables.
- Le suivi d'une ligne passe par la **production**, pas par la réservation de stock comme côté ETM : `ordre_fabrication.IDligne_commande_client` → pièces sur **`stock_ecru.IDLigne_Commande_TRM`** (surtout pas `IDligne_commande_client`, qui reste à 0 sur les lignes TRM) → `ligne_expedition` via `IDligne_expedition_TRM`. « Produit » = somme des poids de ces pièces ; « expédié » = celles dont `IDligne_expedition_TRM > 0`.
- La pastille « 37 % » de la fiche ligne du legacy est la **marge** : `(prix − PrixDeRevientTRM) / prix`. Le prix suggéré à la saisie, lui, vient de `trmLinePrix` (cost / 0.7, plancher `ref_ecru.prix`) — les deux fonctions vivent dans `ETM/apps/api/src/lib/pricing-trm.ts` et ne sont pas interchangeables.
- Autres sources du tiroir Progression : `composition_ecru` → `stock_fil` (onglet Stock de fil ; le « potentiel » est borné par le composant le plus rare du mélange) et `ref_ecru_machine` → `machine.nom` (le « Compatible sur : 1H, 3F… » du pied de page).

### Clients › Expéditions data model — why it is NOT a shared screen

`expedition` / `ligne_expedition` are shared tables partitioned by
`expedition.IDsociete` (**TRM = 2**), but the two companies ship different
merchandise, so the ETM screen could not take a `societe` param. TRM has its own
screen (`apps/web/src/pages/ClientsExpeditions.tsx`) over its own endpoints
(`ETM/apps/api/src/routes/expeditions-trm.ts`, mounted at `/api/expeditions-trm`):

| | ETM expédition (IDsociete 1) | TRM expédition (IDsociete 2) |
|---|---|---|
| Merchandise | finished rolls (`stock_fini.IDligne_expedition`) or bought écru (`stock_ecru.IDligne_expedition_ETM`); the line's `TYPE` decides | always tombé de métier it knitted: **`stock_ecru.IDligne_expedition_TRM`** |
| Piece identity | lot + numéro + métrage + magasin | numéro + poids + **métier** (`ordre_fabrication.IDmachine` → `machine.nom`) + visitage défauts. `lot`, `metrage` are empty, `IDmagasin` is 0 |
| Free-stock pool | `stock_*.IDligne_commande_client` | **`IDLigne_Commande_TRM`** — `IDligne_commande_client` is 0 on every TRM row |
| Buckets | Textile / Diverses | Textile only — `expedition_divers` has **no** `IDsociete` column, so misc shipments are ETM-only |
| Documents | avis d'expédition + rapport de contrôle + info matières (3-item print menu) | avis d'expédition only — the visitage findings ride in its Défauts column |

**The handover rule (the one real footgun).** When TRM ships to ETS Malterre —
which is most shipments — ETM's reception takes **ownership** of the piece: the
legacy flow flips `stock_ecru.IDsociete` from 2 to 1 and stamps
`lot = 'trm<IDexpedition>'`. So a delivered avis's pieces are no longer TRM rows.
Reads therefore **never filter on IDsociete** (filtering would make every
delivered avis read "0 pièces"); writes **require `IDsociete = 2`** and the API
409s on any attempt to pull a received piece back off an avis, or to delete an
avis holding one. Shipments to a third-party client (e.g. Bonneterie Gautier)
keep their pieces at `IDsociete = 2`.

Like ETM, the legacy **validé / dévalider** concept stays retired: an expedition
is "non facturée" (editable) or "facturée" (`est_facture = 1`, or a definitive
facture references one of its `ligne_expedition` rows) and then every write 409s.
`est_valide` is written once at INSERT (0) and ignored. The accented
`envoyé_client` / `envoyé_sst` columns (the legacy list's two checkboxes) are
never named in SQL — that storms the Linux bridge — so they are not surfaced.

The avis d'expédition PDF is the shared `BonLivraisonPdf` with `variant: 'trm'`
(ports `ETAT_Expédition_TRM`): Tricotage Malterre's own footer (`companyTrm` in
`lib/pdf/theme.ts` — its own SIRET/TVA/capital, a legal requirement), a Défauts
column, no Métrage, and lots identified by *métier + lots Malterre + lots
fournisseur* rather than a lot code. Grouping is per `ordre_fabrication`: every
piece of an OF shares the machine and the yarn lots (`asso_fil_of` → `stock_fil`
`lot` / `lot_frs`), which is exactly that header line. The legacy **CSV TAD**
export is deliberately not ported.

### Clients › Facturation — partitioned, but the SAME object as ETM's

`facture` / `facture_prov` are partitioned by `IDsociete` like `stock_ecru`, but unlike it
the two halves are the **same object** (same columns, same lifecycle, same screen). So the
API is **one router factory mounted twice** — `createFacturesRouter(scope)` in
`ETM/apps/api/src/routes/factures.ts` → `/api/factures` (ETM) + **`/api/factures-trm`**
(TRM) — not a second route file. Everything société-dependent lives in one `FacturesScope`.
When a future TRM screen hits a partitioned table, pick between the two shapes on that
"same object?" test; don't default to copying `stock-ecru-trm.ts`.

The screen (`apps/web/src/pages/ClientsFacturation.tsx`) mirrors ETM's, with two
deliberate deltas:
- **Code comptable is exposed** in the Info tab (editable on a proforma). The legacy TRM
  facture window shows it and TRM really varies it — 478 of its 512 invoices on "Vente à
  façon", 33 on "Vente à façon internationale". It decides which sales account the XImport
  export posts the HT half to. ETM's screen leaves it implicit.
- **No "non envoyé" red liseré / counter pill.** TRM does not email its invoices: 511 of
  512 definitive factures have no `envoi_email` row (ETM has 1 517 that do), so the
  attention state would paint the whole list red — the noise `mps_designer` §41 rules out.
  If TRM ever starts sending from this screen, reintroduce it **with a go-live date cutoff**
  so the historical ledger stays neutral.

Proforma generation reads the rolls through `stock_ecru.IDligne_expedition_TRM` (ETM uses
`IDligne_expedition_ETM`) — the same physical roll carries both over its life, so reading
the wrong column invoices the wrong shipment's weight.

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

### Production › Gestion des OF (`/production/of`) — port of FEN_Gestion_des_OF.wdw

Fiche layout + §29 status pill; screen `apps/web/src/pages/ProductionOf.tsx`; API
`ETM/apps/api/src/routes/of-trm.ts` (`/api/of-trm` — the OF tables have **no IDsociete**,
scope goes through the commande chain). The legacy windows are PCS-compressed: the data
model was recovered from `MPS.xdd` + a live DB probe — the full dossier (column semantics,
event strings, formulas) lives in the plan `~/.claude/plans/golden-petting-shell.md`.

- **Queue**: `priorite` ranks OFs per métier (1 = running, 0 = terminé), one `est_actif`
  max per métier; Terminer re-ranks and flips the new head active if `auto_activation=1`
  (our endpoint owns that flip — the legacy trigger is unreadable).
- **Form mapping**: consigne = `observations`; Ouvert au large = `ouvert_visiteuse`;
  1/2 Nettoyages = `Nettoyage` (capital N); Visitage int = 1 « 2 premières pièces et
  toutes les 3 pièces » / 2 « Toutes les pièces » (0 = 20 legacy rows, shown « — »);
  Tricoter = `asso_fil_of`, Incorporer = `fil_incorpore`; nb_pieces derived
  ceil(quantite/poids_piece); quantité locked once production started.
- **5 sidebar tabs**: Observations = `message_of` (positional INSERT — reserved `date`);
  Production = `piece_production` + `evenement_piece` timeline (avatars =
  `bonnetier.photo` blob endpoint, initials fallback); Visitage = `stock_ecru` rolls;
  Qualité = `defaut_qualite` both populations (Type_Reference 1 = pièce, 2 = rouleau),
  trim `type_defaut` (historical `"Autre Barrure "`); Performance = `evenement_machine`
  (recorder covers PLC métiers only, no data after 2026-03-09 → honest empty state).
- **Flagged approximations** (legacy formulas unrecoverable): per-piece % =
  trs_10kg_chute/nb_chutes × poids/10 ÷ vitesse (fallback orf → machine → ref_ecru);
  faux-arrêts filter = 120 s. Imprimer (ETAT_OF work sheet) is still the §18 placeholder.

### Paramètres › Utilisateurs (`/settings/utilisateurs`) — TRM's own permission store

Port of ETM's screen (`apps/web/src/pages/SettingsUtilisateurs.tsx`): user list · Profil tab (email / photo / signature — the **shared** `/user-emails` + `/user-profiles` stores, one identity per person across both apps) · **Écrans** tab · **Permissions** tab. Notifications / « Copier les droits » are not ported yet — they arrive with the features that need them.

- **Permissions are TRM's own.** `PermissionsContext` reads **`/api/permissions-trm/me`**, the admin tab talks to `/api/permissions-trm/{keys,users}`; catalog `ETM/apps/api/src/lib/permission-keys-trm.ts`, store `data/permissions-trm.json`. Never point a TRM gate at `/api/permissions` — the two stores are separate so that neither admin screen can strip the other app's grants on save. A new switch = catalog entry (ETM API, paired NG worktree) + `trmUserHasPermission` on the route + `useHasPermission` in the screen. Default closed; effective admins bypass.
- **Écrans = a second axis, TRM's own tree, same store.** Menu/screen visibility, stored flat next to the action keys in `permissions-trm.json`: a **menu is a grant, default closed** (`screen_<menu>`), a **screen inside a granted menu is a hide** (`hide_<menu>_<screen>`) — so a newly shipped screen shows up for everyone who already holds its menu instead of being invisible until an admin ticks it per user. A menu left with no visible screen disappears; granting a menu clears its screens' hide keys. Keys derive from the href, so nothing is hand-maintained: the web builds both the admin tree and the nav filters from `mainNavigation` itself (`config/navigation.ts` § Screen access, `hooks/useSubmenuFilter.ts`), and the API manifest `ETM/apps/api/src/lib/screen-keys-trm.ts` mirrors it (diffed by `check-screen-access-trm.ts --nav <abs path to TRM navigation.ts>`).
  - ⚠️ **Hide keys are negative — read them via `hasRaw()`, never `has()`.** `has()` is true for every key when the viewer is an effective admin, so a hide read through it would hide the whole app from the admin. `/permissions-trm/me` never reports hide keys for an admin either. Pinned by `apps/web/src/config/navigation.test.ts`.
  - **Enforcement is the nav surfaces + one route guard in `AppShell` (`useScreenGuard`) — a curtain, not a lock.** Endpoints are shared across screens, so gating them per screen would break unrelated features; confidentiality stays with a server-checked action key. The guard also owns the menu index redirect (`/clients` → the first screen the user may open, which the router's static `<Navigate>` cannot know) and never gates `/`, the other dashboards, or `/settings`.
  - ⚠️ **Grandfathering is a deploy step**: `seed-screen-access-trm.ts --write` **on the prod API host**, before the TRM web deploy — menus are default-closed, so without it every non-admin loses the whole nav. It is idempotent and is also how a *newly added menu* is handed to everyone at once.
- First key **`edit_commandes_client`**: hides « Nouvelle » / « Modifier » in Clients › Commandes (Supprimer and line editing sit inside edit mode) and 403s the write routes of `/commandes-trm`. Clôture is deliberately not under it (ETM keeps a separate `cloture_commande_client`).
- **The user list is an allowlist**, not the whole shared `utilisateur` table: `TRM_STAFF` in the page (lowercase `prenom|nom`) — Vincent Malterre (admin), Nicolas Antonino, Mickael Grivelet, Isabelle Malterre, Laetitia Tellier, Pierre-Emmanuel Roux. Auth stays shared, so the picker still shows everyone. Mickael Grivelet was missing from the table: `ETM/apps/api/src/scripts/add-utilisateur-mickael-grivelet.ts` inserts him (idempotent; **run on prod before the first deploy**).

### Fils › Stock (`/fils/stock`) — port of `FI_Stock_Fil_TRM.wdw`

Tableau layout (§27). Screen `apps/web/src/pages/FilsStock.tsx`; API
`ETM/apps/api/src/routes/stock-fil-trm.ts` (second router on the `/api/stock` mount,
endpoints `/fil-trm/*`).

**`stock_fil` is NOT partitioned — no `IDsociete` column.** The legacy TRM screen and
ETM's Fournisseurs › Stock read the same ~1.7k rows: the yarn physically sits at TRM
(`IDMagasin = 1` on 99% of rows) and **`IDclient` names its owner** (TRM knits à façon —
Ets Malterre is TRM's biggest "client", holding most of the yarn). So the TRM screen
lists ALL rows (user-confirmed), with a Client column and a Disponible (`terminé=0`,
default) / Archivé / Tous filter. It is a different *flavor* of the same table, not a
shared screen: TRM adds the lifecycle actions ETM's screen doesn't have.

- **Read-only columns, verified against live data**: `stock` moves only via piece
  declaration (`Δ = stock_ecru.poids × asso_fil_of.pourcentage/100` — can go negative),
  `fil_incorpore`, and archivage (`stock = 0`); `dernier_mouvement` =
  max(`stock_ecru.date_saisie`) of the lot's OFs (183/183 parity). Never written by the web.
- **Lot numbering**: numeric string, unique key, `MAX(numeric lot)+1` computed **in JS**
  (SQL `MAX(lot)` is lexicographic; CAST unverified on the bridge), 3-attempt retry.
- **Create** writes IDclient, IDMagasin=1, `stock = stock_initial`,
  `dernier_mouvement = date_entree`, `dernier_pointage` (defaults date_entree) — ETM's
  older `POST /stock/fil` omits all four, don't reuse it.
- **Diviser**: new row copies the identity fields + gets lot max+1 and
  `stock = stock_initial = X`; source loses X on both columns. No ledger row exists.
- **Contrôle de titrage**: reference block from `ref_fil`
  (titrage/nb_fil/nb_brin/`unite_titrage`), Valider INSERTs into `controle_titrage` —
  positional INSERT, max+1 PK (reserved `date` column). ⚠️ **Physical column order is
  `IDcontrole_titrage, titrage, nb_fil, nb_brin, IDstock_fil, IDunite_titrage, date`** —
  trust the runtime `SELECT *` key order, NOT the `.xdd` analysis listing (they differ;
  this bit once).
- **Archivage** (`GET /fil-trm/:id/bilan` + `POST /fil-trm/:id/archiver`): freinte =
  `stock_initial − Σ(OF pieces poids × pourcentage/100)` — the **pourcentage weighting is
  load-bearing** on blended yarns (verified vs legacy annotations). Defects verdict =
  `defaut_qualite` `Type_Reference = 2` over the OFs' `stock_ecru` ids (« Aucun Défaut »
  smiley when empty). Writes corrected `stock_initial`, `observation_freinte`,
  `stock = 0`, `terminé = 1`. Thresholds (user-confirmed): freinte green ≤ 10 %, red
  above or negative; second choix green 0 / amber ≤ 5 % / red. PDFs: Dymo 89×36
  étiquette (`StockFilLabelPdf`) + A4 rapport de freinte (`RapportFreintePdf`,
  **`issuer: companyTrm`**).
- **`controlé` is a dead pre-2023 flag** (1 065 rows, always with `terminé=1`, unrelated
  to the 2-row `controle_titrage`) — never write it, never render it editable.
- **Windows driver footgun (this feature's discovery)**: any SELECT naming a
  **memo-binary column** (`certif_bio`, `certif_recyclé`) — or `SELECT *` on a table
  holding one (`stock_fil`, `client`) — silently returns **zero rows** on the Windows
  ODBC driver. Probe blobs with `LENGTH(col)` on Windows; `SELECT *` works on the Linux
  bridge. Both certif blobs are empty on every row (probed 2026-08), so the Linux
  archive path (delete + positional reinsert à la `setClientFlag`, blob slots `''`)
  is safe; it 409s `certificat_bloque` should a blob ever appear.
- Probe/parity script: `ETM/apps/api/src/scripts/probe-stock-fil-trm.ts` (read-only) —
  re-run it against prod after `/etm_deploy` to sanity-check the Linux paths.
- Dev note: `apps/web` `pnpm dev` **hardcodes `VITE_API_URL=:8080` via cross-env**,
  overriding `.env.development.local` — for a worktree API pair run
  `VITE_API_URL=http://localhost:808N/api pnpm exec vite --port 5175` instead.
### Production › Prime (`/production/prime`) — port of `FI_Prime.wdw`

Read-only dashboard (`apps/web/src/pages/ProductionPrime.tsx`; API
`ETM/apps/api/src/routes/prime-trm.ts`, mounted `/api/prime-trm`). The legacy `.wdw` is
PCS-compressed, but the full WLanguage survives as comments in the generated Android Java
(`C:\Mes Projets\MPS\Android\dbg\Compile\GWDFFEN_Prime.java`) — that is the recovered spec.

- **Period** = semester bounded by **15/06 and 15/12** (S1 = 15/12/(Y−1)→15/06/Y, labelled
  by the *fin* year; S2 = 15/06→15/12, labelled by the *début* year). Précédent/Suivant
  move a reference date ±6 months; Suivant is blocked on the current period.
- **Sums** = `SUM(stock_ecru.poids)` over `date_saisie` (a DATETIME) × rate: 1er choix
  (`second_choix = 0`) +0,05 €/Kg, 2nd choix (`second_choix = 1`) −0,20 €/Kg. **No
  IDsociete filter** (the ETM handover flips delivered pieces to société 1 — filtering
  would empty the semester); TRM production is scoped by **`IDordre_fabrication > 0`**
  instead, a deliberate delta from the legacy whose predicate also caught ETM `lot='fictif'`
  manual rows (~0.4% overcount). **Retour client (−0,60 €/Kg) is a dead tile**: the legacy
  hardcodes it to 0 (never wired); keep it displayed at 0 until a real data source exists.
- **Répartition** = every atelier employee — **no `regleur` filter and no `archivé` filter**
  (`date_sortie` is what scopes history) — whose employment overlaps the period; prorata of days from
  max(début, date_entree) to **min(today, fin, date_sortie)** — the period-end cap is the
  second deliberate delta (the legacy counted to *today* even on past semesters, so
  historical splits drifted). Photos come from `bonnetier.photo` (real JPEG blobs) via
  `/prime-trm/bonnetiers/:id/photo` — **binary needs `queryRaw`**, the normal `query()`
  path UTF-8-mangles blobs; the web falls back to initials on non-200.
- The **week always describes the current week** (Monday → open-ended) and therefore
  renders **only when the current semester is displayed** (screen and PDF both). On screen
  it is not a section of its own: it used to be a third navy band restating the same three
  production tiles at a smaller size, costing a full page row. It now rides the tiles it
  belongs to — one « Cette semaine · kg · € » footer per tile, the week named once in the
  hero — and its qualitative half is the déclassement table below. The PDF
  (`lib/pdf/PrimePdf.tsx`) still prints the week as a block: it rides `MalterreDocument`
  with `issuer: companyTrm`, renders the same `/prime-trm` payload as the screen, and
  deliberately omits the déclassement table — it is the payout document, not the ops view.
- **Déclassements de la semaine** (`semaine.declassements[]`) fills the column under the
  taux block inside the déclassements card: **one row per 2nd-choix roll** — the unit that
  costs money — with its métier, its poids, its manque à gagner (`poids × 0,20 €`, the same
  basis as `DeclassementType.montant` and the tile) and its `defaut_qualite` findings
  (`Type_Reference = 2`) folded onto a second line. It was the whole visitage log, **both
  choix**, until 2026-08-25; the user narrowed it to the déclassées, because the table lives
  inside the déclassements card and answers « qu'est-ce que la semaine a coûté ».
  - **The population is exactly the one `semaine.secondChoix` sums** (same `periodWhere(1,
    monday)` predicate), so the column's totals always equal the tile's — including
    **déclassées carrying no defect row**, which get a « Aucun défaut relevé » line rather
    than being dropped. Keep that invariant: a "must have a defect" filter would silently
    make the two disagree.
  - No per-row amber flag any more: every row is a déclassement, so the §7 colour would
    stop discriminating. The money column is what ranks the rows.
  - ⚠️ **`taille_cm` is NOT centimetres** (25 for « Moins de 50 cm », 1500 for « 1m - 3m »):
    the units are per-vocabulary and unrecoverable, so never render or sum it as a length.
    `description` already reads « Maille Moins de 50 cm » — render it verbatim (whitespace
    normalised: historical rows carry « Autre Barrure  Plus de 3m ») and keep « · » free as
    the separator *between* defects; identical labels fold into a `×N` (a piece really does
    carry four « Démaillage » rows).
- **Analyse des déclassements** (not in the legacy): taux de 2nd choix (kg-based) compared
  to the **previous semester in full** — always, including while the current one is still
  running. A same-elapsed-days window would be more like-for-like statistically, but it
  moves every day; the full previous semester is a fixed number to beat, which is the point
  of showing it (user decision, 2026-08-24 — don't "fix" it back). Plus the defect-type
  breakdown of the déclassé pieces
  (`defaut_qualite`, `Type_Reference = 2`). A piece's weight splits **equally across its
  distinct defect types** so the donut sums to the true déclassé weight; unknown types
  fold into « Autres », defect-less pieces into « Non renseigné ». Defects on 1er-choix
  pieces exist too — this section is about **déclassements**, don't rebrand it « défauts ».
  Donut colors are a fixed type→color map validated with the dataviz six-checks script.
- ⚠️ **The régleurs take part in the prime, and that changes what everyone gets.** The
  legacy filtered `regleur = 0`, which silently dropped the only two — Nicolas Antonino
  (16) and Mickaël Grivelet (15), both still employed. They share the **same pot** at a
  bonnetier's per-day weight, so the semester total is untouched and every other share
  shrinks. Applies to **all browsable periods**, past ones included, so historical splits
  no longer match what was actually paid (user decision, 2026-08-25 — same class of
  caveat as the rates below).
- ⚠️ **The rates are module constants in the API and apply to every browsable period**, so
  editing them recomputes the whole history and the screen would display primes that were
  never paid. A barème revision (under discussion with the atelier since 2026-08-24 — the
  scenario studied is +0,055 / −0,40 €/Kg) must therefore ship **date-effective rates**
  (barème applicable per semester) *before* the new values go in.

### Rapports › Finance (`/rapports/finance`) — ETM's screen, TRM's partition

Port of the legacy `FI_Analyse_Finance.wdw` (Analyse › Finance): the balance comptable
with a Charges fixes / Charges variables toggle, one row per compte, N vs N-1, and a
drawer holding the compte's yearly history and its two editable fields. Tableau layout
(§27).

**Nothing is forked — neither tier.** The API was already there: the finance widgets
(above) mount `createFinanceRouter(FINANCE_SCOPE_TRM)` at `/api/rapports-trm`, and this
screen reads the very same endpoints. Landing it was the two edits
`ETM/apps/api/src/lib/finance-common.ts` was left open for — `view_rapport_finance` joined
`financeKeys`, and `editComptesKey` switched the compte drawer's routes on.

- **The screen is ETM's file**: `import { RapportFinance } from '@etm/pages/RapportFinance'`,
  rendered `<RapportFinance basePath="/rapports-trm/finance" />`. `basePath` is the ONLY
  per-app difference (ETM defaults to `/rapports/finance`) — the frontend mirror of what
  `FinanceScope` is on the backend. Improve the file in ETM; never fork a TRM copy.
- **The rule** (verified to the cent on société 2): montant(compte, année) = `debit − credit`
  of the `releve_compta` row at the **last upload of that calendar year**. Uploads are
  cumulative YTD — never sum them, never take the early-January upload that closes the prior
  exercise. Class-7 accounts (`numero >= 700000`) are produits and are excluded.
- **Permissions**: `view_rapport_finance` + child `edit_compte_description` in
  `permission-keys-trm.ts`. Same key NAMES as ETM's catalog on purpose — same action,
  separate store. **The Rapports menu disappears entirely without the key**, Finance being
  its only screen (`SubMenuItem.permission`, on top of the menu's own `screen_rapports`
  grant). Nav hiding is convenience: the page renders "Accès restreint" and the API 403s.
- ⚠️ **`releve_compta` has no `id_societe`** — a compte id is the only thing that carries the
  partition. `GET /finance/comptes/:id/historique` had no ownership check while ETM was its
  only mount; it does now, or a TRM caller could have read an ETM payroll account's year
  series by guessing its id. Any future `:id` route on this factory needs the same guard.
- **One dependency was missing** for the shared screen: `xlsx` (Excel export of the visible
  rows). `lib/depassement.tsx` — the N/N-1 traffic light the screen and the Charges widget
  share — was already here, copied in with the widgets.
- HTTP guard for the two newly-mounted compte routes:
  `ETM/apps/api/src/scripts/check-finance-comptes-trm.ts`.

### Atelier planning data model (legacy, shared HFSQL)

- `planning_bonnetier` — `IDplanning_bonnetier`, `date_debut`/`date_fin` (DATETIME, one row per bonnetier per worked day), `IDbonnetier`. No équipe column: the shift (Matin/Après-Midi/Nuit) is derived from the start hour. Overnight (Nuit) shifts end on the next day.
- `bonnetier` — accented columns `prénom`/`archivé` (HFSQL accent rules apply). Grid rows = `archivé=0 AND regleur=0`; regleurs are excluded (roles in `role_employe`: apprenti/bonnetier/visiteur/regleur).
- `desiderata` — `DATE` (reserved word → returns uppercased; 8-char YYYYMMDD), `description`, `IDbonnetier`, `justifie`, `declare`. Writes use positional INSERT (max+1 PK) to avoid naming the reserved column. "En cours" = date ≥ today.

## Ticket widget (LIVA issue tracker) — feature version 1.1.1

In-app bug/feature reporting to the LIVA tracker (product **`trm-erp`**), same widget as
ETM's (spec + upgrade path: the `issue_tracker_integration` skill):

- **Widget**: `apps/web/src/components/tickets/` + trigger/unread badge in
  `components/layout/Header.tsx`, screenshot via lazy `html-to-image`. The files are
  verbatim mirrors of ETM's `components/tickets/` — improve them **in ETM** and re-copy.
  The single deliberate delta is `useTickets.ts` calling `/api/tickets-trm` instead of
  `/api/tickets`.
- **Proxy**: the ETM API's `routes/tickets.ts` router factory, mounted at
  `/api/tickets-trm` and scoped by env `ISSUE_TRACKER_PRODUCT_SLUG_TRM=trm-erp` —
  a **prod deploy requirement** on the shared API's env (`ETM/claude_doc/dev_setup.md` §4).
  Never point the widget at `/api/tickets`: the tracker key is company-scoped and the
  per-mount slug is what keeps ETM's and TRM's "Mes tickets" apart.
- Read state (unread badge) is `localStorage`-only, keyed per user — no HFSQL change.
  Reporters need an email mapped in Paramètres › Utilisateurs, or the proxy 400s.

## Shared screens (live cross-repo link with ETM)

Some screens are pixel-identical in both apps and hit the same non-partitioned data (e.g. Tombé Métier → Références over `/references-ecru`). Those are **not copied** — TRM imports the ETM source file directly, so editing the one file updates both apps:

- **Import**: `import { TombeMetierReferences } from '@etm/pages/TombeMetierReferences'` in `router.tsx`. The `@etm` alias points at `../../../ETM/apps/web/src` (vite.config.ts + tsconfig paths) — the two repos **must stay sibling directories** under `C:\dev\etsmalterre\` (worktrees like `TRM-ref-tm` are siblings too, so they work).
- **`@/` imports inside a shared screen resolve to THIS app's src** — the screen uses TRM's local copies of components/lib/hooks. Keep those copies in sync with ETM (they currently differ only in line endings, plus the `API_URL` dev fallback in `lib/api.ts`). Verbatim mirrors of ETM files, copied when a screen needed them — improve them **in ETM** and re-copy, never fork: `components/email/SendEmailDialog.tsx`, `components/ui/signature-preview.tsx`, `lib/email.ts`, plus the `components/ui/*`, `lib/*` and `hooks/*` that predate them.
- **The source of truth lives in ETM** — improve the screen there (or from here via the alias path, it's the same file). Never fork a TRM copy of a shared screen.
- **Adding a new shared screen**: (1) import it via `@etm/pages/...` in `router.tsx`; (2) add its file path to the `content` array in `tailwind.config.js` (explicitly — no globs — or its Tailwind classes won't be generated); (3) check the data it touches is either non-partitioned or already TRM-scoped; (4) if it needs modules TRM doesn't have yet, copy those from ETM first.
- **Guardrails already in vite.config.ts** — `server.fs.allow` (serves out-of-root files in dev) and `resolve.dedupe` (prevents a second React copy from ETM's node_modules, which would crash hooks). Don't remove either.
- Consequence: TRM builds require the ETM checkout to be present at the sibling path.
- **Changing a shared file from a paired worktree.** The alias targets the ETM *main* checkout, so an edit made in an NG worktree (`ETM-<feature>`) is invisible here until it lands on ETM master. For the dev loop, repoint the alias per worktree — gitignored, never committed: `apps/web/.env.local` with `ETM_WEB_SRC=../../../ETM-<feature>/apps/web/src` (read by `vite.config.ts` via `loadEnv`; restart the dev server) and `apps/web/tsconfig.local.json` extending `tsconfig.json` with the same `@etm/*` path, checked with `tsc --noEmit -p tsconfig.local.json`. The committed `tsconfig.json` / `pnpm build` keep pointing at ETM master, so the TRM branch only builds cleanly once the NG branch has landed — which is the landing order anyway.

## Tableau de bord — the ETM widget grid, shared verbatim

The screen is ETM's (`import { Dashboard } from '@etm/pages/Dashboard'`): same react-grid-layout grid, same edit mode (header "Personnaliser" slot, drag/resize, hidden-widget tray, several named dashboards as header tabs — ETM's `CLAUDE.md` § Navigation documents the mechanics). What makes it TRM's:

- **`src/components/dashboard/registry.tsx` is TRM-local** and is the whole catalog: `WIDGET_REGISTRY` (TRM widgets only) plus **`DASHBOARD_APP = 'trm'`**. The shared shell reaches it because ETM's `Dashboard.tsx` and `useDashboardLayout.ts` import the registry and types through `@/components/dashboard/…` (never `./…`), which resolves to *this* app's `src`. The other files in that folder (`types.ts`, `WidgetFrame.tsx`, `DashboardContextMenu.tsx`, `useDashboardLayout.ts`) are one-line `export * from '@etm/…'` shims — keep them shims. `WidgetDef` lives in ETM's `types.ts`, not its registry, precisely so TRM can type its registry without dragging ETM's widgets into the type-check.
- **Layouts are stored per app.** The hook calls `GET/PUT /api/user-profiles/me/dashboard?app=trm`; the store keeps `dashboards_trm` next to ETM's `dashboards` for the same `IDutilisateur` (`ETM/apps/api/src/lib/user-profiles.ts`). No `?app=` means ETM — every pre-existing client.
- **Widget permissions are TRM keys** (`ETM/apps/api/src/lib/permission-keys-trm.ts`, category « Tableau de bord », one `dashboard_*` key per widget, granted from Paramètres › Utilisateurs). The TRM `PermissionsContext` reads `/permissions-trm/me`; admins see every widget.
- **Plumbing TRM had to grow for the shell**: `contexts/HeaderActionsContext.tsx` (verbatim ETM mirror; `AppShell` wraps in its provider, `Header` owns the slot div and swaps the dashboard submenu for `useDashboardTabs()`), the `.dashboard-grid` block at the end of `index.css` (verbatim), `react-grid-layout` in `package.json` + `resolve.dedupe`, the `process.env.DRAGGABLE_DEBUG` define in `vite.config.ts`, `DASHBOARD_ROUTE_PREFIX` in `navigation.ts`, and the three ETM files in `tailwind.config.js` `content`.
- **Adding a widget** = one registry entry + its component in `src/components/dashboard/` + a key in `permission-keys-trm.ts` + an endpoint in `ETM/apps/api/src/routes/dashboard-trm.ts` (`/api/dashboard-trm`, one router for every TRM widget, gated with `trmUserHasPermission`). `dashboard-trm.ts` is for widgets with **no ETM equivalent**; a widget that mirrors an ETM one over a partitioned table gets a scoped router factory instead — see the finance widgets below.

### Widgets financiers — Charges · Chiffre d'affaires · Analyse financière · Évolution du CA

The four ETM finance widgets, over **TRM's own partition of the same books**. There is
no second aggregation: `upload_compta` / `compte_compta` (`id_societe`) and `facture`
(`IDsociete`) are partitioned tables whose two halves are the **same object**, so the API
is the `factures.ts` shape — **one router factory, two scopes** —
`createFinanceRouter(scope)` in **`ETM/apps/api/src/lib/finance-common.ts`**, mounted on
ETM's `rapportsRouter` (URLs unchanged) and at **`/api/rapports-trm`** for this app.
Everything société-dependent, *including which permission store answers*, lives in
`FINANCE_SCOPE_TRM`. Improve that file — never fork a TRM copy.

| Widget | Endpoint | Permission |
|---|---|---|
| Charges | `GET /rapports-trm/finance` | `dashboard_charges` |
| Analyse financière | `GET /rapports-trm/finance/analyse` | `dashboard_finance` |
| Chiffre d'affaires | `GET /rapports-trm/ca-clients` | `dashboard_ca` |
| Évolution du CA | `GET /rapports-trm/ca-evolution` | `dashboard_evolution_ca` (sous-droit, l'API exige `dashboard_ca`) |

- **The web components are verbatim mirrors of ETM's** (`components/dashboard/*Widget.tsx`
  plus `lib/depassement.tsx`) — improve them **in ETM** and re-copy, like
  `components/tickets/`. Deltas, all documented in each file's header: the endpoint path,
  a `trm-`-prefixed React Query key (the two apps must never share a cache entry for the
  same URL shape), and the CA donut below.
- **The Répartition donut drops ETM's 10 000 € / 5 000 € "Other" buckets.** TRM invoices
  **8 or 9 clients a year** (ETM: ~144) and bills **~98 % of its revenue to Ets Malterre**
  (2025: 335 304 € of 340 853 €), so those thresholds would fold the whole book except one
  client into a single grey wedge. Every client that billed something gets its own slice;
  the near-single ring is the finding, not a bug.
- **`/finance` is an any-of gate.** It returns the compte-by-compte balance (it names the
  salary lines) and feeds two unrelated consumers, so `FINANCE_SCOPE_TRM.financeKeys` lists
  **both** `dashboard_charges` (this widget) and `view_rapport_finance` (the Rapports ›
  Finance screen, landed 2026-08-25). Neither key is the other's parent — holding one does
  not imply the other, and **removing `dashboard_charges` from that list would silently
  blank this card** for anyone granted only the widget.
- **Verified against société 2 before shipping** (probe
  `ETM/apps/api/src/scripts/probe-finance-trm.ts`, re-run it after an `/etm_deploy`):
  the compte-level sums reproduce `upload_compta`'s `frais_fixe` / `frais_variable`
  **exactly** on the 2025 and 2026 anchors (46 633,56 € / 10 562,04 € at 2026-03-23), and
  the `facture` × `ligne_facture` CA agrees with `upload_compta.produits` to 0,0 % on
  2026 — two independent sources for the same number. The **2024 anchor drifts ~4,5 k€**
  because `frais_variable` is the compte's *current* classification, not the one in force
  that year; ETM drifts the same way and the legacy screen does too, so it is not corrected.
- **TRM's shape is the mirror of ETM's**: charges *fixes* dominate (46 634 € vs 10 562 €
  variables) and the marge brute runs at ~90 % of CA, because TRM knits **à façon** — the
  client supplies the fil, so there is almost no variable purchase. EBE 54 429 € on a CA of
  111 625 € at 2026-03-23.
- ⚠️ **The Charges pills compare a partial year against a *full* N-1** early in an
  exercise ("19 %" in March). That is the legacy rule — amount for a year = the last
  upload *falling in that calendar year* — and ETM's report reads the same way. Do not
  "fix" it on one side only: the two apps would then quote different figures for the same
  compte.

### Widget « Poids des pièces » — port of `FI_Mauvais_Compteur.wdw` + `FEN_Graphe_Compteur.wdw`

The legacy windows are PCS-compressed, but their SQL survives in **WinDev's compile cache** (`C:\Mes Projets\MPS\MPS.cpl\<user>\00000000\<Window>.<hash>.wdw.wcw` — string literals, identifiers and real literals are readable; integer literals and function names are not). That is the place to look for any future TRM port; the recovered query is quoted in full in `routes/dashboard-trm.ts`.

- **Unit = the roll** (`stock_ecru` row, the visiteuse's weighing), never `piece_production` — its `poids` is the nominal 20/10 kg, not a measurement. Target = `ordre_fabrication.poids_piece`.
- **Valid** ⇔ `poids_piece ≤ poids ≤ poids_piece + 0,7` **or `poids ≤ 0,65 × poids_piece`** — a remnant (end of lot, piece cut after a defect) is deliberately not held against the métier. Evaluated on the raw doubles, on purpose: `poids` is a 4-byte real, so a roll keyed as 20,7 reads 20.7000008 and is *invalid* in the legacy too. Verified 6/6 against the live widget.
- **Rows**: OFs with `est_actif = 1` **and at least one weighed roll**, sorted by pct ascending; Métier = `machine.emplacement`; Nb pièces = `COUNT(stock_ecru)`. Colours: red `< 0,6`, orange `< 0,8`, green (the two literals recovered next to the query; the boundary operators are an assumption). No `IDsociete` filter anywhere — the ETM handover flips delivered rolls to société 1 and the legacy counts them.
- **Chart** (click a row; legacy: double-click): every roll of the OF by `date_saisie`, dashed target line, band `[poids_piece, poids_piece + 0,7]`, red outside. Deliberate deltas: axis target ± 2 stretched to at most ± 4 with out-of-range points pinned as triangles (a 3 kg remnant must not squash the band), a grey remnant zone, X = weighing sequence, hover tooltip. The legacy's `18–22` axis is an inference (integer literals don't survive the cache).

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
