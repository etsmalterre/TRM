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
which is most shipments — the piece changes **owner at « Expédier »**, not at some
later reception step: the legacy stamps `lot = 'trm<IDexpedition>'` on every
shipped roll (whatever the client) and flips `stock_ecru.IDsociete` from 2 to 1
when the client is Ets Malterre. Probed on 2026-09-02 against avis 11686, created
with the WinDev app on the dev base: rolls at société 1 the same minute (the
earlier wording here, « ETM's reception takes ownership », was wrong — and the
PWA did neither, so a roll shipped from Clients › Expéditions stayed TRM's in
ETM's stock screens). Both write paths now go through `stampShippedPieces()` in
`expeditions-trm.ts`; the reverse, `releaseShippedPieces()`, brings a roll back
to TRM on « retirer » or on deleting an avis **only while ETM has done nothing
with it** (not affected to an ETM order, not at a dyer, not shipped on, no
`stock_fini` child) — otherwise 409, all-or-nothing. Reads therefore **never
filter on IDsociete** (filtering would make every delivered avis read
"0 pièces"); the stamp **requires `IDsociete = 2`**. Shipments to a third-party
client (e.g. Bonneterie Gautier) keep their pieces at `IDsociete = 2`, lot
stamped all the same.

**« Expédier » from Clients › Commandes** (LIVA #1109, 2026-09-02) — the way the
atelier actually ships: in the Progression drawer › Affectation tab, tick the
unshipped rolls (§44: checkbox, MAJ+clic range, « Non expédiées » selects them
all, « Aucun » clears), read « N pièces · X Kgs », click **Expédier**, confirm
the legacy prompt verbatim (« Confirmez-vous l'expédition de cette commande ? »),
and the drawer jumps to its Expédition tab where the new avis sits with its
rolls at `trm<n°>`. API `POST /commandes-trm/:id/lignes/:ligneId/expedier`
(`{ stockIds }`): ONE avis for the commande with ONE `ligne_expedition` for
this line, header defaulted like the Expéditions screen's create (livraison
address from the commande, carrier from the client, `est_valide` 0 — the legacy
writes 1 there, the PWA retired the flag), rolls stamped through
`stampShippedPieces()`. Mirrors ARE shippable (shipping is TRM's act, the one
thing a mirrored order exists for); a soldée order 409s; rolls not reserved to
the line or already shipped are ignored and counted back as `ignored`.
Serialised on `expedierLock` (every id is MAX+1). No « Tous » button: shipped
rows are not selectable. Guard: `check-expedier-trm.ts`
(`API_BASE=http://localhost:808N/api`) — creates then deletes an avis on the
dev base, **never against prod**.
- **Droit `edit_expeditions`** (catalogue TRM, catégorie Commandes client) : garde
  « Expédier » ET les six routes d'écriture d'`expeditions-trm.ts` — qui n'en
  avaient **aucune** jusque-là — et cache Nouveau / Modifier / Supprimer et le
  lien-retrait de pièces dans Clients › Expéditions. Consultation, impression et
  envoi de l'avis restent ouverts. ⚠️ **Fermé par défaut : `seed-edit-expeditions-trm.ts
  --write` sur le serveur AVANT le déploiement web TRM**, sinon seul l'admin
  expédie ; les postes partagés (Visitage, Regleur, eloise) sont laissés en
  lecture seule, comme pour `edit_of`.

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

