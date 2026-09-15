// Paramètres › Utilisateurs › Appareils — the devices enrolled under one account.
//
// Two kinds, one store (API: routes/appareils-atelier.ts, lib/appareils-atelier.ts):
//   - the atelier PHONES (atelier.intra.etsmalterre.com), in two shapes chosen
//     at enrolment:
//       · a RÉGLEUR's own phone — fixed identity: the app opens as him, régleur
//         screens, no face grid, and the API only lets it write for him;
//       · a SHARED phone — the face grid of the bonnetiers, whoever holds it;
//   - the POINTEUSES (pointage.intra.etsmalterre.com, 2026-09-15) — the wall
//     tablet that clocks the salariés in and out, never a fixed identity.
// A code enrols only its own kind. The admin generates a one-time code here, the
// device types it once, and from then on carries its own cookie. Being enrolled
// is what lets it write — there is no separate right to grant. Revoking a device
// here kills its cookie, and its writes with it.
//
// Cards follow the Profil tab's (EmailEditor: zinc header band, white body).
import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Smartphone, Plus, Trash2, Loader2, AlertCircle, KeyRound, X, UserCheck, Users, Clock,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { PopoverSelect } from '@/components/ui/popover-select'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { cn } from '@/lib/utils'

// ── Wire types ─────────────────────────────────────────

type TypeAppareil = 'atelier' | 'pointeuse'

interface BonnetierRef {
  IDbonnetier: number
  prenom: string
  nom: string
}

interface AppareilRow {
  id: number
  type: TypeAppareil
  IDutilisateur: number
  IDbonnetier: number | null
  bonnetier: BonnetierRef | null
  libelle: string
  creeLe: string
  creePar: number
  vuLe: string | null
}

interface CodeRow {
  code: string
  type: TypeAppareil
  IDutilisateur: number
  libelle: string
  bonnetier: BonnetierRef | null
  expireLe: string
}

interface AppareilsPayload {
  appareils: AppareilRow[]
  codes: CodeRow[]
  ttlMs: number
}

interface Regleur {
  IDbonnetier: number
  prenom: string
  nom: string
  regleur: number
}

const QUERY_KEY = ['appareils-atelier'] as const

/** Everything that differs between the two kinds of device, in one place. */
const TEXTES: Record<TypeAppareil, {
  titre: string
  icone: typeof Smartphone
  enroler: string
  aucun: string
  aide: string
  revoquerTitre: string
  hote: string
  lienSurAppareil: string
  placeholder: string
}> = {
  atelier: {
    titre: 'Téléphones de l’atelier',
    icone: Smartphone,
    enroler: 'Enrôler un téléphone',
    aucun: 'Aucun téléphone enrôlé sous ce compte.',
    aide:
      'Un téléphone enrôlé agit sous ce compte. Un téléphone de régleur s’ouvre directement sur ses écrans ; un téléphone partagé propose la grille des bonnetiers. Révoquer un téléphone le déconnecte aussitôt : il faudra un nouveau code pour l’enrôler à nouveau.',
    revoquerTitre: 'Révoquer le téléphone',
    hote: 'atelier.intra.etsmalterre.com',
    lienSurAppareil: '« Enrôler ce téléphone », sous la grille des visages',
    placeholder: 'Téléphone Nico',
  },
  pointeuse: {
    titre: 'Pointeuses',
    icone: Clock,
    enroler: 'Enrôler une pointeuse',
    aucun: 'Aucune pointeuse enrôlée sous ce compte.',
    aide:
      'Une pointeuse enrôlée affiche les salariés du pointage et enregistre leurs arrivées, pauses et départs. Révoquer une pointeuse la déconnecte aussitôt : il faudra un nouveau code pour l’enrôler à nouveau.',
    revoquerTitre: 'Révoquer la pointeuse',
    hote: 'pointage.intra.etsmalterre.com',
    lienSurAppareil: '« Enrôler cette pointeuse », sous l’horloge',
    placeholder: 'Pointeuse atelier',
  },
}

// ── Helpers ────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** « vu il y a 3 min » — coarse on purpose; the device refreshes its own
 *  `vuLe` at most every ten minutes. */
function depuis(iso: string | null, now: number): string {
  if (!iso) return 'jamais vu'
  const min = Math.floor((now - Date.parse(iso)) / 60_000)
  if (min < 1) return "vu à l'instant"
  if (min < 60) return `vu il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `vu il y a ${h} h`
  return `vu le ${fmtDate(iso)}`
}

function nomComplet(b: BonnetierRef | null): string {
  return b ? `${b.prenom} ${b.nom}`.trim() : ''
}

/** Ticks once a second while mounted — the code countdown. */
function useMaintenant(actif: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!actif) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [actif])
  return now
}

// ── The tab ────────────────────────────────────────────

export function AppareilsTab({
  userId,
  userName,
}: {
  userId: number
  userName: string
}) {
  const queryClient = useQueryClient()
  const [enrolerType, setEnrolerType] = useState<TypeAppareil | null>(null)
  const [revoquerCible, setRevoquerCible] = useState<AppareilRow | null>(null)

  const { data, isLoading, isError } = useQuery<AppareilsPayload>({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<AppareilsPayload>('/atelier/appareils'),
    // A device enrolling itself is what the admin is waiting to see.
    refetchInterval: 15_000,
  })

  const appareils = useMemo(
    () => (data?.appareils ?? []).filter((a) => a.IDutilisateur === userId),
    [data, userId],
  )
  const codes = useMemo(
    () => (data?.codes ?? []).filter((c) => c.IDutilisateur === userId),
    [data, userId],
  )
  const now = useMaintenant(codes.length > 0)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const revoquerMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/atelier/appareils/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate()
      setRevoquerCible(null)
    },
  })

  const annulerCodeMut = useMutation({
    mutationFn: (code: string) => apiFetch(`/atelier/appareils/codes/${code}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  // Rows enrolled before the type existed come back typed 'atelier' by the API.
  const deType = (t: TypeAppareil) => ({
    appareils: appareils.filter((a) => (a.type ?? 'atelier') === t),
    codes: codes.filter((c) => (c.type ?? 'atelier') === t),
  })

  return (
    <div className="space-y-4">
      {(['atelier', 'pointeuse'] as const).map((t) => (
        <CarteAppareils
          key={t}
          type={t}
          {...deType(t)}
          now={now}
          chargement={isLoading}
          erreur={isError}
          vide={!!data}
          annulationEnCours={annulerCodeMut.isPending}
          onEnroler={() => setEnrolerType(t)}
          onAnnulerCode={(code) => annulerCodeMut.mutate(code)}
          onRevoquer={setRevoquerCible}
        />
      ))}

      {enrolerType && (
        <EnrolerDialog
          type={enrolerType}
          userId={userId}
          userName={userName}
          onClose={() => {
            setEnrolerType(null)
            invalidate()
          }}
        />
      )}

      <ConfirmDialog
        open={revoquerCible !== null}
        title={revoquerCible ? TEXTES[revoquerCible.type ?? 'atelier'].revoquerTitre : ''}
        description={
          revoquerCible
            ? `« ${revoquerCible.libelle} » ne pourra plus rien enregistrer. Il faudra un nouveau code pour l’enrôler à nouveau.`
            : undefined
        }
        confirmLabel="Révoquer"
        isPending={revoquerMut.isPending}
        onCancel={() => setRevoquerCible(null)}
        onConfirm={() => {
          if (revoquerCible) revoquerMut.mutate(revoquerCible.id)
        }}
      />
    </div>
  )
}

function CarteAppareils({
  type,
  appareils,
  codes,
  now,
  chargement,
  erreur,
  vide,
  annulationEnCours,
  onEnroler,
  onAnnulerCode,
  onRevoquer,
}: {
  type: TypeAppareil
  appareils: AppareilRow[]
  codes: CodeRow[]
  now: number
  chargement: boolean
  erreur: boolean
  /** The payload arrived — only then does an empty list mean « none ». */
  vide: boolean
  annulationEnCours: boolean
  onEnroler: () => void
  onAnnulerCode: (code: string) => void
  onRevoquer: (a: AppareilRow) => void
}) {
  const tx = TEXTES[type]
  const Icone = tx.icone
  return (
    <div className="rounded-lg border border-border/60 bg-white shadow-sm">
      <div className="px-4 py-2 border-b border-border/60 bg-zinc-100/80 rounded-t-lg flex items-center gap-2">
        <Icone className="h-3.5 w-3.5 text-accent" />
        <p className="text-xs font-bold text-primary uppercase tracking-wide flex-1">{tx.titre}</p>
        <Button size="sm" onClick={onEnroler}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          {tx.enroler}
        </Button>
      </div>

      <div className="p-4 space-y-3">
        {chargement && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            Chargement…
          </div>
        )}
        {erreur && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Impossible de lire les appareils enrôlés.
          </p>
        )}

        {codes.length > 0 && (
          <ul className="space-y-2">
            {codes.map((c) => {
              const reste = Math.max(0, Math.floor((Date.parse(c.expireLe) - now) / 1000))
              const mm = String(Math.floor(reste / 60)).padStart(2, '0')
              const ss = String(reste % 60).padStart(2, '0')
              const forme =
                type === 'pointeuse'
                  ? 'pointeuse'
                  : c.bonnetier
                    ? `régleur ${nomComplet(c.bonnetier)}`
                    : 'téléphone partagé'
              return (
                <li
                  key={c.code}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-accent/40 bg-accent/[0.06]"
                >
                  <KeyRound className="h-4 w-4 text-accent flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xl font-heading font-bold tracking-[0.3em] tabular-nums text-primary">
                        {c.code}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        expire dans {mm}:{ss}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {c.libelle} · {forme} — en attente de saisie sur {type === 'pointeuse' ? 'la tablette' : 'le téléphone'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Annuler ce code"
                    disabled={annulationEnCours}
                    onClick={() => onAnnulerCode(c.code)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        {vide && appareils.length === 0 && codes.length === 0 && (
          <p className="text-sm text-muted-foreground italic">{tx.aucun}</p>
        )}

        {appareils.length > 0 && (
          <ul className="space-y-2">
            {appareils.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/60 bg-white shadow-sm"
              >
                <div
                  className={cn(
                    'h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0',
                    a.bonnetier ? 'bg-accent/15 text-accent' : 'bg-zinc-100 text-zinc-600',
                  )}
                >
                  {type === 'pointeuse' ? (
                    <Clock className="h-4 w-4" />
                  ) : a.bonnetier ? (
                    <UserCheck className="h-4 w-4" />
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-primary truncate">{a.libelle}</span>
                    {type === 'pointeuse' ? (
                      <Badge variant="outline" className="text-zinc-600">Pointeuse</Badge>
                    ) : a.bonnetier ? (
                      <Badge variant="outline" className="bg-accent/15 text-amber-800 border-accent/40">
                        Régleur · {nomComplet(a.bonnetier)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-zinc-600">Téléphone partagé</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Enrôlé le {fmtDate(a.creeLe)} à {fmtHeure(a.creeLe)} · {depuis(a.vuLe, now)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  title={tx.revoquerTitre}
                  className="text-destructive hover:text-destructive"
                  onClick={() => onRevoquer(a)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">{tx.aide}</p>
      </div>
    </div>
  )
}

// ── « Enrôler un téléphone / une pointeuse » — two steps in one dialog ─────
// Step 1: a label (and, for a phone, its shape: a régleur's, or shared).
// Step 2: the code, big, with what to do on the device. The list behind
// refreshes on close, and every 15 s meanwhile, so the device shows up as soon
// as it typed the code.

function EnrolerDialog({
  type,
  userId,
  userName,
  onClose,
}: {
  type: TypeAppareil
  userId: number
  userName: string
  onClose: () => void
}) {
  const tx = TEXTES[type]
  const Icone = tx.icone
  const [libelle, setLibelle] = useState('')
  const [IDbonnetier, setIDbonnetier] = useState(0)
  const [resultat, setResultat] = useState<{ code: string; expireLe: string } | null>(null)

  const { data: regleurs } = useQuery<Regleur[]>({
    queryKey: ['atelier', 'bonnetiers', 'regleur'],
    queryFn: () => apiFetch<Regleur[]>('/atelier/bonnetiers?regleur=1'),
    staleTime: 5 * 60_000,
    // A pointeuse is shared by every salarié: no identity to pick.
    enabled: type === 'atelier',
  })

  // Pre-select the régleur whose name matches the account (Nicolas Antonino
  // the user ↔ Nicolas Antonino the bonnetier): the common case is his own
  // phone under his own account. The admin can still switch to « partagé ».
  useEffect(() => {
    if (!regleurs || IDbonnetier !== 0) return
    const key = userName.trim().toLowerCase()
    const same = regleurs.find((r) => `${r.prenom} ${r.nom}`.trim().toLowerCase() === key)
    if (same) {
      setIDbonnetier(same.IDbonnetier)
      setLibelle((l) => l || `Téléphone ${same.prenom}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regleurs])

  const creerMut = useMutation({
    mutationFn: () =>
      apiFetch<{ code: string; expireLe: string; ttlMs: number }>('/atelier/appareils/codes', {
        method: 'POST',
        body: JSON.stringify({
          type,
          IDutilisateur: userId,
          IDbonnetier: type === 'atelier' && IDbonnetier > 0 ? IDbonnetier : null,
          libelle: libelle.trim(),
        }),
      }),
    onSuccess: (r) => setResultat({ code: r.code, expireLe: r.expireLe }),
  })

  const options = (regleurs ?? []).map((r) => ({
    id: r.IDbonnetier,
    primary: `${r.prenom} ${r.nom}`.trim(),
    secondary: 'régleur',
  }))
  const pret = libelle.trim().length > 0 && !creerMut.isPending
  const appareilNom = type === 'pointeuse' ? 'la tablette' : 'le téléphone'

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icone className="h-5 w-5 text-accent" />
            {tx.enroler}
          </DialogTitle>
        </DialogHeader>

        {resultat ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-accent/40 bg-accent/[0.06] px-4 py-5 text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Code d’enrôlement</p>
              <p className="mt-1 text-4xl font-heading font-bold tracking-[0.35em] tabular-nums text-primary">
                {resultat.code}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                valable jusqu’à {fmtHeure(resultat.expireLe)}, une seule fois
              </p>
            </div>
            <ol className="text-sm space-y-1.5 list-decimal pl-5">
              <li>
                Sur {appareilNom}, ouvrir <span className="font-semibold">{tx.hote}</span>.
              </li>
              <li>
                Toucher <span className="font-semibold">{tx.lienSurAppareil}</span>.
              </li>
              <li>Saisir ce code. {type === 'pointeuse' ? 'La pointeuse' : 'Le téléphone'} apparaît ici dès son enrôlement.</li>
            </ol>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground" htmlFor="appareil-libelle">
                {type === 'pointeuse' ? 'Libellé de la pointeuse' : 'Libellé du téléphone'}
              </label>
              <input
                id="appareil-libelle"
                type="text"
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                placeholder={tx.placeholder}
                maxLength={50}
                autoComplete="off"
                autoFocus
                className="w-full h-9 px-2.5 text-sm rounded-md border border-input bg-white focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                {type === 'pointeuse'
                  ? 'Ce nom distingue la tablette dans cette liste.'
                  : 'Ce nom est écrit sur chaque action enregistrée depuis le téléphone (colonne « appareil »).'}
              </p>
            </div>

            {type === 'atelier' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Identité du téléphone</label>
                <PopoverSelect
                  options={options}
                  value={IDbonnetier}
                  onChange={setIDbonnetier}
                  emptyLabel="Téléphone partagé — grille des bonnetiers"
                />
                <p className="text-xs text-muted-foreground">
                  {IDbonnetier > 0
                    ? 'Le téléphone s’ouvrira directement sur les écrans du régleur, sans grille de visages, et n’enregistrera que pour lui.'
                    : 'Le téléphone proposera la grille des bonnetiers ; celui qui le tient choisit son visage.'}
                </p>
              </div>
            )}

            {creerMut.isError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {(creerMut.error as Error & { detail?: string }).detail ?? 'La génération du code a échoué.'}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="mt-4">
          {resultat ? (
            <Button onClick={onClose}>Fermer</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Annuler</Button>
              <Button disabled={!pret} onClick={() => creerMut.mutate()}>
                {creerMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                )}
                Générer le code
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
