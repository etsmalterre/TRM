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

import { Weight } from 'lucide-react'
import type { DashboardApp, WidgetDef } from './types'
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
]

export function findWidget(key: string): WidgetDef | undefined {
  return WIDGET_REGISTRY.find((w) => w.key === key)
}
