# Fils › Stock

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Fils › Stock (`/fils/stock`) — port of `FI_Stock_Fil_TRM.wdw`

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

- **Droit `create_stock_fil`** (catégorie « Fils ») : garde les **trois écritures du grand
  livre** — « Nouveau lot », « Diviser », « Archiver » — et rien d'autre. Le contrôle de
  titrage n'en fait pas partie (il n'écrit que dans `controle_titrage`), la consultation
  reste ouverte à qui a le menu Fils. ⚠️ La clé était nommée par l'écran et par les trois
  routes depuis l'origine, mais **n'était déclarée que dans le catalogue d'ETM** : le bouton
  était donc invisible pour tout non-admin et inaccordable — voir l'avertissement de
  « Paramètres › Utilisateurs ». À accorder au **poste de visitage** (compte-poste
  `Visitage`, IDutilisateur 10) : c'est là que le fil est reçu.
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
  `stock_initial − Σ(OF pieces poids × pourcentage/100) − Σ fil_incorpore.poids` — the
  **pourcentage weighting is load-bearing** on blended yarns (verified vs legacy
  annotations). Defects verdict =
  `defaut_qualite` `Type_Reference = 2` over the OFs' `stock_ecru` ids (« Aucun Défaut »
  smiley when empty). Writes corrected `stock_initial`, `observation_freinte`,
  `stock = 0`, `terminé = 1`. Thresholds (user-confirmed): freinte green ≤ 10 %, red
  above or negative; second choix green 0 / amber ≤ 5 % / red. PDFs: Dymo 89×36
  étiquette (`StockFilLabelPdf`) + A4 rapport de freinte (`RapportFreintePdf`,
  **`issuer: companyTrm`**).
- ⚠️ **Le fil incorporé est de la consommation, pas de la freinte** (décision utilisateur
  du 2026-08-26, après vérification auprès du régleur). « Incorporer un fil » verse un
  reliquat de lot dans un OF pour s'en débarrasser ; le poids est déclaré en Kg sur l'OF
  (`fil_incorpore`), **jamais en pourcentage**, donc `Σ(pièces × pourcentage/100)` ne peut
  pas le voir. Tant qu'il n'était pas déduit, la freinte était gonflée du poids exact :
  sur ~10 des 32 lots concernés, la freinte calculée **était** le poids incorporé au kilo
  près (lot 9479 : 50,5 pour 50 ; lot 10065 : 20,6 pour 20). Correction vérifiée par
  `ETM/apps/api/src/scripts/check-freinte-incorpore-trm.ts` : |freinte| médiane 4,58 % →
  1,46 %, 27 lots rapprochés de zéro, 5 éloignés.
  - **Affiché comme sa propre ligne, jamais fondu dans `produit`** : le poids est
    *déclaré* par le régleur, pas pesé à la visiteuse — les consignes disent souvent
    « incorporer le lot X **si possible** » — et une poignée de lots ne réconcilient pas
    (le lot 10106 déclare 8 Kg incorporés sur un lot de 8 Kg dont 6,6 Kg déjà tricotés).
    L'archiviste doit voir le chiffre pour le juger, et il peut toujours corriger
    Quantité initiale, qui est là pour ça. La carte « Fil incorporé » et le tableau du
    PDF ne s'affichent que s'il y en a (33 lots sur ~1 700).
  - `fil_incorpore` n'a que **quatre colonnes** (`IDfil_incorpore`, `IDordre_fabrication`,
    `IDstock_fil`, `poids`) : ni date, ni lien vers une pièce, ni pourcentage. **Le
    *moment* de la consommation n'est donc enregistré nulle part** — il vit dans la
    consigne au bonnetier, et les trois cas coexistent : réparti (« incorporer l'ancien
    lot 1 sur 2 », « en bordure »), en fin d'OF (« solder le lot 10373 à la fin de la
    prod »), au début (« solder le guipé 9847 avant de prendre le 10187 »). Décision du
    2026-08-26 : **on laisse ça en consigne**, pas de colonne en plus.
  - Dossier complet (34 incorporations, 32 lots, qui incorpore quoi et quand) :
    `ETM/apps/api/src/scripts/probe-fil-incorpore-trm{,2,3,4}.ts`, en lecture seule.
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
