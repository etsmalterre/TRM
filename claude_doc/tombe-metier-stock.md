# Tombé Métier › Stock

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Tombé Métier › Stock data model — why it is NOT a shared screen

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
never edited from here. **Une exception : le tiroir réimprime l'étiquette Dymo du
rouleau** (bouton imprimante de l'en-tête), sur le même
`GET /visitage-trm/etiquettes?ids=<IDstock_ecru>` que le poste appelle à la validation —
une étiquette se déchire ou se mouille des mois après la visiteuse, et le seul chemin de
retour était de revalider une pièce. Ça n'écrit rien, donc ça reste dans un écran en
lecture seule et sans droit (mêmes raisons qu'au poste). Le bouton est **désactivé quand
`IDordre_fabrication` est nul** : c'est le garde-fou de partition de l'endpoint, donc ces
rouleaux-là 404 au lieu d'imprimer.
⚠️ **`GET /visitage-trm/etiquettes` a donc DEUX appelants maintenant**, plus le
`?demo=N` sans appelant — le toucher demande de vérifier le poste *et* ce tiroir.

