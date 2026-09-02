# TRM

> **Note**: this project was called `MPS-TRM` until 2026-07-30, when the repo and
> folder were renamed to **TRM** (alongside its sister `MPS_NG` → **ETM**).
> Deliberately unchanged because they are deployed infrastructure, not the project
> identity: the server dist path `/home/debian/mps_trm` and the workspace package
> name `@mps-trm/web`. The production **hostname did follow**, on 2026-08-26:
> `mpstrm.malterre` → **`trm.malterre`** (the DNS moved first; the old name no longer
> resolves, though nginx still answers to it as an alias).

## Project Overview

TRM is the ERP web app for **Tricotage Malterre (TRM)**, the knitting production company of the Malterre Holding. It is the sister app of **ETM** (`C:\dev\etsmalterre\ETM`, the ETS Malterre ERP) and replicates its design and architecture exactly, migrating the legacy WinDev app's "Tricotage Malterre" mode screen by screen.

- **Company**: Tricotage Malterre (TRM) — knitting production (tricotage)
- **Owner**: Vincent Malterre
- **Legacy system**: the WinDev MPS app (`C:\Mes Projets\MPS\`) in Tricotage Malterre mode (red banner), plus the older standalone `C:\Mes Projets\TRMPROD\`
- **Sister project**: ETM (`C:\dev\etsmalterre\ETM`) — same design system, same conventions, same DB, same API

## MPS — the platform TRM runs on

**MPS = Malterre Productive System**: the shared platform behind every Malterre app — the
HFSQL `MPS` database and the **MPS API** (`mps-api.service`, `/home/debian/mps_api`, package
`@mps/api`). TRM is one **client** of that platform; ETM is another, a peer and not an owner.
Planned clients: the régleur mobile app, the bonnetier mobile app, the pointeuse, the atelier
display screens.

- The docs used to call it "the ETM API". They no longer do, because that one word made the
  platform read as another app's property, and a `/trm_deploy` once stopped at a red gate and
  handed the deploy back rather than going and shipping the API half. The code never made that
  mistake: `/api/health` has always answered `"app": "MPS API"`.
- ⚠️ **The MPS API's source lives in `ETM/apps/api` — a file location, not ownership.** A TRM
  feature needing an endpoint is a normal change to that repo, landed through a paired NG
  worktree. Full reasoning in `ETM/CLAUDE.md` §"MPS — the platform".
- **Deploying it affects every client at once** (one `systemctl restart mps-api`), so after an
  API deploy smoke-check `mpsng.malterre` as well as `trm.malterre`.
- `node ETM/scripts/deploy/preflight.mjs` answers "what needs deploying?" for the whole
  platform — both stamps, both repos, clean-tree checks, and owed prod seeds — in one
  read-only command.

## Architecture — frontend-only repo, shared API and DB

**This repo contains only the web frontend.** There is deliberately no API here:

- **Database**: the shared HFSQL `MPS` database (same server as ETM). Shared tables (`client`, `commande_client`, …) are partitioned by `IDsociete` — **TRM = 2** (ETM = 1, Confection = 3). Every TRM write must set `IDsociete = 2`.
- **API**: the **MPS API** (`C:\dev\etsmalterre\ETM\apps\api`, dev port 8080). All HFSQL footgun-handling (encoding repair, bridge storm protection, accented columns, positional inserts) and TRM-specific logic (ETM↔TRM cross-ledger bridge, `isTricotageMalterreSst`) already live there. **New TRM endpoints get added to the MPS API**, scoped `IDsociete = 2` — never build a second API stack on the shared tables.
- **Auth**: the shared cookie auth (`mps_uid`) against the same API — login/user-picker, permissions and admin gating work identically to ETM.
- **Dev CORS**: this app runs on port **5175**, which is already in the MPS API's `CORS_ORIGIN` list (`apps/api/.env.development`). If the port changes, update that list.

When implementing a feature here you will therefore usually touch **two repos**: the screen in `TRM/apps/web`, and its endpoints in `ETM/apps/api`. All HFSQL rules from `ETM/CLAUDE.md` apply to those endpoints — read them before writing any route.

**Paired-worktree rule for API changes**: API work is done in an **ETM worktree** (never in the ETM main checkout — that's NG's integration tree) and lands through NG's own pipeline (`feat/*` → NG `master` → `/etm_deploy`). A TRM feature needing endpoints = a pair of same-named worktrees, the TRM one spun up with `--api 808N` pointing at the NG one. Landing order: NG branch first, then TRM. Full rule: `ETM/claude_doc/worktrees.md` §"Shared-API changes"; the `/feature-complete` skill enforces the guardrail.

**The main checkout (`C:\dev\etsmalterre\TRM`) stays committed-clean between turns.** It is the
integration tree: several worktree sessions run at once and each expects to land whenever it
is done. `/feature-complete` lands on **`origin/master`** by a plain push, so a dirty main
checkout can no longer block a landing — but `/trm_deploy` **builds from this tree** and its
preflight blocks on a dirty or behind-`origin/master` checkout. So: an edit made here (a doc
split, a skill fix, a `CLAUDE.md` line) is **committed and pushed in the same turn** it is
made, never parked for review. (2026-09-02: a `CLAUDE.md` extraction sat uncommitted here for
a morning and stopped another session's landing one step short.) Feature work never happens
here at all — worktrees only.

## Feature dossiers — `claude_doc/`

`CLAUDE.md` is loaded into every session and is capped at **150 k characters**; it hit
157 k on 2026-09-02. Since then the detailed per-feature knowledge (data models, recovered
legacy SQL, formulas, user decisions and their dates, the footguns found along the way)
lives in **`claude_doc/<feature>.md`**, one file per screen or app, and `CLAUDE.md` keeps
a **short summary per feature** (what it is, where the code lives, the two or three
warnings that would bite in the first hour) with a pointer to the dossier.

- **Before touching a screen, `Read` its dossier** — the summary here is not enough to
  work on the feature, it is only enough to know the dossier exists and what it guards.
- **New feature knowledge goes in the dossier, not here.** Add or update a summary here
  only for a new feature or a new load-bearing footgun, and keep it under ~1 000 chars.
  `/feature-complete` and `learn_and_improve` write there too.
- ETM has the same folder (`ETM/claude_doc/`) for platform-wide topics (HFSQL, worktrees,
  deploy). TRM's holds TRM screens only.

| Dossier | Covers |
|---|---|
| `claude_doc/atelier-pwa.md` | `apps/atelier`, the bonnetier/régleur phone PWA |
| `claude_doc/trs-tablette.md` | `apps/trs`, the wall tablet (plan du parc, TRS formula, tile colours) |
| `claude_doc/commandes-clients.md` | Clients › Commandes: data model, mirror orders, pricing rules, « Créer un OF », confirmation PDF/email |
| `claude_doc/clients-expeditions.md` | Clients › Expéditions and the ETM handover rule |
| `claude_doc/clients-facturation.md` | Clients › Facturation (router factory, code comptable) |
| `claude_doc/tombe-metier-stock.md` | Tombé Métier › Stock (TRM écru partition, Dymo reprint) |
| `claude_doc/clients-gestion.md` | Clients › Gestion (TRM fiche client) |
| `claude_doc/production-of.md` | Production › Ordres de fabrication + Observations régleur (`obs_ref_ecru`) |
| `claude_doc/atelier-maintenance.md` | Atelier › Maintenance (rouloir, garniture, jauges) |
| `claude_doc/production-visitage.md` | Production › Visitage (le poste, `POST /valider`, étiquette Dymo, kiosk Chrome) |
| `claude_doc/production-trs.md` | Production › TRS (tableau de bord d'équipe, timeline) |
| `claude_doc/parametres-utilisateurs.md` | Paramètres › Utilisateurs: permission store, Écrans axis, comptes-postes |
| `claude_doc/qualite-retour-client.md` | Qualité › Retour client + boucle FNC avec ETM |
| `claude_doc/fils-stock.md` | Fils › Stock (lots, diviser, archivage, freinte, titrage) |
| `claude_doc/production-prime.md` | Production › Prime (semestres, barèmes datés, répartition) |
| `claude_doc/rapports-finance.md` | Rapports › Finance (ETM screen on TRM partition) |
| `claude_doc/tickets.md` | Ticket widget (LIVA), comptes sans email |
| `claude_doc/dashboard-widgets.md` | Widgets finance, « Poids des pièces », « Pièces à visiter » |

## Atelier — la PWA mobile de l'atelier (`apps/atelier`)

Migration de l'app Android legacy des bonnetiers/régleurs : **deuxième app du monorepo**,
hôte **`atelier.malterre`** (en ligne depuis le 2026-08-28), port dev **5176**, version
propre (`apps/atelier/package.json`). Accueil (grille de visages) → Choix Métier → Poste
avec saisie : les huit actions du legacy s'enregistrent via `POST /api/atelier/of/:id/evenement`
sous le droit `saisie_atelier`. API `ETM/apps/api/src/routes/atelier.ts`, réutilise
`lib/production-trm.ts`. Conception : `~/.claude/plans/atelier-malterre.md`.
**Dossier complet : `claude_doc/atelier-pwa.md`** — à lire avant tout travail dessus.

- ⚠️ **Pas d'annulation** (le legacy en a une) ; **aucun téléphone ne peut écrire** tant
  que le compte-poste n'existe pas et que personne ne détient `saisie_atelier`.
- ⚠️ **Le libellé n'est pas la chaîne stockée** (« Fin de pièce » écrit `Fin du tricotage`),
  et **la liste des actions est recalculée au serveur** : `apps/atelier/src/lib/actions.ts`
  et `routes/atelier.ts` se changent ensemble, l'API faisant foi.
- ⚠️ Le libellé d'un métier est `machine.emplacement`, l'**inverse** d'Atelier › Maintenance.
- ⚠️ `signUserId()` rend la même chaîne pour toujours (cookie copiable) ; à traiter avant
  qu'un compte régleur existe. `atelier.malterre` a son propre bocal à cookies.
- Le legacy Android n'est pas PCS-compressé : `C:\Mes Projets\MPS\Android\dbg\Compile\`
  est la spec (instantané du 24/03/2026).

## TRS — la tablette murale de l'atelier (`apps/trs`)

Port de `Appli_TRS` : **une tablette au mur** montrant le plan du parc, une tuile par métier,
état lu **dans la base** (jamais l'automate). **Troisième app**, hôte **`trs.malterre`**
(en ligne), port dev **5177**, version propre. Passive, lecture seule, **aucune identité ni
cookie**. API `GET /api/trs/atelier` (`routes/trs.ts`), calcul pur et testé dans
`lib/trs-trm.ts`, poll 10 s. Conception : `~/.claude/plans/trs-atelier.md`.
**Dossier complet : `claude_doc/trs-tablette.md`** (formule, deltas assumés, plan du parc,
tuile, barèmes, ⓘ, bandeau, logo, `--u`).

- **La formule est celle de `FI_TRS`** : `TRS = marche / (temps d'OF − déductibles)` sur
  l'équipe en cours (5–13 / 13–21 / 21–5), déductibles = min(60 s, arrêt) + 3 min par
  Nettoyage (6 avec lycra) + 5 min par fin de pièce (8 avec lycra). ⚠️ **Le TRS dépasse
  100 %** quand les forfaits dépassent l'arrêt réel — pas un bug.
- ⚠️ **Le plan est tourné de 180°** à l'écran (1A en haut à droite) et la rotation vit dans
  `plan.ts`, jamais en CSS. **1B est un emplacement vide.**
- ⚠️ La pastille « arrêts / pièce » n'est **pas** le compte d'équipe : moyenne sur les 3
  dernières pièces terminées de l'OF actif, cachée par (OF, ids). Trois barèmes sont des
  approximations (`lib/affichage.ts`, dossier §4.3) ; les seuils 1 min / 5 min ne
  s'harmonisent pas.
- ⚠️ **Aucun chiffre du dialogue ⓘ n'est un littéral** : `lib/regles.ts`, dont le test
  importe directement `ETM/apps/api/src/lib/trs-trm.ts`.
- En dev les chiffres sont faux (instantané de mars) : juger la parité sur la prod avec
  `scripts/probe-trs-trm.ts`.

## Production / deploy

- **Host**: `http://trm.malterre` — nginx on `mfprod-erp` (`10.10.2.165`), dist at `/home/debian/mps_trm/dist`, `/api/` proxied to the MPS API (`10.10.2.163:8081`).
- **Deploy ownership**: this repo's `/trm_deploy` skill ships the **TRM web bundle only**. The shared API (and `mpsng.malterre`) is deployed exclusively from the ETM checkout with its `/etm_deploy`. If a TRM feature needed API changes, the API deploy (from ETM) must happen **before or with** the TRM web deploy — and that ETM leg is part of the job: on `/trm_deploy`, go run `/etm_deploy` in the ETM checkout rather than handing the deploy back to the user (see `trm_deploy` §Scope).

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

1. **Tableau de bord** (`/`, `/tableau-de-bord/:id`) — implemented, the ETM widget grid shared verbatim (see "Tableau de bord" below). Widgets propres à TRM : **Poids des pièces** et **Pièces à visiter**, plus les quatre widgets financiers d'ETM sur la partition société 2.
2. **Clients** — **Commandes** (`/clients/commandes`, implemented — voir "Commandes clients" ci-dessous), **Expéditions** (`/clients/expeditions`, implemented — TRM-specific, NOT shared, see below), **Facturation** (`/clients/facturation`, implemented — TRM-specific, NOT shared, see below), **Gestion** (`/clients/gestion`, implemented — see "Clients › Gestion" below), Planning
3. **Fils** — **Références** (`/fils/references`, shared verbatim with ETM), **Stock** (`/fils/stock`, implemented — TRM-specific, NOT shared, see "Fils › Stock" below), **Fournisseurs** (`/fils/fournisseurs`, shared verbatim with ETM)
4. **Tombé Métier** — **Références** (`/tombe-metier/references`, implemented — shared verbatim with ETM, see "Shared screens" below), Échantillons, **Stock** (`/tombe-metier/stock`, implemented — TRM-specific, NOT shared, see below). Menu icon is the custom `TmRollIcon`.
5. **Production** — **Ordres de fabrication** (`/production/of`, implemented — see "Production › Ordres de fabrication" below), **Visitage** (`/production/visitage`, implemented — see "Production › Visitage" below), **Prime** (`/production/prime`, implemented — see "Production › Prime" below), **TRS** (`/production/trs`, implemented — see "Production › TRS" below)
6. **Atelier** — **Maintenance** (`/atelier/maintenance`, implemented — see "Atelier › Maintenance" below), Bonnetier, **Planning** (`/atelier/planning`, implemented — weekly bonnetier grid over `planning_bonnetier` + desiderata dialog; API route `ETM/apps/api/src/routes/planning-atelier.ts`)
7. **Qualité** — Défauts récents, **Retour client** (`/qualite/retour-client`, implemented — the menu’s index redirect, see "Qualité › Retour client" below), Analyse
8. **Rapports** — **Finance** (`/rapports/finance`, implemented — the menu's only screen, shared verbatim with ETM; see "Rapports › Finance" below). The Production / Lots de fils / État stock fil / Analyse placeholders were removed with it.
9. **Paramètres** — **Utilisateurs** (`/settings/utilisateurs`, implemented, admin-only — see "Paramètres › Utilisateurs" below)

All other screens are `PagePlaceholder`s for now. Legacy references for each domain: `FEN_Gestion_des_OF.wdw`, `FEN_Machines.wdw`, `FEN_Rapport_de_production.wdw`, etc. in `C:\Mes Projets\TRMPROD\` and the main MPS WinDev project (`FI_Planning_Atelier.wdw`, `FEN_Desiderata.wdw` in TRM mode).

### Commandes clients data model (legacy, shared HFSQL)

`commande_client` / `ligne_commande_client` scopés `IDsociete = 2` ; une ligne TRM est
`TYPE = 1` en Kg. Suivi par la production : `ordre_fabrication.IDligne_commande_client` →
`stock_ecru.IDLigne_Commande_TRM` → `ligne_expedition` via `IDligne_expedition_TRM`.
**Dossier complet : `claude_doc/commandes-clients.md`** (modèle, tarif, tiroir Progression,
« Créer un OF », confirmation Imprimer / Email).

- ⚠️ **`IDcommande_ETM > 0` = miroir d'une commande sous-traitant ETM, LECTURE SEULE ici**
  (93 % du registre) ; l'API refuse en 409 `commande_miroir_etm`. **Sauf l'état** (LIVA #1100,
  2026-09-02) : TRM solde un miroir une fois tous ses OF terminés et tous ses rouleaux expédiés
  (`cloture` sur le détail, 409 `commande_non_terminee`) ; ETM le voit « Soldée par TRM » et
  clôture sa propre commande — personne n'écrit le drapeau de l'autre société.
- ⚠️ **Tarif suggéré = `max(PrixDeRevientTRM, ref_ecru.prix) / 0,7`** (`'cost-floor'`),
  **pas** `trmLinePrix` (`'price-floor'`, sous-traitance ETM → TRM, colle au WinDev). Ne pas
  unifier sans trancher le prix de transfert intercompany.
- ⚠️ **L'onglet Stock de fil est scopé au client de la commande** (`IDclient`, `IDMagasin = 1`,
  `terminé = 0` — les trois, `stock > 0` ≠ `terminé = 0`). TRM tricote à façon.
- ⚠️ **Une composition est une liste de POSITIONS D'ALIMENTATION, pas de fils** : lignes en
  double légitimes, clés par `IDcomposition_ecru`, jamais regroupées par couple (fil,
  coloris). Le test de manque de lot est **par lot**, jamais par ligne.
- « Créer un OF » (`CreateOfDialog.tsx`, partagé avec Production › OF, sous `edit_of`)
  n'apparaît que si chaque fil de la composition a un lot coché ; « Ajouter un fil » sert à
  tricoter hors fiche **et** à servir une part depuis plusieurs lots (badge « hors réf »
  neutre). `obs_ref_ecru` y est en lecture seule.
- `ligne_commande_client.prix` est un réel 4 octets : arrondir le bruit flottant à l'affichage.
- Le PDF de confirmation est `CommandeClientPdf.tsx` d'ETM rendu avec `company: companyTrm`,
  disponible aussi sur les miroirs, pas de CGV, journal `envoi_email` `IDtype_doc = 7`.

### Clients › Expéditions data model — why it is NOT a shared screen

`expedition` partitionné `IDsociete = 2` mais marchandise différente d'ETM : écran propre
(`ClientsExpeditions.tsx`, `routes/expeditions-trm.ts` → `/api/expeditions-trm`). Pièces =
`stock_ecru.IDligne_expedition_TRM`, pool libre `IDLigne_Commande_TRM`, Textile seulement,
avis d'expédition = `BonLivraisonPdf` `variant: 'trm'` (`companyTrm`).
**Dossier : `claude_doc/clients-expeditions.md`.**

- ⚠️ **Handover rule** : c'est **« Expédier » côté TRM** (pas la réception ETM — sondé sur le
  legacy le 2026-09-02) qui stampe `lot = 'trm<IDexpedition>'` sur tout rouleau expédié et
  bascule `stock_ecru.IDsociete` 2 → 1 quand le client est Ets Malterre
  (`stampShippedPieces` / `releaseShippedPieces`). **Les lectures ne filtrent jamais
  `IDsociete`** ; un rouleau ne revient à TRM que si ETM n'y a pas touché, sinon 409.
- **« Expédier » depuis Clients › Commandes** (LIVA #1109) : tiroir Progression › Affectation,
  sélection §44, `POST /commandes-trm/:id/lignes/:ligneId/expedier` — un avis, une ligne.
- Validé / dévalider retiré ; « facturée » ⇒ toute écriture 409. `envoyé_client` /
  `envoyé_sst` accentués, jamais nommés en SQL.
- **Écritures sous `edit_expeditions`** (fermé par défaut — `seed-edit-expeditions-trm.ts --write`
  sur le serveur avant le déploiement web), « Expédier » compris.

### Clients › Facturation — partitioned, but the SAME object as ETM's

`facture` / `facture_prov` : même objet des deux côtés, donc **une fabrique montée deux
fois** — `createFacturesRouter(scope)` → `/api/factures` + `/api/factures-trm`. Écran
`ClientsFacturation.tsx`. **Dossier : `claude_doc/clients-facturation.md`.**

- Deltas : code comptable exposé (« Vente à façon » vs « … internationale ») ; **pas de
  liseré « non envoyé »** (TRM n'envoie pas ses factures par email).
- ⚠️ La proforma lit `stock_ecru.IDligne_expedition_TRM` (ETM : `_ETM`) — la mauvaise
  colonne facture le poids d'une autre expédition.
- Test pour tout futur écran sur table partitionnée : « même objet ? » → fabrique de
  routeur ; sinon route propre (patron `stock-ecru-trm.ts`).

### Tombé Métier › Stock data model — why it is NOT a shared screen

`stock_ecru` société 2 est un **autre objet** que la moitié ETM (tricoté en interne, OF →
métier, pas de magasin, expédié au client). Écran `TombeMetierStock.tsx`, API
`routes/stock-ecru-trm.ts` → `/api/stock/ecru-trm`, lecture seule.
**Dossier : `claude_doc/tombe-metier-stock.md`.**

- Réservation client = `IDLigne_Commande_TRM` ; « en stock » = `IDligne_expedition_TRM = 0` ;
  filtres Disponible / Affecté / Tous. `resolveClientReservations` et
  `fetchDefectsByEcru` sont **exportés** de `stock-ecru.ts`, pas dupliqués.
- Le tiroir réimprime l'étiquette Dymo via `GET /visitage-trm/etiquettes?ids=` (désactivé
  si `IDordre_fabrication` nul) — ⚠️ cet endpoint a **deux appelants**, poste compris.
- ~1 000 pièces : le double rendu §27 est gardé par `useIsDesktop()` (voir React rules).

### Clients › Gestion (`/clients/gestion`) — port of `FI_Gestion_Client_TRM.wdw`

Classeur §39, `ClientsGestion.tsx`, API `routes/clients-trm.ts` (`/api/clients-trm`, 27
clients). Plomberie serveur partagée dans `lib/clients-common.ts` (importée par les deux
apps). **Dossier : `claude_doc/clients-gestion.md`.**

- ⚠️ Champs TRM-only : `rib`, `domiciliation`, `IDtransporteur`, **`bloqué`** (accentué →
  `setClientFlag`, réinsertion positionnelle). **Ne jamais nommer** dans un UPDATE les champs
  de la fiche ETM (`client_interne`, `IDsecteur_activite`, `journal_commercial`…).
- `tva` / `code_comptable` partitionnés : toujours `/clients-trm/lookups/*`.
- Deux lacunes assumées (legacy PCS-compressé) : pas de radio « En Attente » sur Stocks de
  fil, colonne « Marge Brute » rendue vide.

### Production › Ordres de fabrication (`/production/of`) — port of FEN_Gestion_des_OF.wdw

Fiche + pill §29, `ProductionOf.tsx`, API `routes/of-trm.ts` (`/api/of-trm` — les tables OF
n'ont **pas d'`IDsociete`**). Droit `edit_of` sur les neuf routes d'écriture. Dossier plan :
`~/.claude/plans/golden-petting-shell.md`.
**Dossier complet : `claude_doc/production-of.md`** (mapping du formulaire, file d'attente,
recherche, onglets, Observations régleur).

- File : `priorite` par métier (1 = en cours, 0 = terminé), un `est_actif` par métier ;
  Terminer re-classe et active la tête si `auto_activation = 1`.
- **Recherche identique dans les trois onglets** ; Terminés via `?q=`, `searchTermineIds`
  en JS (LIKE HFSQL ne replie pas les accents). ⚠️ Un nombre est à la fois n° d'OF et
  référence plausible : l'OF exact en tête, puis les libellés.
- ⚠️ **L'onglet Obs. lit `obs_ref_ecru` (consignes durables de la référence, par métier et
  coloris), empilé avec `message_of`** — pas `message_of` seul (corrigé le 2026-08-27).
  Scope lu sur l'OF (ses `IDref_ecru` / `IDcolori_ecru`), pas sur la ligne de commande.
  Saisie via `components/of/ObsRefEcru.tsx`, sous `edit_of` + mode édition ; INSERT
  positionnel (`DATE` réservé) ; une modification ne re-date pas la ligne.
- ⚠️ L'écran Tombé Métier › Références (fichier ETM) reçoit l'éditeur par la prop
  `obsOfEditor` (un composant injecté depuis `router.tsx`), jamais une URL TRM.
- Deux colonnes du corps de fiche au-dessus de ~780 px de **panneau** (`useElementSize`),
  jamais un palier Tailwind ; en-tête sur une ligne ; consigne en bandeau rouge §46.
- Approximations signalées : % par pièce, filtre faux-arrêts 120 s ; Imprimer (ETAT_OF)
  toujours placeholder.

### Atelier › Maintenance (`/atelier/maintenance`) — port de `FI_Maintenance.wdw`

Fiche §4–§9, `AtelierMaintenance.tsx` + `MaintenanceGauge.tsx`, API
`routes/maintenance-trm.ts`. Spec récupérée dans le **cache de compilation WinDev**
(`MPS.cpl/<user>/00000000/FI_Maintenance.*.wcw`). Droit `edit_maintenance`.
**Dossier : `claude_doc/atelier-maintenance.md`.**

- ⚠️ « Description » = `machine.commentaire`, **pas** `nom`. Vraies fautes de colonnes :
  `observation_maintenace`, `comm_pulsonque`. `connecté` / `archivé` / `diamètre`
  accentués → `SELECT *` + pliage, filtre en JS ; le `SET` ne nomme que la maintenance.
- Compteur rouloir : Σ `quantite` des OF terminés après `date_maintenance`, **seuil
  15 000 Kg mesuré 14/14** (`probe-maintenance-trm.ts`) — constante de module ; si elle
  change, table datée comme `BAREMES_PRIME`.
- Jauges = les 3 lignes `operation_maintenance`, atelier-wide, rendues dynamiquement.

### Production › Visitage (`/production/visitage`) — port of `FI_Visitage.wdw`

Layout **« Poste » (§45)**, `ProductionVisitage.tsx`, API `routes/visitage-trm.ts`
(`/api/visitage-trm`), helpers `lib/production-trm.ts`. Droit `saisie_visitage` (bouton
Valider + route d'écriture seulement). Dossier plan : `~/.claude/plans/visitage-tombe-metier.md`.
**Dossier complet : `claude_doc/production-visitage.md`** — le plus long, à lire en entier
avant de toucher `POST /valider`, la carte rouleau ou l'étiquette.

- ⚠️ **`POST /valider` est le seul écrit, sans transaction** : crée les `stock_ecru`,
  convertit les défauts (`Type_Reference` 1 → 2, origine sur `Type_Spotteur`), trace
  l'événement, **décrémente le fil** (Σ poids × `pourcentage/100`, déclassés compris).
  `?dry_run=1` pour les gardes.
- ⚠️ **Sérialisé côté API (`validerLock`, `lib/serial-lock.ts`) et tiré une fois côté web
  (`createLatch`)** depuis l'incident du 2026-08-28 (double POST → rouleaux en double).
  `isPending` ne suffit pas. Le même patron « check, MAX+1, INSERT » sans verrou existe
  dans les autres routes d'écriture TRM.
- Deux séquences par OF (1er choix `< 1000`, déclassé dès **1001**) ; pièce isolée offerte
  7 jours (`ORPHAN_MAX_AGE_DAYS`, dur) ; quantité d'un défaut corrigible au poste, **champ
  vide = ne touche à rien, jamais 0** (`qteDigits` / `qteCommit`, testés).
- La carte rouleau porte sa teinte sur son corps : rien de posé dessus ne peut être un
  lavis de la même teinte. Identification par visage (`VisiteurGate`, local à l'écran).
- **Étiquette Dymo** à la validation (`EtiquetteEcruPdf.tsx`, port de `ImprimeEtiquetteTM`,
  `printPdf()` via blob + iframe) : ⚠️ `SAFE_RIGHT = 26` pt est une **zone imprimable**,
  ne pas rééquilibrer ; le poste lance Chrome avec `--kiosk-printing --user-data-dir=
  "C:\visitage-profile" --app=https://trm.malterre/production/visitage`.
- Scripts : `probe-visitage-trm.ts`, `check-visitage-trm.ts`, seeds dev-only.

### Production › TRS (`/production/trs`) — port de `FI_TRS.wdw`

Tableau de bord d'équipe : bonnetiers **pointés**, quatre KPI dépliables, timeline par
métier. `ProductionTrs.tsx` + `components/trs/*`, lib `lib/trs-equipe.ts` ; API
`GET /api/trs/equipe?debut=` (`lib/trs-equipe-trm.ts`, **le même `calculerTrs` que la
tablette**). Droit **`view_trs`, fermé par défaut, accordé à la main** ; `/trs/atelier`
reste ouvert. Dossier plan : `~/.claude/plans/curried-nibbling-wave.md`.
**Dossier : `claude_doc/production-trs.md`.**

- ⚠️ Les bonnetiers viennent de `pointage`, pas du planning ; les régleurs sont affichés
  (delta assumé). Une seule réponse par équipe, ~15 requêtes bornées, cache 10 min pour
  les équipes passées.
- Barèmes = FI_TRS verbatim (`SEUILS_FI_TRS`), différents de la tablette ; le test importe
  le fichier de l'API (`ETM_API_TRS_TRM=… pnpm test` en worktree).
- ⚠️ Cellules de grille en `min-w-0 overflow-hidden`, sinon le SVG fige la colonne.
- Sonde `probe-trs-equipe-trm.ts --debut …` à rejouer sur la prod contre la capture du 28/08.

### Paramètres › Utilisateurs (`/settings/utilisateurs`) — TRM's own permission store

`SettingsUtilisateurs.tsx` : Profil (stores partagés) · **Écrans** · **Permissions**.
**Permissions are TRM's own** : `/api/permissions-trm/*`, catalogue
`lib/permission-keys-trm.ts`, store `data/permissions-trm.json` — jamais `/api/permissions`.
**Dossier : `claude_doc/parametres-utilisateurs.md`.**

- ⚠️ **Une clé nommée par un écran TRM mais absente de `TRM_PERMISSION_KEYS` échoue en
  SILENCE** (bouton invisible pour tout non-admin, inaccordable). Garde :
  `check-permission-keys-trm.ts --web <TRM/apps/web/src>`.
- ⚠️ **Le store est un argument explicite des gardes partagées** (`requirePermission(scope)`,
  `FacturesScope.permissions`, `FinanceScope.hasPermission`), jamais un défaut.
- ⚠️ `expeditions-trm.ts` (6 routes) et `planning-atelier.ts` (7) n'ont **aucune garde** ;
  `attachUser()` est best-effort, il n'y a pas de garde globale — toute nouvelle route
  d'écriture porte la sienne.
- **Écrans** : menu = grant (`screen_<menu>`, fermé par défaut), écran = hide
  (`hide_<menu>_<screen>`), clés dérivées de `mainNavigation` ; ⚠️ **hide keys via
  `hasRaw()`, jamais `has()`**. Rideau (`useScreenGuard`), pas un verrou. ⚠️ Nouveau menu
  = `seed-screen-access-trm.ts --write` sur la prod **avant** le web deploy.
- Liste = allowlist `TRM_STAFF` (dont le compte-poste `Visitage`, id 10, clé finissant par
  `|` nu — pas une coquille). Clés livrées : `edit_commandes_client`, `edit_of`, …

### Qualité › Retour client (`/qualite/retour-client`) — port de `FI_Retour_ClientTRM.wdw`

Classeur §39, `QualiteRetourClient.tsx`, API `routes/retours-client-trm.ts`, primitives
`lib/retour-client-trm.ts`, PDF `RetourClientPdf.tsx`. **L'autre bout de Qualité › Dossiers
d'ETM** : une FNC envoyée d'ETM arrive ici comme `retour_client` (`IDdossier_qualite > 0`).
Droit `edit_retour_client`. **Dossier : `claude_doc/qualite-retour-client.md`.**

- ⚠️ **La réponse remonte, le reste non** : `PUT /:id` republie sur
  `dossier_qualite.reponseFNC` via `writeFncReponse()` (un seul propriétaire de l'encodage).
  Affectation et clôture ne remontent jamais.
- ⚠️ `Type_Reference '2'` = `stock_fini.lot` ici, **lot de fil** sur `dossier_qualite`.
  `archivé` seule colonne accentuée (`rcReadCol` / `patchArchive`, filtre en JS) ; `DATE`
  réservé ; `impact_prime` et `defaut` sont mortes.
- Onglet Documents **dégradé en prod** (`doc_qualite` PK/FK accentuées) — `degraded: true`.
- `components/shared/PieceEvents.tsx` est sorti de `ProductionOf.tsx` pour cet écran.

### Fils › Stock (`/fils/stock`) — port of `FI_Stock_Fil_TRM.wdw`

Tableau §27, `FilsStock.tsx`, API `routes/stock-fil-trm.ts` (`/api/stock/fil-trm/*`).
`stock_fil` **n'est pas partitionné** : TRM liste tout, `IDclient` = propriétaire du fil.
Droit `create_stock_fil` (Nouveau lot · Diviser · Archiver — accordé au poste `Visitage`).
**Dossier : `claude_doc/fils-stock.md`.**

- ⚠️ `stock` / `dernier_mouvement` ne sont **jamais écrits par le web** ; lot = `MAX+1`
  numérique **en JS** ; `controle_titrage` en INSERT positionnel dans l'ordre runtime
  `IDcontrole_titrage, titrage, nb_fil, nb_brin, IDstock_fil, IDunite_titrage, date`.
- ⚠️ **Freinte = `stock_initial − Σ(pièces × pourcentage/100) − Σ fil_incorpore.poids`** :
  la pondération est porteuse et **le fil incorporé est de la consommation, pas de la
  freinte** (décision 2026-08-26, `check-freinte-incorpore-trm.ts`), affiché sur sa propre
  ligne. Seuils : freinte ≤ 10 % vert ; 2nd choix 0 / ≤ 5 % / rouge.
- ⚠️ **Windows ODBC** : tout SELECT nommant une colonne memo-binaire (`certif_bio`,
  `certif_recyclé`) ou `SELECT *` sur `stock_fil` / `client` rend **zéro ligne**. `controlé`
  est un drapeau mort.
- ⚠️ `pnpm dev` d'`apps/web` **force `VITE_API_URL=:8080`** via cross-env : pour une API de
  worktree, `VITE_API_URL=http://localhost:808N/api pnpm exec vite --port 5175`.

### Production › Prime (`/production/prime`) — port of `FI_Prime.wdw`

Lecture seule, `ProductionPrime.tsx`, API `routes/prime-trm.ts`. Spec = le WLanguage en
commentaires de `GWDFFEN_Prime.java`. Semestres 15/06 – 15/12 ; sommes sur
`stock_ecru.date_saisie` scopées `IDordre_fabrication > 0` (pas d'`IDsociete`).
PDF `PrimePdf.tsx` (`companyTrm`). **Dossier : `claude_doc/production-prime.md`.**

- ⚠️ **Les taux sont datés** (`lib/bareme-prime-trm.ts`, `BAREMES_PRIME`) : +0,055 / −0,40
  dès S2 2026, +0,05 / −0,20 avant ; une révision = ligne datée sur une frontière de
  semestre, jamais une édition en place. Affichage à trois décimales quand il en porte.
- ⚠️ **Les régleurs participent** (pas de filtre `regleur`, ni `archivé`) ; prorata borné à
  min(aujourd'hui, fin, sortie) — les partages historiques ne matchent plus le versé.
- Semaine = la semaine courante, rendue seulement sur le semestre courant ; déclassements
  = une ligne par rouleau 2nd choix, même population que la tuile. `taille_cm` n'est **pas**
  des centimètres. Comparaison au semestre précédent **entier** (décision 2026-08-24).
  Tuile « Retour client » morte à 0.

### Rapports › Finance (`/rapports/finance`) — ETM's screen, TRM's partition

`<RapportFinance basePath="/rapports-trm/finance" />` importé d'`@etm/pages` — `basePath`
est la seule différence. API déjà là : `createFinanceRouter(FINANCE_SCOPE_TRM)` sur
`/api/rapports-trm`. Droits `view_rapport_finance` (+ `edit_compte_description`) ; sans la
clé le menu Rapports disparaît. **Dossier : `claude_doc/rapports-finance.md`.**

- Règle : montant(compte, année) = `debit − credit` du dernier upload de l'année civile ;
  classe 7 exclue. ⚠️ `releve_compta` n'a pas d'`id_societe` : toute route `:id` sur la
  fabrique vérifie l'appartenance du compte.

### Atelier planning data model (legacy, shared HFSQL)

- `planning_bonnetier` — `IDplanning_bonnetier`, `date_debut`/`date_fin` (DATETIME, one row per bonnetier per worked day), `IDbonnetier`. No équipe column: the shift (Matin/Après-Midi/Nuit) is derived from the start hour. Overnight (Nuit) shifts end on the next day.
- `bonnetier` — accented columns `prénom`/`archivé` (HFSQL accent rules apply). Grid rows = `archivé=0 AND regleur=0`; regleurs are excluded (roles in `role_employe`: apprenti/bonnetier/visiteur/regleur).
- `desiderata` — `DATE` (reserved word → returns uppercased; 8-char YYYYMMDD), `description`, `IDbonnetier`, `justifie`, `declare`. Writes use positional INSERT (max+1 PK) to avoid naming the reserved column. "En cours" = date ≥ today.

## Ticket widget (LIVA issue tracker) — feature version 1.3.0

Widget `components/tickets/` (miroir verbatim d'ETM — améliorer là-bas et recopier, seul
delta `useTickets.ts` → `/api/tickets-trm`), proxy = fabrique `routes/tickets.ts` montée
`/api/tickets-trm`, scopée par `ISSUE_TRACKER_PRODUCT_SLUG_TRM=trm-erp` (**exigence d'env
en prod**). Spec : skill `issue_tracker_integration`. **Dossier : `claude_doc/tickets.md`.**

- Jamais pointer le widget sur `/api/tickets` : le slug par montage sépare les « Mes tickets ».
- **Un compte sans email envoie quand même** (v1.3.0) : adresse synthétique
  `utilisateur-<id>@mps.malterre.invalid`, suivi email forcé à faux ; le poste de visitage
  accole le nom de la visiteuse (`reporterHint.ts`). ⚠️ Associer un email plus tard change
  l'identité tracker ; ne jamais mettre l'adresse d'une vraie personne sur le compte-poste.
- Suivi par email (v1.2.0) : `PATCH /:id/follow`, drapeau côté tracker ; ⚠️ le tracker doit
  porter la migration `follow_up` avant le web TRM.

## Shared screens (live cross-repo link with ETM)

Some screens are pixel-identical in both apps and hit the same non-partitioned data (e.g. Tombé Métier → Références over `/references-ecru`). Those are **not copied** — TRM imports the ETM source file directly, so editing the one file updates both apps:

- **Import**: `import { TombeMetierReferences } from '@etm/pages/TombeMetierReferences'` in `router.tsx`. The `@etm` alias points at `../../../ETM/apps/web/src` (vite.config.ts + tsconfig paths) — the two repos **must stay sibling directories** under `C:\dev\etsmalterre\` (worktrees like `TRM-ref-tm` are siblings too, so they work).
- **`@/` imports inside a shared screen resolve to THIS app's src** — the screen uses TRM's local copies of components/lib/hooks. Keep those copies in sync with ETM (they currently differ only in line endings, plus the `API_URL` dev fallback in `lib/api.ts`). Verbatim mirrors of ETM files, copied when a screen needed them — improve them **in ETM** and re-copy, never fork: `components/email/SendEmailDialog.tsx`, `components/ui/signature-preview.tsx`, `lib/email.ts`, plus the `components/ui/*`, `lib/*` and `hooks/*` that predate them.
- **The source of truth lives in ETM** — improve the screen there (or from here via the alias path, it's the same file). Never fork a TRM copy of a shared screen.
- **A per-app difference is a PROP, never a fork.** Three precedents, in increasing strength: `RapportFinance basePath` (a string), `TombeMetierReferences obsOfEditor` (a whole **component** TRM injects, so the shared file never learns a TRM endpoint — see « Observations régleur »), and on the backend `createFinanceRouter(scope)`. Default the prop to the ETM behaviour and the other app is untouched.
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

### Widgets TRM — finance · « Poids des pièces » · « Pièces à visiter »

**Dossier complet : `claude_doc/dashboard-widgets.md`.**

- **Widgets financiers** (Charges · CA · Analyse · Évolution du CA) : miroirs verbatim des
  composants ETM sur `createFinanceRouter(FINANCE_SCOPE_TRM)` → `/api/rapports-trm`, clés
  `dashboard_charges` / `dashboard_ca` / `dashboard_finance` / `dashboard_evolution_ca`,
  React Query keys préfixées `trm-`. ⚠️ `/finance` est un any-of gate (`dashboard_charges`
  **et** `view_rapport_finance` dans `financeKeys`). Le donut CA garde chaque client (98 %
  du CA à Ets Malterre). La carte Charges compare au prorata de l'année écoulée depuis le
  2026-08-26. Pas de BFR possible (aucun compte < 600000). Sonde `probe-finance-trm.ts`.
- **« Poids des pièces »** (`FI_Mauvais_Compteur`) : unité = le rouleau `stock_ecru` ;
  valide ⇔ `poids_piece ≤ poids ≤ poids_piece + 0,7` ou `poids ≤ 0,65 × poids_piece`, sur
  les doubles bruts ; OF `est_actif = 1` avec ≥ 1 rouleau ; rouge `< 0,6`, orange `< 0,8`.
  Le SQL vient du **cache de compilation WinDev** (`MPS.cpl/<user>/00000000/*.wcw`) — la
  piste pour tout futur port TRM.
- **« Pièces à visiter »** (`FI_PiecesAVisiter`) : pièces finies sans rouleau dans les 24 h ;
  **rouge ≥ 3 h, orange ≥ 2 h**, calculé dans le navigateur à la minute (testé) ; lecture
  seule. ⚠️ L'équipe se dérive de l'heure **parsée**, jamais du `SUBSTR` legacy. Lecteur
  partagé avec le poste : `awaitingPieces()` dans `lib/production-trm.ts` — améliorer, ne
  pas forker. Dérogation dev `PIECES_A_VISITER_WINDOW_HOURS`.

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
- ⚠️ **Le double rendu `hidden md:flex` / `md:hidden` des écrans §27 se paie sur les
  LONGUES listes.** Le patron table-centric rend chaque ligne **deux fois** — une table
  desktop et une carte mobile — et en cache une en CSS : gratuit sur 30 lignes, cher sur
  une vraie liste. Tombé Métier › Stock porte ~1 000 pièces, donc le navigateur
  construisait, stylait et disposait ~2 000 sous-arbres de ligne (~40 000 éléments) pour
  en montrer 1 000. Les deux branches se gardent donc aussi sur **`useIsDesktop()`**
  (`hooks/useIsDesktop.ts`, `matchMedia` au breakpoint `md`, valeur initiale lue
  **synchroniquement** — un défaut posé en `useEffect` monterait la mauvaise branche une
  fois et paierait le coût quand même). Les classes Tailwind restent : elles portent la
  mise en page, le hook porte le montage. **C'est un patron, pas un correctif local** —
  tout écran §27 dont la liste peut atteindre les centaines de lignes le veut, dans les
  deux applications (les écrans §27 d'ETM ont exactement le même piège, non traité à ce
  jour). Ne pas le poser à l'aveugle sur les listes courtes : le hook coûte un rendu de
  plus au franchissement du breakpoint.
- **`<Badge className="badge-warning">` renders navy, not amber.** The `.badge-*` helpers live in `@layer components` while the Badge's own `bg-primary` is a plain utility, and utilities beat components — the helper silently loses. For a coloured badge, pass `variant="outline"` plus explicit utilities (`bg-amber-500/15 text-amber-800 border-amber-500/30`). Applies to ETM's copy of `badge.tsx` too.

## Versioning

Mirrors ETM exactly (`ETM/CLAUDE.md` §Versioning) — same mechanism, **separate version
numbers**: the two apps ship independently, so TRM started its own count at **0.0.1** on
2026-08-26 (ETM was at 0.2.4). Do not try to keep them in step.

- **Single source of truth**: `version` in the **root** `package.json`. The web build
  injects it as `__APP_VERSION__` (`define` in `apps/web/vite.config.ts`, declared in
  `apps/web/src/vite-env.d.ts`) and the header profile menu displays it under the
  « Actualiser l'application » button.
  - ⚠️ **`vite-env.d.ts` était `.gitignore`-é et jamais commité** jusqu'au 2026-08-27 :
    la règle `apps/web/src/**/*.d.ts` (qui existe pour empêcher un `tsc -b` d'éclipser les
    sources) l'avalait. Le fichier n'existait donc que dans le checkout principal, où il
    avait été créé à la main — et **tout worktree neuf échouait au build** sur
    `TS2304: Cannot find name '__APP_VERSION__'`, alors que `/trm_deploy` depuis le
    principal passait. Corrigé en reprenant la négation qu'ETM avait déjà
    (`!apps/web/src/vite-env.d.ts`) et en commitant le fichier. Ne pas ré-ignorer.
- Unlike ETM there is **no `vitest.config.ts`** here — vitest reads `vite.config.ts`, so
  the one `define` covers the test run too. If a vitest config is ever added, the define
  must be duplicated into it or every test touching the Header fails on an undefined global.
- The per-package `apps/*/package.json` versions are displayed **nowhere** — leave them
  alone, don't keep them in sync.
- To release: bump the root version, commit `chore(release): X.Y.Z`, then `/trm_deploy`.
  The skill takes an optional version argument (`/trm_deploy v0.0.2`) that does this for you.
- **« Actualiser l'application »** (`lib/sw-refresh.ts`, a verbatim mirror of ETM's — improve
  it in ETM and re-copy) waits for the new service worker to *take over* before reloading.
  A plain `registration.update()` + reload races the install and re-serves the old build —
  that was ETM's « click twice to get the new version » bug. This matters more here than in
  ETM: the bonnetiers' shop-floor devices run the installed PWA and rarely get closed.

## Conventions

- **Code**: English. **UI**: French. **Comments**: English.
- **"check last screenshot"** → read the latest file in `%USERPROFILE%\Pictures\Screenshots`.
- Git remote: `github.com/etsmalterre/TRM` (etsmalterre account).

## Quick Start

```bash
pnpm install
pnpm dev          # web on http://localhost:5175

# The MPS API must be running (dev port 8080):
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
