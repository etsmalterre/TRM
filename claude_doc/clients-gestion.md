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

