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
      { title: 'Planning', href: '/clients/planning' },
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
      { title: 'Gestion des OF', href: '/production/of' },
      { title: 'Visitage', href: '/production/visitage' },
      { title: 'Prime', href: '/production/prime' },
      { title: 'TRS', href: '/production/trs' },
    ],
  },
  {
    id: 'atelier',
    title: 'Atelier',
    icon: Wrench,
    href: '/atelier',
    submenus: [
      { title: 'Maintenance', href: '/atelier/maintenance' },
      { title: 'Productivité', href: '/atelier/productivite' },
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
    id: 'rapports',
    title: 'Rapports',
    icon: FileBarChart,
    href: '/rapports',
    submenus: [
      { title: 'Production', href: '/rapports/production' },
      { title: 'Lots de fils', href: '/rapports/lots-de-fils' },
      { title: 'État stock fil', href: '/rapports/etat-stock-fil' },
      { title: 'Analyse', href: '/rapports/analyse' },
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
  '/clients/planning': 'Planning',
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
  '/production/of': 'Gestion des OF',
  '/production/visitage': 'Visitage',
  '/production/prime': 'Prime',
  '/production/trs': 'TRS',
  // Atelier
  '/atelier': 'Atelier',
  '/atelier/maintenance': 'Maintenance',
  '/atelier/productivite': 'Productivité',
  '/atelier/bonnetier': 'Bonnetier',
  '/atelier/planning': 'Planning',
  // Qualité
  '/qualite': 'Qualité',
  '/qualite/defauts-recents': 'Défauts récents',
  '/qualite/retour-client': 'Retour client',
  '/qualite/analyse': 'Analyse',
  // Rapports
  '/rapports': 'Rapports',
  '/rapports/production': 'Production',
  '/rapports/lots-de-fils': 'Lots de fils',
  '/rapports/etat-stock-fil': 'État stock fil',
  '/rapports/analyse': 'Analyse',
  // Settings
  '/settings': 'Paramètres',
  '/settings/utilisateurs': 'Utilisateurs',
}
