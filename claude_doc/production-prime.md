# Production › Prime

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Production › Prime (`/production/prime`) — port of `FI_Prime.wdw`

Read-only dashboard (`apps/web/src/pages/ProductionPrime.tsx`; API
`ETM/apps/api/src/routes/prime-trm.ts`, mounted `/api/prime-trm`). The legacy `.wdw` is
PCS-compressed, but the full WLanguage survives as comments in the generated Android Java
(`C:\Mes Projets\MPS\Android\dbg\Compile\GWDFFEN_Prime.java`) — that is the recovered spec.

- **Period** = semester bounded by **15/06 and 15/12** (S1 = 15/12/(Y−1)→15/06/Y, labelled
  by the *fin* year; S2 = 15/06→15/12, labelled by the *début* year). Précédent/Suivant
  move a reference date ±6 months; Suivant is blocked on the current period.
- **Sums** = `SUM(stock_ecru.poids)` over `date_saisie` (a DATETIME) × the rate **du barème
  applicable au semestre** (voir le ⚠️ plus bas) : jusqu'à S1 2026, 1er choix
  (`second_choix = 0`) +0,05 €/Kg et 2nd choix (`second_choix = 1`) −0,20 €/Kg ; à partir de
  S2 2026, **+0,055 / −0,40 €/Kg**. **No
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
  costs money — with its métier, its poids, its manque à gagner (`poids × le taux 2nd choix
  du barème en vigueur`, the same
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
- ⚠️ **Les taux sont datés — `ETM/apps/api/src/lib/bareme-prime-trm.ts`, `BAREMES_PRIME`.**
  C'étaient trois constantes de module appliquées à *toute* période navigable : les réviser
  recalculait l'historique entier et l'écran affichait des primes jamais versées. Une
  révision s'ajoute donc en **ligne datée**, et **on ne touche jamais une ligne passée**.
  La révision du 2026-08-26 (+0,055 / −0,40 €/Kg, décidée avec l'atelier) s'applique **dès
  le semestre en cours, S2 2026** (`from: '2026-06-15'`) ; S1 2026 et avant gardent
  +0,05 / −0,20. `retour client` reste à −0,60 : la tuile est morte de toute façon.
  - Le `from` **doit être une frontière de semestre** (15/06 ou 15/12). La prime est *une*
    somme sur toute la période × *un* taux, donc un barème qui démarrerait en cours de
    semestre ne serait pas calculable sans découper chaque somme de kg à la date de bascule
    (`sumPoids`, les montants de déclassement, le donut). Si l'atelier veut ça un jour,
    **c'est ce découpage le travail**, pas une ligne de plus dans la table.
  - Le semestre affiché est prixé au barème de *son* `debut` ; **la semaine** l'est au barème
    en vigueur *aujourd'hui*, puisqu'elle décrit toujours la semaine courante quelle que
    soit la période consultée. Les deux coïncident dès que le semestre courant est affiché,
    seul cas où l'écran rend la semaine.
  - ⚠️ **Le taux s'affiche à trois décimales quand il en porte trois.** `fmtTaux` (écran
    *et* `PrimePdf`) était figé à deux : +0,055 sortait « +0,06 €/Kg », un taux que
    personne ne touche, à côté d'un total calculé sur le vrai 0,055 — sur le document qui
    paie la prime. La troisième décimale n'apparaît que si elle porte quelque chose
    (-0,40 et -0,60 se lisent toujours à deux). Le calcul, lui, n'a jamais arrondi.
  - Garde : `bareme-prime-trm.test.ts` épingle la bascule au jour près et vérifie que la
    table reste triée et sur des frontières de semestre — `baremePour` sort de sa boucle au
    premier `from` futur, donc une table désordonnée résoudrait faux en silence.
  - Le barème vit dans `lib/` (et pas dans `routes/prime-trm.ts`) pour être testable sans
    charger le driver HFSQL, à côté de `lib/pricing-trm.ts` où vivent déjà les règles de prix TRM.

