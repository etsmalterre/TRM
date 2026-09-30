// Paramètres › Utilisateurs › Notifications — TRM's tab, injected into the
// shared screen (`@etm/pages/SettingsUtilisateurs`, prop NotificationsTab).
//
// TRM's email subscriptions. Opt-in for everyone, admin included (no bypass,
// unlike permissions). A notification that `requires` a key — a permission, or
// a menu grant: the pointage reports carry working hours, so the menu
// « Pointage » (LIVA #1196) — keeps its switch locked until that key is granted
// (Permissions or Écrans tab); the API refuses the subscription too (409
// permission_requise), and skips a subscriber who lost the right at send time.
// Switching one OFF is always allowed.
//
// « Aperçu » opens the report as it would go out now; « M’envoyer un test »
// sends it to the viewing admin's own address, whoever is selected.

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Bell, Eye, Loader2, Lock, Send } from 'lucide-react'
import { ToggleSwitch, type NotificationsTabProps } from '@etm/pages/SettingsUtilisateurs'
import { apiFetch, API_URL } from '@/lib/api'
import { mainNavigation, menuAccessKey } from '@/config/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** A TRM notification (API lib/notification-keys-trm.ts). */
interface NotificationDef {
  key: string
  label: string
  description: string
  category: string
  /** Stored TRM key the subscriber must hold: a permission, or a menu grant
   *  (the pointage reports: the menu « Pointage », `screen_pointage`). */
  requires?: string
}

interface NotificationSubscriptionRow {
  IDutilisateur: number
  subscribed: string[]
}

export function NotificationsTrmTab({
  user, currentEmail, isVin, grantedSet, permissionKeys,
}: NotificationsTabProps) {
  const queryClient = useQueryClient()
  const [testSent, setTestSent] = useState<{ key: string; message: string; ok: boolean } | null>(null)

  const { data: defs } = useQuery<NotificationDef[]>({
    queryKey: ['notif-keys-trm'],
    queryFn: () => apiFetch<NotificationDef[]>('/notifications-trm/keys'),
    staleTime: Infinity,
  })
  const { data: rows } = useQuery<NotificationSubscriptionRow[]>({
    queryKey: ['notif-users-trm'],
    queryFn: () => apiFetch<NotificationSubscriptionRow[]>('/notifications-trm/users'),
  })
  const subscribed = useMemo(
    () => new Set(rows?.find((r) => r.IDutilisateur === user.IDutilisateur)?.subscribed ?? []),
    [rows, user.IDutilisateur],
  )

  const updateMut = useMutation({
    mutationFn: (next: string[]) =>
      apiFetch(`/notifications-trm/users/${user.IDutilisateur}`, {
        method: 'PUT',
        body: JSON.stringify({ subscribed: next }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notif-users-trm'] }),
  })
  // A new selection must not inherit the previous user's error or test banner.
  useEffect(() => { updateMut.reset(); setTestSent(null) }, [user.IDutilisateur]) // eslint-disable-line react-hooks/exhaustive-deps

  const testMut = useMutation({
    mutationFn: (key: string) =>
      apiFetch<{ envoye: string }>(`/notifications-trm/envoyer-test/${key}`, { method: 'POST' }),
    onSuccess: (r, key) => setTestSent({ key, ok: true, message: `Test envoyé à ${r.envoye}.` }),
    onError: (err, key) =>
      setTestSent({ key, ok: false, message: apiMessage(err) ?? 'L’envoi du test a échoué.' }),
  })

  const grouped = useMemo(() => {
    const g = new Map<string, NotificationDef[]>()
    for (const d of defs ?? []) {
      if (!g.has(d.category)) g.set(d.category, [])
      g.get(d.category)!.push(d)
    }
    return Array.from(g.entries())
  }, [defs])

  const requisLabel = (key: string) => {
    const menu = mainNavigation.find((m) => menuAccessKey(m.href) === key)
    if (menu) return `Demande l’accès au menu « ${menu.title} » (onglet Écrans).`
    const label = permissionKeys.find((k) => k.key === key)?.label ?? key
    return `Demande le droit « ${label} » (onglet Permissions).`
  }
  const allowed = (d: NotificationDef) => !d.requires || isVin || grantedSet.has(d.requires)
  const toggle = (key: string, on: boolean) => {
    const next = new Set(subscribed)
    if (on) next.add(key)
    else next.delete(key)
    updateMut.mutate(Array.from(next))
  }

  return (
    <>
      <div className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-white shadow-sm">
        <Bell className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold">Notifications par email</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cet utilisateur reçoit les rapports activés ci-dessous, à l’adresse définie dans
            l’onglet « Profil ». Les administrateurs ne sont pas abonnés automatiquement.
          </p>
        </div>
      </div>

      {subscribed.size > 0 && !currentEmail.trim() && (
        <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10">
          <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Aucune adresse email définie</p>
            <p className="text-xs text-amber-800/80 mt-0.5">
              Les rapports activés ci-dessous ne seront envoyés à personne tant qu’une adresse
              n’est pas renseignée dans l’onglet « Profil ».
            </p>
          </div>
        </div>
      )}

      {updateMut.isError && (
        <div className="flex items-start gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/10">
          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">
            {apiMessage(updateMut.error) ?? 'L’abonnement n’a pas pu être enregistré.'}
          </p>
        </div>
      )}

      {grouped.map(([category, items]) => (
        <div key={category} className="rounded-lg border border-border/60 bg-white shadow-sm">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-100/80 border-b border-border/60 rounded-t-lg">
            <p className="text-xs font-bold text-primary uppercase tracking-wide">{category}</p>
            <Badge variant="secondary" className="text-xs ml-auto tabular-nums">
              {items.filter((d) => subscribed.has(d.key)).length}/{items.length}
            </Badge>
          </div>
          <div className="divide-y divide-border/60">
            {items.map((d) => {
              const checked = subscribed.has(d.key)
              const locked = !allowed(d) && !checked
              const disabled = locked || updateMut.isPending
              return (
                <div key={d.key} className="px-4 py-3">
                  <label className={cn('flex items-start gap-3', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
                    <div className="pt-0.5">
                      <ToggleSwitch checked={checked} disabled={disabled} onChange={(next) => toggle(d.key, next)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{d.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>
                      {locked && d.requires && (
                        <p className="flex items-center gap-1.5 text-xs text-amber-800 mt-1.5">
                          <Lock className="h-3 w-3 flex-shrink-0" />
                          {requisLabel(d.requires)}
                        </p>
                      )}
                    </div>
                  </label>
                  <div className="flex items-center gap-1 mt-2 ml-12">
                    <a
                      href={`${API_URL}/notifications-trm/apercu/${d.key}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center h-7 px-2 text-xs font-medium rounded-md transition-colors hover:bg-accent/10 hover:text-accent"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />Aperçu
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs hover:bg-accent/10 hover:text-accent"
                      disabled={testMut.isPending}
                      onClick={() => { setTestSent(null); testMut.mutate(d.key) }}
                    >
                      {testMut.isPending && testMut.variables === d.key
                        ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        : <Send className="h-3.5 w-3.5 mr-1" />}
                      M’envoyer un test
                    </Button>
                    {testSent?.key === d.key && (
                      <span className={cn('text-xs ml-1', testSent.ok ? 'text-emerald-700' : 'text-destructive')}>
                        {testSent.message}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}

/** The API's French `message` on a failed call (lib/api.ts puts the JSON on err.body). */
function apiMessage(err: unknown): string | null {
  const body = (err as { body?: { message?: unknown } } | null)?.body
  return typeof body?.message === 'string' ? body.message : null
}
