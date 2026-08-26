import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { PagePlaceholder } from '@/components/shared/PagePlaceholder'
// Tableau de bord — the customisable widget grid is shared verbatim with ETM
// (same shell, same edit mode, same per-user layout endpoint scoped by
// `?app=trm`). Its `@/components/dashboard/registry` import resolves to THIS
// app's registry, which is where TRM's widgets live.
import { Dashboard } from '@etm/pages/Dashboard'
import {
  Layers,
  ClipboardList,
  Eye,
  Gauge,
  HardHat,
  AlertTriangle,
  Undo2,
  BarChart3,
  type LucideIcon,
} from 'lucide-react'

// Placeholder component factory
function createPlaceholder(title: string, description: string, Icon: LucideIcon) {
  return function PlaceholderPage() {
    return <PagePlaceholder title={title} description={description} icon={Icon} />
  }
}

// Clients
// Commandes — real screen (TRM client ledger, IDsociete = 2). Not shared with
// ETM: same tables, other partition, and a production-centric layout.
import { ClientsCommandes } from '@/pages/ClientsCommandes'
// Facturation — real screen. Not shared with ETM: `facture` / `facture_prov`
// are partitioned by IDsociete, so it talks to `/factures-trm` (the same API
// router factory as ETM's `/factures`, scoped to société 2) and shows the
// TRM-only "Code comptable" field.
import { ClientsFacturation } from '@/pages/ClientsFacturation'
// Gestion — real screen (port of the legacy FI_Gestion_Client_TRM window).
// Not shared with ETM: the two ledgers show different fields and read
// IDsociete = 2 vs 1 (API: ETM `routes/clients-trm.ts`).
import { ClientsGestion } from '@/pages/ClientsGestion'
// Expéditions is NOT shared with ETM: `expedition` is partitioned by IDsociete
// and the two halves ship different merchandise (TRM sends tombé de métier off
// its own OFs; ETM sends finished rolls out of a magasin). Own screen, own
// endpoints (`/expeditions-trm`) — same reasoning as Tombé Métier › Stock.
import { ClientsExpeditions } from '@/pages/ClientsExpeditions'

// Fils
// Références and Fournisseurs are shared verbatim with ETM — imported from
// the sister repo via the @etm alias (see vite.config.ts). Edit them there;
// both apps update. (ETM mounts FilsGestion at /fils/gestion — same screen.)
import { FilsReferences } from '@etm/pages/FilsReferences'
import { FilsGestion } from '@etm/pages/FilsGestion'
// Stock is NOT shared with ETM: stock_fil is one un-partitioned table, but the
// two screens are different flavors of it — TRM's adds the Client column (the
// yarn's owner, à façon) and the lifecycle actions (division, titrage,
// archivage). Own screen, own endpoints (`/stock/fil-trm`).
import { FilsStock } from '@/pages/FilsStock'

// Tombé Métier
// Références is shared verbatim with ETM — imported from the sister repo
// via the @etm alias (see vite.config.ts). Edit it there; both apps update.
import { TombeMetierReferences } from '@etm/pages/TombeMetierReferences'
const TmEchantillonsPage = createPlaceholder('Échantillons', 'Échantillons tombé métier', Layers)
// Stock is NOT shared with ETM: `stock_ecru` is partitioned by IDsociete and the
// two halves are different objects (TRM pieces come off an OF on a métier; ETM
// pieces sit in a magasin waiting for teinture). Own screen, own endpoints.
import { TombeMetierStock } from '@/pages/TombeMetierStock'

// Production
// Gestion des OF is TRM-only by nature: ordre_fabrication / piece_production /
// asso_fil_of have no IDsociete column — knitting production IS Tricotage
// Malterre. Own screen (port of FEN_Gestion_des_OF.wdw), own endpoints
// (ETM/apps/api/src/routes/of-trm.ts, mounted at /api/of-trm).
import { ProductionOf } from '@/pages/ProductionOf'
import { QualiteRetourClient } from '@/pages/QualiteRetourClient'
const ProductionVisitagePage = createPlaceholder('Visitage', 'Visitage des pièces produites', Eye)
// Prime — real screen (port of the legacy FI_Prime window). TRM-only: reads
// TRM knitted production (stock_ecru via OF) through `/prime-trm` on the ETM API.
import { ProductionPrime } from '@/pages/ProductionPrime'
const ProductionTrsPage = createPlaceholder('TRS', 'Taux de rendement synthétique', Gauge)

// Atelier
// Maintenance — real screen (port of the legacy FI_Maintenance.wdw). TRM-only
// by nature: `machine` / `operation_maintenance` have no IDsociete column, the
// knitting machines ARE Tricotage Malterre. API: /api/maintenance-trm.
// (Productivité was removed from the Atelier menu on 2026-08-26 — it had never
// been more than a placeholder.)
import { AtelierMaintenance } from '@/pages/AtelierMaintenance'
const AtelierBonnetierPage = createPlaceholder('Bonnetier', 'Suivi bonnetier', HardHat)
// Planning — real screen
import { AtelierPlanning } from '@/pages/AtelierPlanning'

// Qualité
const QualiteDefautsPage = createPlaceholder('Défauts récents', 'Défauts détectés sur les dernières heures de production', AlertTriangle)
const QualiteAnalysePage = createPlaceholder('Analyse', 'Analyse qualité', BarChart3)

// Rapports
// Finance is shared verbatim with ETM — same file, imported from the sister
// repo via the @etm alias. `compte_compta` / `upload_compta` are partitioned by
// IDsociete and the two halves are the SAME object, so the only per-app
// difference is the endpoint prefix it is handed: `/rapports-trm/finance`, the
// ETM API's finance router factory mounted on société 2 (the very endpoints the
// Charges and Analyse financière widgets already read). Edit it in ETM.
import { RapportFinance } from '@etm/pages/RapportFinance'

// Settings
// Utilisateurs — real screen (admin-only): the TRM staff list, Profil cards
// (email / photo / signature, shared stores with ETM) and the Permissions tab
// over TRM's own catalog (/api/permissions-trm). Écrans / notifications
// toggles arrive with the features that need them.
import { SettingsUtilisateurs } from '@/pages/SettingsUtilisateurs'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      // Dashboard — the primary tableau de bord at `/`, the user's secondary
      // ones at `/tableau-de-bord/<id>` (same screen, different layout).
      { index: true, element: <Dashboard /> },
      { path: 'tableau-de-bord/:dashboardId', element: <Dashboard /> },

      // Clients
      { path: 'clients', element: <Navigate to="/clients/commandes" replace /> },
      { path: 'clients/commandes', element: <ClientsCommandes /> },
      { path: 'clients/expeditions', element: <ClientsExpeditions /> },
      { path: 'clients/facturation', element: <ClientsFacturation /> },
      { path: 'clients/gestion', element: <ClientsGestion /> },

      // Fils
      { path: 'fils', element: <Navigate to="/fils/references" replace /> },
      { path: 'fils/references', element: <FilsReferences /> },
      { path: 'fils/stock', element: <FilsStock /> },
      { path: 'fils/fournisseurs', element: <FilsGestion /> },

      // Tombé Métier
      { path: 'tombe-metier', element: <Navigate to="/tombe-metier/references" replace /> },
      { path: 'tombe-metier/references', element: <TombeMetierReferences /> },
      { path: 'tombe-metier/echantillons', element: <TmEchantillonsPage /> },
      { path: 'tombe-metier/stock', element: <TombeMetierStock /> },

      // Production
      { path: 'production', element: <Navigate to="/production/of" replace /> },
      { path: 'production/of', element: <ProductionOf /> },
      { path: 'production/visitage', element: <ProductionVisitagePage /> },
      { path: 'production/prime', element: <ProductionPrime /> },
      { path: 'production/trs', element: <ProductionTrsPage /> },

      // Atelier
      { path: 'atelier', element: <Navigate to="/atelier/maintenance" replace /> },
      { path: 'atelier/maintenance', element: <AtelierMaintenance /> },
      { path: 'atelier/bonnetier', element: <AtelierBonnetierPage /> },
      { path: 'atelier/planning', element: <AtelierPlanning /> },

      // Qualité
      { path: 'qualite', element: <Navigate to="/qualite/retour-client" replace /> },
      { path: 'qualite/defauts-recents', element: <QualiteDefautsPage /> },
      { path: 'qualite/retour-client', element: <QualiteRetourClient /> },
      { path: 'qualite/analyse', element: <QualiteAnalysePage /> },

      // Rapports
      { path: 'rapports', element: <Navigate to="/rapports/finance" replace /> },
      // The page renders its own "Accès restreint" state without the
      // view_rapport_finance permission; the API refuses too.
      { path: 'rapports/finance', element: <RapportFinance basePath="/rapports-trm/finance" /> },

      // Settings (admin-only sub-routes)
      { path: 'settings', element: <Navigate to="/settings/utilisateurs" replace /> },
      { path: 'settings/utilisateurs', element: <SettingsUtilisateurs /> },
    ],
  },
])
