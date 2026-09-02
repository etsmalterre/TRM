# Rapports › Finance

> Dossier de fonctionnalité, sorti de `CLAUDE.md` le 2026-09-02 (le fichier dépassait la limite de 150 k caractères). Contenu repris tel quel ; `CLAUDE.md` n'en garde que le résumé et les pièges majeurs. **Le mettre à jour ici**, pas dans `CLAUDE.md`.

## Rapports › Finance (`/rapports/finance`) — ETM's screen, TRM's partition

Port of the legacy `FI_Analyse_Finance.wdw` (Analyse › Finance): the balance comptable
with a Charges fixes / Charges variables toggle, one row per compte, N vs N-1, and a
drawer holding the compte's yearly history and its two editable fields. Tableau layout
(§27).

**Nothing is forked — neither tier.** The API was already there: the finance widgets
(above) mount `createFinanceRouter(FINANCE_SCOPE_TRM)` at `/api/rapports-trm`, and this
screen reads the very same endpoints. Landing it was the two edits
`ETM/apps/api/src/lib/finance-common.ts` was left open for — `view_rapport_finance` joined
`financeKeys`, and `editComptesKey` switched the compte drawer's routes on.

- **The screen is ETM's file**: `import { RapportFinance } from '@etm/pages/RapportFinance'`,
  rendered `<RapportFinance basePath="/rapports-trm/finance" />`. `basePath` is the ONLY
  per-app difference (ETM defaults to `/rapports/finance`) — the frontend mirror of what
  `FinanceScope` is on the backend. Improve the file in ETM; never fork a TRM copy.
- **The rule** (verified to the cent on société 2): montant(compte, année) = `debit − credit`
  of the `releve_compta` row at the **last upload of that calendar year**. Uploads are
  cumulative YTD — never sum them, never take the early-January upload that closes the prior
  exercise. Class-7 accounts (`numero >= 700000`) are produits and are excluded.
- **Permissions**: `view_rapport_finance` + child `edit_compte_description` in
  `permission-keys-trm.ts`. Same key NAMES as ETM's catalog on purpose — same action,
  separate store. **The Rapports menu disappears entirely without the key**, Finance being
  its only screen (`SubMenuItem.permission`, on top of the menu's own `screen_rapports`
  grant). Nav hiding is convenience: the page renders "Accès restreint" and the API 403s.
- ⚠️ **`releve_compta` has no `id_societe`** — a compte id is the only thing that carries the
  partition. `GET /finance/comptes/:id/historique` had no ownership check while ETM was its
  only mount; it does now, or a TRM caller could have read an ETM payroll account's year
  series by guessing its id. Any future `:id` route on this factory needs the same guard.
- **One dependency was missing** for the shared screen: `xlsx` (Excel export of the visible
  rows). `lib/depassement.tsx` — the N/N-1 traffic light the screen and the Charges widget
  share — was already here, copied in with the widgets.
- HTTP guard for the two newly-mounted compte routes:
  `ETM/apps/api/src/scripts/check-finance-comptes-trm.ts`.

