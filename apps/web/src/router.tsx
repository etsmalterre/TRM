import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { PagePlaceholder } from '@/components/shared/PagePlaceholder'
import { Dashboard } from '@/pages/Dashboard'
import {
  ShoppingCart,
  Truck,
  Receipt,
  Users,
  CalendarDays,
  Package,
  Layers,
  ClipboardList,
  Eye,
  Coins,
  Gauge,
  Wrench,
  TrendingUp,
  HardHat,
  AlertTriangle,
  Undo2,
  BarChart3,
  FileBarChart,
  type LucideIcon,
} from 'lucide-react'
import { BobineIcon } from '@/components/icons/BobineIcon'

// PagePlaceholder takes a LucideIcon — widen it locally so our custom
// SVG components (BobineIcon, TmRollIcon, etc.) are accepted too. They
// share the same React props shape.
const PlaceholderIcon = (c: unknown) => c as LucideIcon

// Placeholder component factory
function createPlaceholder(title: string, description: string, Icon: LucideIcon) {
  return function PlaceholderPage() {
    return <PagePlaceholder title={title} description={description} icon={Icon} />
  }
}

// Clients
const ClientsCommandesPage = createPlaceholder('Commandes clients', 'Commandes clients et affectation du stock', ShoppingCart)
const ClientsExpeditionsPage = createPlaceholder('Expéditions', 'Expéditions et bons de livraison', Truck)
const ClientsFacturationPage = createPlaceholder('Facturation', 'Factures et factures proforma', Receipt)
const ClientsGestionPage = createPlaceholder('Gestion clients', 'Fiches clients, contacts et adresses', Users)
const ClientsPlanningPage = createPlaceholder('Planning', 'Planning des commandes clients', CalendarDays)

// Fils
// Références and Fournisseurs are shared verbatim with ETM — imported from
// the sister repo via the @etm alias (see vite.config.ts). Edit them there;
// both apps update. (ETM mounts FilsGestion at /fils/gestion — same screen.)
import { FilsReferences } from '@etm/pages/FilsReferences'
import { FilsGestion } from '@etm/pages/FilsGestion'
const FilsStockPage = createPlaceholder('Stock fil', 'Lots de fil en stock', Package)

// Tombé Métier
// Références is shared verbatim with ETM — imported from the sister repo
// via the @etm alias (see vite.config.ts). Edit it there; both apps update.
import { TombeMetierReferences } from '@etm/pages/TombeMetierReferences'
const TmEchantillonsPage = createPlaceholder('Échantillons', 'Échantillons tombé métier', Layers)
const TmStockPage = createPlaceholder('Stock tombé métier', 'Stock des pièces tombées métier', Package)

// Production
const ProductionOfPage = createPlaceholder('Gestion des OF', 'Ordres de fabrication : métiers, fils à tricoter et incorporer', ClipboardList)
const ProductionVisitagePage = createPlaceholder('Visitage', 'Visitage des pièces produites', Eye)
const ProductionPrimePage = createPlaceholder('Prime', 'Primes de production', Coins)
const ProductionTrsPage = createPlaceholder('TRS', 'Taux de rendement synthétique', Gauge)

// Atelier
const AtelierMaintenancePage = createPlaceholder('Maintenance', 'Maintenance des métiers : rouloir, garniture, nettoyages', Wrench)
const AtelierProductivitePage = createPlaceholder('Productivité', 'Productivité de l\'atelier', TrendingUp)
const AtelierBonnetierPage = createPlaceholder('Bonnetier', 'Suivi bonnetier', HardHat)
// Planning — real screen
import { AtelierPlanning } from '@/pages/AtelierPlanning'

// Qualité
const QualiteDefautsPage = createPlaceholder('Défauts récents', 'Défauts détectés sur les dernières heures de production', AlertTriangle)
const QualiteRetourClientPage = createPlaceholder('Retour client', 'Retours et réclamations clients', Undo2)
const QualiteAnalysePage = createPlaceholder('Analyse', 'Analyse qualité', BarChart3)

// Rapports
const RapportsProductionPage = createPlaceholder('Rapport de production', 'Rapports de production par période', FileBarChart)
const RapportsLotsFilsPage = createPlaceholder('Lots de fils', 'Rapport sur les lots de fils', PlaceholderIcon(BobineIcon))
const RapportsEtatStockFilPage = createPlaceholder('État stock fil', 'État et âge du stock de fil', Package)
const RapportsAnalysePage = createPlaceholder('Analyse', 'Analyses et comparatifs', BarChart3)

// Settings
const SettingsUtilisateursPage = createPlaceholder('Utilisateurs', 'Gestion des utilisateurs et permissions', Users)

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      // Dashboard
      { index: true, element: <Dashboard /> },

      // Clients
      { path: 'clients', element: <Navigate to="/clients/commandes" replace /> },
      { path: 'clients/commandes', element: <ClientsCommandesPage /> },
      { path: 'clients/expeditions', element: <ClientsExpeditionsPage /> },
      { path: 'clients/facturation', element: <ClientsFacturationPage /> },
      { path: 'clients/gestion', element: <ClientsGestionPage /> },
      { path: 'clients/planning', element: <ClientsPlanningPage /> },

      // Fils
      { path: 'fils', element: <Navigate to="/fils/references" replace /> },
      { path: 'fils/references', element: <FilsReferences /> },
      { path: 'fils/stock', element: <FilsStockPage /> },
      { path: 'fils/fournisseurs', element: <FilsGestion /> },

      // Tombé Métier
      { path: 'tombe-metier', element: <Navigate to="/tombe-metier/references" replace /> },
      { path: 'tombe-metier/references', element: <TombeMetierReferences /> },
      { path: 'tombe-metier/echantillons', element: <TmEchantillonsPage /> },
      { path: 'tombe-metier/stock', element: <TmStockPage /> },

      // Production
      { path: 'production', element: <Navigate to="/production/of" replace /> },
      { path: 'production/of', element: <ProductionOfPage /> },
      { path: 'production/visitage', element: <ProductionVisitagePage /> },
      { path: 'production/prime', element: <ProductionPrimePage /> },
      { path: 'production/trs', element: <ProductionTrsPage /> },

      // Atelier
      { path: 'atelier', element: <Navigate to="/atelier/maintenance" replace /> },
      { path: 'atelier/maintenance', element: <AtelierMaintenancePage /> },
      { path: 'atelier/productivite', element: <AtelierProductivitePage /> },
      { path: 'atelier/bonnetier', element: <AtelierBonnetierPage /> },
      { path: 'atelier/planning', element: <AtelierPlanning /> },

      // Qualité
      { path: 'qualite', element: <Navigate to="/qualite/defauts-recents" replace /> },
      { path: 'qualite/defauts-recents', element: <QualiteDefautsPage /> },
      { path: 'qualite/retour-client', element: <QualiteRetourClientPage /> },
      { path: 'qualite/analyse', element: <QualiteAnalysePage /> },

      // Rapports
      { path: 'rapports', element: <Navigate to="/rapports/production" replace /> },
      { path: 'rapports/production', element: <RapportsProductionPage /> },
      { path: 'rapports/lots-de-fils', element: <RapportsLotsFilsPage /> },
      { path: 'rapports/etat-stock-fil', element: <RapportsEtatStockFilPage /> },
      { path: 'rapports/analyse', element: <RapportsAnalysePage /> },

      // Settings (admin-only sub-routes)
      { path: 'settings', element: <Navigate to="/settings/utilisateurs" replace /> },
      { path: 'settings/utilisateurs', element: <SettingsUtilisateursPage /> },
    ],
  },
])
