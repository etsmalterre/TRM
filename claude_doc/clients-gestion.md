# Clients › Gestion

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Clients › Gestion (`/clients/gestion`) — port of `FI_Gestion_Client_TRM.wdw`

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


## Exonération de TVA — mention légale et attestations (LIVA #1248, 2026-09-30)

Laetitia : SOFILETA trouvait sa facture « pas finie » — à 0 % le PDF s'arrêtait sur TOTAL HT, sans
motif. Désormais tous les PDF client (facture/avoir, proforma, confirmation, devis — ETM et TRM,
même gabarit) gardent « TVA (0 %) » et « TOTAL TTC » et impriment **le motif légal sous les
totaux** (`ETM/apps/api/src/lib/tva-mention.ts`, pur, testé) :

- pays de l'adresse de facturation **dans l'UE** → « Exonération de TVA, article 262 ter I du CGI » ;
- **hors UE** (Maroc, Suisse, Royaume-Uni, DOM…) → « … article 262 I du CGI » ;
- **France** (ou pays vide) → la **mention légale choisie sur la fiche** : carte « Exonération de
  TVA » de l'onglet Info, visible dès que la TVA du client est à 0 %. Préréglages « Achats en
  franchise (attestation d'exportateur) » → art. 275 (le cas SOFILETA, décision de Vincent),
  « Autoliquidation (déchets) » → art. 283-2 sexies (les recycleurs : SUEZ, HAUREC, GURDEBEKE,
  qui portaient déjà une ligne d'autoliquidation tapée à la main dans leurs factures), ou texte libre.
  ⚠️ **Obligatoire pour enregistrer** un client français à 0 % (écran + API, 400
  `mention_exoneration_requise`).
- La carte garde aussi **les attestations du client** (PDF / JPEG / PNG, envoi immédiat comme un
  contact, sous `edit_client_info`) : `/clients-trm/:id/attestations-tva`.

Stockage : `data/tva-exoneration.json` + fichiers `data/tva-attestations/` sur le serveur de l'API
(`lib/tva-exoneration-store.ts`) — état serveur, jamais touché par un déploiement. Le pays est lu
sur l'adresse **du document** (instantané) ; la mention d'un client français est lue au rendu (comme
le SIREN). Le préréglage est stocké par code : reformuler un préréglage change tous les documents
futurs. Garde : `check-tva-exoneration.ts`.

**Alerte à la facture** : le détail d'une facture (`/factures[-trm]/:kind/:id`) renvoie
`mention_tva` et `mention_tva_manquante` ; les deux écrans Facturation (ETM et TRM) affichent la
mention sous le TTC et un bandeau ambre quand elle manque (0 % + client français sans mention).

**Données de prod (2026-09-30)** : mentions de SOFILETA (art. 275) et de SUEZ RV PICARDIE, HAUREC,
GURDEBEKE (autoliquidation) posées par `ETM/apps/api/src/scripts/seed-mentions-tva-1248.ts --write`
**après** l'`/etm_deploy` qui livre #1248, **puis redémarrer l'API** (le store met le JSON en cache).
AIN Fibres laissé vide (motif inconnu, sa dernière facture est un essai à 0,00 €). Corrigés en base
le même jour : N° TVA de GURDEBEKE (portait celui d'ETS Malterre → FR01927220442, vérifié VIES) et
pays de l'adresse de facturation #503 de MON COEUR (« -1 » → « États-Unis »).
