# Tableau de bord — les widgets TRM (finance, Poids des pièces, Pièces à visiter)

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Widgets financiers — Charges · Chiffre d'affaires · Analyse financière · Évolution du CA

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
- ⚠️ **Pas de BFR possible ici non plus, et le constat vaut pour les deux partitions** :
  `compte_compta` ne contient **aucun compte sous 600000**, ni pour la société 1 ni pour la
  société 2 — ce que dépose l'expert-comptable est un compte de résultat, pas un bilan.
  Détail, preuves et sorties possibles dans `ETM/CLAUDE.md` § « BFR / bilan — hors de portée ».
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
- ⚠️ **The Charges card compares a partial year against a *full* N-1, and that is the
  POINT since 2026-08-26** — it no longer shows the raw ratio as its verdict. Amount for a
  year = the last upload *falling in that calendar year* (the legacy rule, which ETM's
  report reads the same way), so a « 23 % » in March is a partial-vs-full figure and means
  nothing on its own. The card therefore subtracts the **share of the year elapsed at the
  arrêté date** and shows the écart in points: a gauge whose fill is the consumed share of
  the N-1 envelope and whose navy tick is the repère. Charges *fixes* carry an alert ladder
  (±3 pts « au rythme », +10 amber, beyond red), charges *variables* carry none — more
  variable charge means TRM knitted more. Full rationale in ETM's `CLAUDE.md` § Charges
  widget and in the file header; the two apps must keep the same reading.
- **Trois autres réglages du 2026-08-26, communs aux deux applications** (faits dans ETM et
  re-copiés) : « Chiffre d'affaires » ouvre sur **Même période** au lieu d'Année complète ;
  « Évolution du CA » donne à l'**année en cours** le style 0 (bleu accent, plein, trait
  épais, dessiné au-dessus) au lieu de ce que la liste croissante laissait — et remplace sa
  **légende** par une infobulle au survol, classée par CA, les pastilles d'année restant la
  clé des couleurs ; « Analyse financière » ne porte plus la mention « Variation de stock
  estimée à … et intégrée » sous ses tuiles (le calcul, lui, est intact — et de toute façon
  côté TRM il n'a jamais existé : l'estimation est ETM-seulement, `scope.societe === 1`).

## Widget « Poids des pièces » — port of `FI_Mauvais_Compteur.wdw` + `FEN_Graphe_Compteur.wdw`

The legacy windows are PCS-compressed, but their SQL survives in **WinDev's compile cache** (`C:\Mes Projets\MPS\MPS.cpl\<user>\00000000\<Window>.<hash>.wdw.wcw` — string literals, identifiers and real literals are readable; integer literals and function names are not). That is the place to look for any future TRM port; the recovered query is quoted in full in `routes/dashboard-trm.ts`.

- **Unit = the roll** (`stock_ecru` row, the visiteuse's weighing), never `piece_production` — its `poids` is the nominal 20/10 kg, not a measurement. Target = `ordre_fabrication.poids_piece`.
- **Valid** ⇔ `poids_piece ≤ poids ≤ poids_piece + 0,7` **or `poids ≤ 0,65 × poids_piece`** — a remnant (end of lot, piece cut after a defect) is deliberately not held against the métier. Evaluated on the raw doubles, on purpose: `poids` is a 4-byte real, so a roll keyed as 20,7 reads 20.7000008 and is *invalid* in the legacy too. Verified 6/6 against the live widget.
- **Rows**: OFs with `est_actif = 1` **and at least one weighed roll**, sorted by pct ascending; Métier = `machine.emplacement`; Nb pièces = `COUNT(stock_ecru)`. Colours: red `< 0,6`, orange `< 0,8`, green (the two literals recovered next to the query; the boundary operators are an assumption). No `IDsociete` filter anywhere — the ETM handover flips delivered rolls to société 1 and the legacy counts them.
- **Chart** (click a row; legacy: double-click): every roll of the OF by `date_saisie`, dashed target line, band `[poids_piece, poids_piece + 0,7]`, red outside. Deliberate deltas: axis target ± 2 stretched to at most ± 4 with out-of-range points pinned as triangles (a 3 kg remnant must not squash the band), a grey remnant zone, X = weighing sequence, hover tooltip. The legacy's `18–22` axis is an inference (integer literals don't survive the cache).

## Widget « Pièces à visiter » — port of `FI_PiecesAVisiter.wdw`

Le tombé métier qui est sorti d'un métier et que personne n'a encore pesé : la liste de
travail de la visiteuse, et la preuve pour le régleur que ça s'accumule quelque part.
Écran `apps/web/src/components/dashboard/PiecesAVisiterWidget.tsx` ; API
`GET /api/dashboard-trm/pieces-a-visiter` ; droit `dashboard_pieces_a_visiter`.

Le `.wdw` est PCS-compressé : la requête vient du **cache de compilation WinDev**
(`MPS.cpl/<user>/00000000/FI_PiecesAVisiter.*.wdw.wcw`) et **le WLanguage de la boucle de
coloriage a été fourni par l'utilisateur** — les littéraux entiers ne survivent pas au
cache, donc les seuils n'étaient pas récupérables autrement. Les deux sont cités verbatim
dans l'en-tête de `routes/dashboard-trm.ts`.

- **Population** = pièce `piece_production` terminée, sans `stock_ecru`, `date_fin` dans les
  **24 h**, la plus ancienne en tête. Pas de filtre `IDsociete` (les tables OF n'en ont pas).
- **Couleur = le temps d'attente**, et c'est le seul signal du widget : **rouge ≥ 3 h,
  orange ≥ 2 h, vert en deçà** (`dhDateRouge.Heure -= 3` / `dhDateOrange.Heure -= 2`).
  Calculée **dans le navigateur** contre une horloge qui bat à la minute, comme le legacy la
  calcule contre `DateHeureSys()` — mais sans figer au moment du fetch : une ligne passe à
  l'orange puis au rouge sous les yeux. Épinglé à la minute par
  `PiecesAVisiterWidget.test.ts` : un `<` pris pour un `<=` décale toute la grille d'une heure
  sans que rien ne se voie.
- **Colonne « Attente » en plus du legacy** : le legacy peint la ligne et laisse lire deux
  heures d'horloge pour comprendre pourquoi. La couleur doit être lisible comme un nombre.
- **Lecture seule**, comme le legacy (décision utilisateur du 2026-08-27) : pas de clic vers
  Production › Visitage. Le widget constate, le poste saisit.
- ⚠️ **L'équipe se dérive de l'heure PARSÉE, jamais du `SUBSTR(date_fin,9,2)` du legacy.**
  Bornes legacy conservées (5–13 Matin, 13–21 Après-Midi, sinon Nuit), mais le SUBSTR ne lit
  l'heure que sur le `AAAAMMJJHHMMSS` compact de WinDev ; sur un pilote qui rend
  `YYYY-MM-DD HH:MM:SS` ces deux caractères sont le **jour du mois**, et le même CASE
  étiquetterait toutes les pièces par quantième. Mesuré 0/8 sur le pilote ODBC Windows
  (`probe-pieces-a-visiter-trm.ts` §5).
- **Le lecteur est partagé avec le poste de Visitage** : `awaitingPieces()` dans
  `ETM/apps/api/src/lib/production-trm.ts`, extrait de `visitage-trm.ts` pour ce widget.
  Il encode de la discipline de pilote (anti-jointure résolue en JS — `date_fin <> ''` vs
  `IS NULL` ne se comportent pas pareil des deux côtés — et balayage par machine plutôt que
  la boucle par OF du legacy, qui perd les pièces des OF terminés). **Améliorer ce fichier,
  ne jamais en forker une copie.** Chaque appelant pose sa propre fenêtre : 7 jours pour le
  poste, 24 h pour le widget.
- **Sonde de parité** : `ETM/apps/api/src/scripts/probe-pieces-a-visiter-trm.ts` (lecture
  seule, rejouable en prod après un `/etm_deploy`). Elle fait tourner le SQL legacy et le
  helper côte à côte — **56 vs 56 dans la profondeur de scan** au 2026-08-27 — vérifie que
  l'anti-jointure n'a pas de trou (aucun `stock_ecru` sans `date_saisie`) et enregistre la
  forme de DATETIME que parle le pilote. `PROBE_WINDOW_DAYS` élargit la fenêtre : la base de
  dev est un instantané de mars, donc 0 ligne à 24 h.
- Dérogation dev `PIECES_A_VISITER_WINDOW_HOURS` (`apps/api/.env.development` **seulement**,
  la prod garde 24 h) — même raison et même patron que `VISITAGE_PIECE_MAX_AGE_DAYS`.

