# Production › Planning (`/production/planning`) — LIVA #1250

Port of the legacy `FI_Planning_Commande` (Mickael Grivelet, 01/10/2026: « remettre le
planning de production pour pouvoir dater les fins de commande »). Métiers on the left,
every TRM commande line still to knit on a timeline; the end of a line's last bar is its
**« fin prévue »**, also shown on the line card of Clients › Commandes.

| Piece | Where |
|---|---|
| Engine (pure, tested) | `ETM/apps/api/src/lib/planning-prod-trm.ts` (+ `.test.ts`) |
| Loader + stores | `ETM/apps/api/src/lib/planning-prod-trm-charge.ts` (native PG, `mps-pg.ts`) |
| Routes | `ETM/apps/api/src/routes/planning-prod-trm.ts` → `/api/planning-prod-trm` |
| Tables | migration `0006_planning_prod_trm` (`mps-schema.ts`): `planning_prod_reglage`, `planning_prod_ligne` |
| Probe (read-only) | `ETM/apps/api/src/scripts/probe-planning-prod-trm.ts` |
| Screen | `apps/web/src/pages/ProductionPlanning.tsx`, `components/planning/RegimeDialog.tsx`, `lib/planning-prod.ts` (+ test) |
| Commandes | `FinPrevueStat` in `ClientsCommandes.tsx` (`GET /planning-prod-trm/fins`) |

## Decisions (Vincent, 2026-10-01)

- **Commande-based.** Bars are commande lines: the OF part sits where its OF is, the part
  no OF covers yet (« à lancer », gold dashed) is placed by the planning.
- **Dates are computed on every read, never stored.** A drag saves the métier and the place
  in that métier's line (`planning_prod_ligne`), nothing else (choice « a »: no pinned start
  date). The legacy saved `planning_depart` / `planning_fin` on the line and they went stale;
  its columns `ligne_commande_client.IDmachine_planning / planning_*` are left untouched.
- **Calendar = the bonnetier planning, then a régime.** Up to the last day `planning_bonnetier`
  has bookings (capped at 21 days) the worked time is the union of the booked shifts of
  non-régleur bonnetiers — a day with no booking in that span is a day off. Beyond, the
  atelier-wide régime: **3×8 by default** (Monday 5 h → Saturday 5 h, no weekend work), 2×8
  (5–21), **2×7 = 2×8 without the night, one hour off each edge (6–20)**, or one window per
  weekday. Drawn hatched (« potentiel ») so nobody reads a projection as a promise.

## The formula

`minutes = (trs_10kg_chute / nb_chutes) × kg / 10 ÷ vitesse ÷ rendement`, laid on the worked
time. Same tours formula as the legacy and as the OF screen's per-piece estimate; vitesse =
OF → machine → `ref_ecru.vitesse_cible`.

⚠️ **The rendement is MEASURED per métier, not the legacy's 17 tr/min × 0,6.** Median of
théorique ÷ temps de présence over the métier's 10 latest finished OFs (≥ 3, else the parc
median), présence measured on the historical `planning_bonnetier`. On 304 OFs (2025-09 →
2026-09) the legacy constants were ~40 % optimistic. It is a **calibration factor**: it goes
above 100 % when a métier knits outside staffed hours or its stored vitesse is too low (2B:
`machine.vitesse = 6` measures 150 %+). Bounds 0,15 – 3. Cached 1 h in the API.

- Compatible métier = a `ref_ecru_machine` row with `trs_10kg_chute > 0 AND nb_chutes > 0` on
  a non-archived machine (legacy rule). A line whose ref has none is « non planifiable »
  (amber chip); an OF whose métier lacks the row gets a 10-day stand-in, shown « ≈ ».
- Order on a métier: running OF (remaining kg = quantité − Σ finished pieces), waiting OFs by
  `priorite`, hand-placed lines by rang, then automatic lines by délai, each on the
  compatible métier where it **ends first**.
- Part of a line to plan = quantité − Σ OF (open OF: its quantité; finished OF: what it
  knitted), ignored under max(5 kg, 2 %).

## Writes

- `PUT /lignes/:id { idmachine, ordre }` — `edit_planning_prod`. The order is every
  hand-placed line of the target métier: a drop pins the lines it reorders.
  `DELETE /lignes/:id` = back to automatic.
- `PUT /of/:id { idmachine, ordre }` — **`edit_of`** (it is the régleur's queue): waiting OFs
  only, compatible métier only, priorites rewritten 1..n (running OF first), old métier
  re-ranked with `rerankQueue()`.
- `PUT /reglage` — `edit_planning_prod`.
- New key **`edit_planning_prod`**, catégorie Production, closed by default — grant by hand
  (Mickael). Reading the screen needs only the Production menu.

## Deploy

1. `/etm_deploy` with **`npx tsx src/scripts/mps-migrate.ts --write` on the server
   (owner role) BEFORE the new API starts** — the loader tolerates the missing tables
   (defaults, no pins) but the writes 500 without them.
2. `/trm_deploy`.
3. Grant `edit_planning_prod`. Then `probe-planning-prod-trm.ts` on the prod to eyeball the
   rendements.

## Not done / open

- Dev has only ~6 open lines, all with an OF: the « à lancer » path was tested on temporary
  dev data (removed). Prod reality to check after deploy.
- The rendement ignores machine stops recorded by the TRS recorder; a métier down for
  maintenance is not known to the planning.
