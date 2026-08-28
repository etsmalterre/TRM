import type { ComponentType } from 'react'
import {
  LayoutDashboard,
  Users,
  Factory,
  Wrench,
  ShieldCheck,
  FileBarChart,
  Settings,
} from 'lucide-react'
import { BobineIcon } from '@/components/icons/BobineIcon'
import { TmRollIcon } from '@/components/icons/TmRollIcon'

/** Sidebar / mobile-nav only ever pass `className` to the icon, so the
 *  type is intentionally minimal — that lets both SVG-style components
 *  (lucide icons, BobineIcon) and our CSS-masked span icons (TmRollIcon)
 *  plug in without prop-shape gymnastics. */
export type NavIcon = ComponentType<{ className?: string }>

export interface SubMenuItem {
  title: string
  href: string
  /** When true, the entry is only shown to admin users. Filtered out of the
   *  sidebar render when the current user is not the effective admin. */
  adminOnly?: boolean
  /** When set, the entry is only shown to users holding this permission key.
   *  Filtered out of every nav surface via `visibleSubmenus`. The page and the
   *  API enforce the same check, so hiding it here is convenience, not the
   *  security boundary. */
  permission?: string
}

// ── Screen access ───────────────────────────────────────
// Two levels, mirrored in ETM's apps/api/src/lib/screen-keys-trm.ts (kept in
// sync by apps/api/src/scripts/check-screen-access-trm.ts):
//
//   • a MENU is a grant, default closed        — `screen_<menu>`
//   • a SCREEN inside a granted menu is a hide — `hide_<menu>_<screen>`
//
// Granting a menu grants every screen under it, so a newly shipped screen is
// immediately visible to everyone who already has its menu instead of being
// invisible until an admin ticks it per user. Confidentiality is NOT this
// axis's job — that's what an action key in permission-keys-trm.ts is for,
// enforced server-side.
//
// Keys derive from the href, so nothing here has to be maintained by hand.
// They are stored in TRM's own permissions-trm.json, never ETM's store.

/** '/tombe-metier/references' → 'tombe_metier_references' */
function slug(href: string): string {
  return href.replace(/^\//, '').replace(/[/-]/g, '_')
}

/** Grant key for a whole menu. Absent = the menu does not exist for the user. */
export function menuAccessKey(menuHref: string): string {
  return `screen_${slug(menuHref)}`
}

/** Hide key for one screen inside a granted menu. Absent = visible. */
export function screenHideKey(screenHref: string): string {
  return `hide_${slug(screenHref)}`
}

/** What every nav-filtering helper needs from the permissions context.
 *
 *  `has` applies the effective-admin bypass; `hasRaw` does NOT. Hide keys MUST
 *  be read through `hasRaw` — with the bypass, `has('hide_fils_stock')` is true
 *  for an admin and would hide every screen from them. */
export interface NavAccess {
  isEffectiveAdmin: boolean
  has: (key: string) => boolean
  hasRaw: (key: string) => boolean
}

/** Filter a submenu list for the current viewer. Used by every nav surface
 *  (sidebar context menu, header tabs, mobile nav) so an entry the user
 *  cannot open never appears in one of them and not the others.
 *
 *  The menu-level grant is NOT checked here (a submenu list doesn't know its
 *  parent) — go through `visibleMainNavigation` / `canOpenScreen` for that. */
export function visibleSubmenus(submenus: SubMenuItem[], opts: NavAccess): SubMenuItem[] {
  return submenus.filter((s) => {
    if (s.adminOnly && !opts.isEffectiveAdmin) return false
    if (s.permission && !opts.has(s.permission)) return false
    if (opts.hasRaw(screenHideKey(s.href))) return false
    return true
  })
}

/** True when the user holds the menu's grant. */
export function canOpenMenu(menuHref: string, opts: NavAccess): boolean {
  return opts.has(menuAccessKey(menuHref))
}

/** The main navigation as this viewer sees it: menus they hold the grant for,
 *  each carrying only the submenus they may open, and menus left with no
 *  submenu at all dropped entirely (same rule the Paramètres menu already
 *  follows when its only entry is admin-only). */
export function visibleMainNavigation(opts: NavAccess): MainMenuItem[] {
  const out: MainMenuItem[] = []
  for (const item of mainNavigation) {
    if (!canOpenMenu(item.href, opts)) continue
    const submenus = visibleSubmenus(item.submenus, opts)
    if (submenus.length === 0) continue
    out.push({ ...item, submenus })
  }
  return out
}

/** Route of the first screen the viewer may open under a menu, or null. Used
 *  for the menu index redirect (`/clients` → its first visible screen), which
 *  must not land on a screen the user cannot see. */
export function firstVisibleScreenHref(menuHref: string, opts: NavAccess): string | null {
  const item = mainNavigation.find((m) => m.href === menuHref)
  if (!item || !canOpenMenu(menuHref, opts)) return null
  return visibleSubmenus(item.submenus, opts)[0]?.href ?? null
}

/** Whether the viewer may open an exact screen route. */
export function canOpenScreen(screenHref: string, opts: NavAccess): boolean {
  const item = mainNavigation.find((m) => m.submenus.some((s) => s.href === screenHref))
  if (!item) return true // not a nav screen (dashboard, settings, unknown) — not ours to gate
  if (!canOpenMenu(item.href, opts)) return false
  return visibleSubmenus(item.submenus, opts).some((s) => s.href === screenHref)
}

export interface MainMenuItem {
  id: string
  title: string
  icon: NavIcon
  href: string
  submenus: SubMenuItem[]
}

// Dashboard - standalone item at top. Its submenu tabs are the user's own
// tableaux de bord (data, not config) — the Header reads them from the
// dashboard layout query rather than from `submenus`.
export const dashboardItem: MainMenuItem = {
  id: 'dashboard',
  title: 'Tableau de bord',
  icon: LayoutDashboard,
  href: '/',
  submenus: [],
}

/** Secondary dashboards live at `/tableau-de-bord/<id>`; the primary at `/`. */
export const DASHBOARD_ROUTE_PREFIX = '/tableau-de-bord'

// Settings - standalone item at bottom
export const settingsItem: MainMenuItem = {
  id: 'settings',
  title: 'Paramètres',
  icon: Settings,
  href: '/settings',
  submenus: [
    { title: 'Utilisateurs', href: '/settings/utilisateurs', adminOnly: true },
  ],
}

// Main navigation items (between dashboard and settings).
// Order mirrors the legacy WinDev MPS main menu in Tricotage Malterre mode:
// Clients, Fils, Tombé Métier, Production, Atelier, Qualité, Rapports.
export const mainNavigation: MainMenuItem[] = [
  {
    id: 'clients',
    title: 'Clients',
    icon: Users,
    href: '/clients',
    submenus: [
      { title: 'Commandes', href: '/clients/commandes' },
      { title: 'Expéditions', href: '/clients/expeditions' },
      { title: 'Facturation', href: '/clients/facturation' },
      { title: 'Gestion', href: '/clients/gestion' },
    ],
  },
  {
    id: 'fils',
    title: 'Fils',
    icon: BobineIcon,
    href: '/fils',
    submenus: [
      { title: 'Références', href: '/fils/references' },
      { title: 'Stock', href: '/fils/stock' },
      { title: 'Fournisseurs', href: '/fils/fournisseurs' },
    ],
  },
  {
    id: 'tombe-metier',
    title: 'Tombé Métier',
    icon: TmRollIcon,
    href: '/tombe-metier',
    submenus: [
      { title: 'Références', href: '/tombe-metier/references' },
      { title: 'Échantillons', href: '/tombe-metier/echantillons' },
      { title: 'Stock', href: '/tombe-metier/stock' },
    ],
  },
  {
    id: 'production',
    title: 'Production',
    icon: Factory,
    href: '/production',
    submenus: [
      { title: 'Ordres de fabrication', href: '/production/of' },
      { title: 'Visitage', href: '/production/visitage' },
      { title: 'Prime', href: '/production/prime' },
      { title: 'TRS', href: '/production/trs', permission: 'view_trs' },
    ],
  },
  {
    id: 'atelier',
    title: 'Atelier',
    icon: Wrench,
    href: '/atelier',
    submenus: [
      { title: 'Maintenance', href: '/atelier/maintenance' },
      { title: 'Bonnetier', href: '/atelier/bonnetier' },
      { title: 'Planning', href: '/atelier/planning' },
    ],
  },
  {
    id: 'qualite',
    title: 'Qualité',
    icon: ShieldCheck,
    href: '/qualite',
    submenus: [
      { title: 'Défauts récents', href: '/qualite/defauts-recents' },
      { title: 'Retour client', href: '/qualite/retour-client' },
      { title: 'Analyse', href: '/qualite/analyse' },
    ],
  },
  {
    // Finance is the whole menu — the Production / Lots de fils / État stock
    // fil / Analyse entries were never-built placeholders and went with it.
    // Gated on top of the menu's own screen-access grant: the balance names
    // the payroll lines, so a viewer without the key loses the Rapports menu
    // entirely (it has no other screen to fall back to). NB: keep notes above
    // `id` — ETM's check-screen-access-trm.ts parses this file textually and
    // wants `href` immediately followed by `submenus`.
    id: 'rapports',
    title: 'Rapports',
    icon: FileBarChart,
    href: '/rapports',
    submenus: [
      { title: 'Finance', href: '/rapports/finance', permission: 'view_rapport_finance' },
    ],
  },
]

// Helper to find active menu based on current path
export function getActiveMenu(pathname: string): MainMenuItem | undefined {
  // Check dashboard — `/` plus every secondary dashboard of the current user
  if (pathname === dashboardItem.href || pathname.startsWith(DASHBOARD_ROUTE_PREFIX)) {
    return dashboardItem
  }
  // Check settings
  if (pathname === settingsItem.href || pathname.startsWith(settingsItem.href + '/')) {
    return settingsItem
  }
  // Check main navigation
  return mainNavigation.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/')
  )
}

// Route titles for breadcrumbs
export const routeTitles: Record<string, string> = {
  '/': 'Accueil',
  '/tableau-de-bord': 'Tableau de bord',
  // Clients
  '/clients': 'Clients',
  '/clients/commandes': 'Commandes',
  '/clients/expeditions': 'Expéditions',
  '/clients/facturation': 'Facturation',
  '/clients/gestion': 'Gestion',
  // Fils
  '/fils': 'Fils',
  '/fils/references': 'Références',
  '/fils/stock': 'Stock',
  '/fils/fournisseurs': 'Fournisseurs',
  // Tombé Métier
  '/tombe-metier': 'Tombé Métier',
  '/tombe-metier/references': 'Références',
  '/tombe-metier/echantillons': 'Échantillons',
  '/tombe-metier/stock': 'Stock',
  // Production
  '/production': 'Production',
  '/production/of': 'Ordres de fabrication',
  '/production/visitage': 'Visitage',
  '/production/prime': 'Prime',
  '/production/trs': 'TRS',
  // Atelier
  '/atelier': 'Atelier',
  '/atelier/maintenance': 'Maintenance',
  '/atelier/bonnetier': 'Bonnetier',
  '/atelier/planning': 'Planning',
  // Qualité
  '/qualite': 'Qualité',
  '/qualite/defauts-recents': 'Défauts récents',
  '/qualite/retour-client': 'Retour client',
  '/qualite/analyse': 'Analyse',
  // Rapports
  '/rapports': 'Rapports',
  '/rapports/finance': 'Finance',
  // Settings
  '/settings': 'Paramètres',
  '/settings/utilisateurs': 'Utilisateurs',
}
