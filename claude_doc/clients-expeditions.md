# Clients › Expéditions

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Clients › Expéditions data model — why it is NOT a shared screen

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

