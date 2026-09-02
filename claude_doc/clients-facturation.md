# Clients › Facturation

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Clients › Facturation — partitioned, but the SAME object as ETM's

`facture` / `facture_prov` are partitioned by `IDsociete` like `stock_ecru`, but unlike it
the two halves are the **same object** (same columns, same lifecycle, same screen). So the
API is **one router factory mounted twice** — `createFacturesRouter(scope)` in
`ETM/apps/api/src/routes/factures.ts` → `/api/factures` (ETM) + **`/api/factures-trm`**
(TRM) — not a second route file. Everything société-dependent lives in one `FacturesScope`.
When a future TRM screen hits a partitioned table, pick between the two shapes on that
"same object?" test; don't default to copying `stock-ecru-trm.ts`.

The screen (`apps/web/src/pages/ClientsFacturation.tsx`) mirrors ETM's, with two
deliberate deltas:
- **Code comptable is exposed** in the Info tab (editable on a proforma). The legacy TRM
  facture window shows it and TRM really varies it — 478 of its 512 invoices on "Vente à
  façon", 33 on "Vente à façon internationale". It decides which sales account the XImport
  export posts the HT half to. ETM's screen leaves it implicit.
- **No "non envoyé" red liseré / counter pill.** TRM does not email its invoices: 511 of
  512 definitive factures have no `envoi_email` row (ETM has 1 517 that do), so the
  attention state would paint the whole list red — the noise `mps_designer` §41 rules out.
  If TRM ever starts sending from this screen, reintroduce it **with a go-live date cutoff**
  so the historical ledger stays neutral.

Proforma generation reads the rolls through `stock_ecru.IDligne_expedition_TRM` (ETM uses
`IDligne_expedition_ETM`) — the same physical roll carries both over its life, so reading
the wrong column invoices the wrong shipment's weight.

