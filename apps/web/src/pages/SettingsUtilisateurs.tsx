// Paramètres › Utilisateurs — ETM's screen, shared through `@etm` since
// 2026-09-30: one user management for both apps (list, account panel with
// password / sessions / apps, Écrans, Permissions, Profil, « + Nouveau »,
// « Copier les droits de… »). Edit it in ETM (apps/web/src/pages/
// SettingsUtilisateurs.tsx) — never fork it here.
//
// The list is TRM's members (table `utilisateur_app`, API
// lib/utilisateur-apps.ts): each company has its own users, an account may
// belong to both (Nicolas), or to TRM only (Mickaël, the Visitage and Regleur
// station accounts). What makes it TRM's, as props:
//   • permissionsPath — TRM's own catalog + store (`/api/permissions-trm/*`),
//     so neither app's screen can strip the other's grants on save;
//   • NotificationsTab — TRM's report subscriptions (components/settings/
//     NotificationsTrmTab.tsx);
//   • extraTabs — Appareils (the atelier phones enrolled under an account).

import { Smartphone } from 'lucide-react'
import { SettingsUtilisateurs as SharedSettingsUtilisateurs, type ExtraTab } from '@etm/pages/SettingsUtilisateurs'
import { AppareilsTab } from '@/components/settings/AppareilsAtelier'
import { NotificationsTrmTab } from '@/components/settings/NotificationsTrmTab'

const EXTRA_TABS: ExtraTab[] = [
  {
    key: 'appareils',
    label: 'Appareils',
    icon: Smartphone,
    render: (u) => <AppareilsTab userId={u.IDutilisateur} userName={u.name} />,
  },
]

export function SettingsUtilisateurs() {
  return (
    <SharedSettingsUtilisateurs
      permissionsPath="/permissions-trm"
      NotificationsTab={NotificationsTrmTab}
      extraTabs={EXTRA_TABS}
    />
  )
}
