// Catalog of every TRM tableau de bord widget.
//
// Adding a widget = one entry here. The shared dashboard shell (imported from
// ETM via `@etm/pages/Dashboard`) derives everything else from it: which
// users may see it (`permission` — a TRM key, lib/permission-keys-trm.ts in
// the ETM API), how it appears in the hidden-widget tray (`title` / `icon`),
// what sizes it offers, and where it lands by default.
//
// `key` is persisted in each user's saved layout (`?app=trm` partition of the
// user-profiles store), so treat it as stable — renaming one silently drops
// that widget from every layout that mentions it (it degrades gracefully: the
// widget reappears at the end with its defaults).

import { LineChart, ScanEye, TrendingUp, Wallet, Weight } from 'lucide-react'
import type { DashboardApp, WidgetDef } from './types'
import { AnalyseFinanciereWidget } from './AnalyseFinanciereWidget'
import { ChargesWidget } from './ChargesWidget'
import { ChiffreAffairesWidget } from './ChiffreAffairesWidget'
import { EvolutionCaWidget } from './EvolutionCaWidget'
import { PiecesAVisiterWidget } from './PiecesAVisiterWidget'
import { PoidsPiecesWidget } from './PoidsPiecesWidget'

export type { WidgetDef }

/** Sent as `?app=` to the layout endpoint: TRM's dashboards are stored apart
 *  from ETM's, because the two catalogs share nothing. */
export const DASHBOARD_APP: DashboardApp = 'trm'

/** Order here is the out-of-the-box dashboard for a user who never customised. */
export const WIDGET_REGISTRY: readonly WidgetDef[] = [
  {
    key: 'poids_pieces',
    permission: 'dashboard_poids_pieces',
    title: 'Poids des pièces',
    icon: Weight,
    defaultWidth: 6,
    // Four columns (métier, n° OF, % valides, nb pièces) — below 3 grid
    // columns the header labels start wrapping.
    minWidth: 3,
    // On the grid's 24 px quantum (18 units) so a reset layout equals the
    // default exactly and is stored as null rather than as a frozen copy.
    defaultHeightPx: 416,
    Component: PoidsPiecesWidget,
  },
  {
    key: 'pieces_a_visiter',
    permission: 'dashboard_pieces_a_visiter',
    title: 'Pièces à visiter',
    icon: ScanEye,
    defaultWidth: 6,
    // Five columns (métier, n° pièce, fin du tricotage, attente, équipe) —
    // below 4 grid columns the datetime and the header labels start wrapping.
    minWidth: 4,
    // Same 24 px quantum as its neighbour « Poids des pièces », and the same
    // height: the two sit side by side on the default dashboard and a mismatch
    // would leave a step in the first row.
    defaultHeightPx: 416,
    Component: PiecesAVisiterWidget,
  },
  // Finance — the four widgets are mirrors of ETM's, over TRM's own partition
  // of the same books (/api/rapports-trm, société 2). Improve the components in
  // ETM and re-copy; see each file's header for its deliberate deltas.
  {
    key: 'chiffre_affaires',
    permission: 'dashboard_ca',
    title: "Chiffre d'affaires",
    icon: TrendingUp,
    defaultWidth: 12,
    // Narrow is the user's call: the ranking's € columns stop fitting well
    // below ~6 columns, but the table scrolls horizontally rather than break.
    minWidth: 3,
    // Shorter than ETM's 720 — TRM invoices 8 or 9 clients a year, not ~144 —
    // but tall enough that the whole book fits without the table scrolling,
    // which is the point of the smaller card. On the grid's `24h − 16` quantum
    // (h = 27) so a reset layout equals the default exactly.
    defaultHeightPx: 632,
    Component: ChiffreAffairesWidget,
  },
  {
    key: 'evolution_ca',
    // Sub-right of dashboard_ca. The endpoint still enforces the parent, so the
    // figure stays protected; this key only decides whether the chart shows, so
    // an admin can grant the CA table without the chart or the reverse. A child
    // is never held without its parent, so the widget can't render onto a 403.
    permission: 'dashboard_evolution_ca',
    title: 'Évolution du CA',
    icon: TrendingUp,
    defaultWidth: 6,
    // Twelve month labels need the width; below 4 columns they collide.
    minWidth: 4,
    defaultHeightPx: 420,
    Component: EvolutionCaWidget,
  },
  {
    key: 'finance_analyse',
    permission: 'dashboard_finance',
    title: 'Analyse financière',
    icon: LineChart,
    defaultWidth: 6,
    // Below ~4 columns the 12 month labels and the € axis start colliding.
    minWidth: 4,
    defaultHeightPx: 460,
    Component: AnalyseFinanciereWidget,
  },
  {
    key: 'charges',
    permission: 'dashboard_charges',
    title: 'Charges',
    icon: Wallet,
    defaultWidth: 4,
    // Two stacked amount blocks — they hold up narrow.
    minWidth: 3,
    defaultHeightPx: 340,
    Component: ChargesWidget,
  },
]

export function findWidget(key: string): WidgetDef | undefined {
  return WIDGET_REGISTRY.find((w) => w.key === key)
}
