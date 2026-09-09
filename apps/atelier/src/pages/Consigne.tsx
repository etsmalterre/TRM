// Consigne & messages — legacy FEN_Consigne.
//
// One window, three plans in the legacy:
//   plan 1  the consigne, read      (bonnetier build, when one exists)
//   plan 2  the message_of thread   (both builds — « ENVOYER », delete your own)
//   plan 3  the consigne, WRITTEN   (régleur build: `SAI_Consigne_regleur` bound
//                                    to ordre_fabrication.observations)
// behind one switch (INT_Option). The bonnetier lands on the consigne when
// there is one and on the messages otherwise; the régleur always lands on the
// editor. Same here, as a two-segment control.
//
// The consigne is the same object everywhere (§46): red callout when read,
// plain field when written — an input dressed as an alert reads as a
// validation error. The legacy saved on every keystroke; this saves on
// « Enregistrer », because a consigne is an order and half of one, saved
// mid-sentence, is a wrong order on every other phone for as long as the
// régleur keeps typing.
//
// Messages are what a bonnetier leaves for the next shift on this OF. The
// server, not the button, decides whose message can be deleted.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, AlertCircle, AlertTriangle, Send, Trash2, Save, Check } from 'lucide-react'
import {
  fetchMachines,
  fetchOf,
  fetchMessages,
  posterMessage,
  supprimerMessage,
  ecrireConsigne,
  type MessageOf,
} from '@/lib/atelier-api'
import { messagePourErreur } from '@/lib/erreurs'
import { PosteHeader } from '@/components/layout/PosteHeader'
import { ConsigneCallout } from '@/components/of/ConsigneCallout'
import { ConfirmSheet } from '@/components/atelier/ConfirmSheet'
import { BonnetierPhoto } from '@/components/atelier/BonnetierPhoto'
import { Segment } from '@/components/atelier/Segment'
import { useIdentite } from '@/contexts/BonnetierContext'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Onglet = 'consigne' | 'messages'

export function Consigne() {
  const { machineId } = useParams<{ machineId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { identite } = useIdentite()
  const idMachine = Number(machineId) || 0
  const regleur = identite?.regleur ?? false

  const machinesQ = useQuery({
    queryKey: ['atelier', 'machines', regleur],
    queryFn: () => fetchMachines(regleur),
    staleTime: 30_000,
  })
  const machine = machinesQ.data?.find((m) => m.IDmachine === idMachine)
  const ofId = machine?.of?.IDordre_fabrication ?? 0

  const ofQ = useQuery({
    queryKey: ['atelier', 'of', ofId],
    queryFn: () => fetchOf(ofId),
    enabled: ofId > 0,
    staleTime: 15_000,
  })
  const messagesQ = useQuery({
    queryKey: ['atelier', 'messages', ofId],
    queryFn: () => fetchMessages(ofId),
    enabled: ofId > 0,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  })
  const of = ofQ.data

  // Landing tab, decided once the OF is known (the legacy's INT_Option init).
  const [onglet, setOnglet] = useState<Onglet | null>(null)
  useEffect(() => {
    if (onglet !== null || !of) return
    setOnglet(regleur || of.consigne ? 'consigne' : 'messages')
  }, [of, regleur, onglet])

  const titre = machine?.label ?? '—'
  const chargement = machinesQ.isLoading || (ofId > 0 && ofQ.isLoading)
  const nbMessages = messagesQ.data?.length ?? of?.nb_messages ?? 0

  return (
    <div className="h-full flex flex-col bg-background">
      <PosteHeader titre={titre} onBack={() => navigate(-1)} />

      {chargement && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      )}

      {!chargement && (!machine || !ofId) && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center">
          <AlertCircle className="h-9 w-9 text-muted-foreground" />
          <p className="text-base font-semibold">Aucun OF en cours</p>
          <p className="text-sm text-muted-foreground">
            {machine ? `Le métier ${machine.label} ne tourne sur aucun ordre de fabrication.` : "Ce métier n'existe plus."}
          </p>
        </div>
      )}

      {of && onglet && (
        <>
          <div className="flex-shrink-0 px-3 pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <h1 className="text-2xl font-heading font-bold tracking-tight leading-none">OF {of.IDordre_fabrication}</h1>
              <p className="text-xs text-muted-foreground truncate">
                {of.reference}
                {of.coloris ? ` · ${of.coloris}` : ''}
              </p>
            </div>
            <div className="mt-2 h-px w-24 bg-gradient-to-r from-gold to-transparent" />
          </div>

          <div className="flex-shrink-0 p-2 mt-1 bg-zinc-200/50 border-y border-border">
            <div className="flex gap-1 rounded-lg bg-background p-1">
              <Segment label="Consigne" active={onglet === 'consigne'} onClick={() => setOnglet('consigne')} />
              <Segment
                label="Messages"
                count={nbMessages}
                active={onglet === 'messages'}
                onClick={() => setOnglet('messages')}
              />
            </div>
          </div>

          {onglet === 'consigne' &&
            (regleur ? (
              <EditeurConsigne ofId={ofId} initiale={of.consigne} IDbonnetier={identite!.id} />
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent p-3">
                {of.consigne ? (
                  <ConsigneCallout texte={of.consigne} />
                ) : (
                  <p className="pt-10 text-center text-sm text-muted-foreground italic">Aucune consigne sur cet OF.</p>
                )}
              </div>
            ))}

          {onglet === 'messages' && (
            <FilMessages
              ofId={ofId}
              messages={messagesQ.data ?? []}
              chargement={messagesQ.isLoading}
              erreurChargement={messagesQ.isError}
              IDbonnetier={identite!.id}
              onChange={() => {
                qc.invalidateQueries({ queryKey: ['atelier', 'messages', ofId] })
                // The poste's badge and the métier list carry the count.
                qc.invalidateQueries({ queryKey: ['atelier', 'of', ofId] })
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

/** Plan 3 — the régleur writes the consigne. A plain field (§46.2), a gold
 *  commit, the failure inline (§45.3). */
function EditeurConsigne({ ofId, initiale, IDbonnetier }: { ofId: number; initiale: string; IDbonnetier: number }) {
  const qc = useQueryClient()
  const [texte, setTexte] = useState(initiale)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enregistre, setEnregistre] = useState(false)
  // Re-arm on a fresh OF read (another phone may have written it meanwhile).
  useEffect(() => {
    setTexte(initiale)
  }, [initiale])

  const mut = useMutation({
    mutationFn: () => ecrireConsigne(ofId, { IDbonnetier, consigne: texte }),
    onSuccess: (r) => {
      setErreur(null)
      setEnregistre(true)
      setTexte(r.consigne)
      qc.invalidateQueries({ queryKey: ['atelier', 'of', ofId] })
      qc.invalidateQueries({ queryKey: ['atelier', 'machines'] })
      qc.invalidateQueries({ queryKey: ['atelier', 'reglage', ofId] })
    },
    onError: (e: Error & { status?: number }) => {
      setEnregistre(false)
      setErreur(e.status === 403 ? 'Seul un régleur peut écrire la consigne.' : messagePourErreur(e))
    },
  })

  const modifie = texte.trim() !== initiale.trim()
  const empeche = mut.isPending ? 'Enregistrement en cours…' : !modifie ? 'Rien à enregistrer.' : null

  return (
    <div className="flex-1 min-h-0 flex flex-col p-3 gap-2.5">
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground px-0.5" htmlFor="consigne">
        Consigne pour cet OF
      </label>
      <textarea
        id="consigne"
        value={texte}
        onChange={(e) => {
          setTexte(e.target.value)
          setEnregistre(false)
        }}
        rows={7}
        placeholder="Ex. : Max 1 maille jusqu'à la fin de la pièce. Réparer à chaque nouvelle pièce."
        className={cn(
          'w-full rounded-xl border bg-card p-3 text-base leading-relaxed resize-none',
          'focus:outline-none focus:ring-2 focus:ring-ring border-border',
        )}
      />
      <p className="text-xs text-muted-foreground px-0.5">
        Vide = aucune consigne. Elle s'affiche en rouge sur le poste et sur la fiche OF de l'ERP.
      </p>
      {erreur && (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{erreur}</span>
        </p>
      )}
      <div className="mt-auto">
        <button
          type="button"
          disabled={!!empeche}
          title={empeche ?? 'Enregistrer la consigne'}
          onClick={() => mut.mutate()}
          className="w-full h-16 rounded-xl bg-gold text-gold-foreground text-lg font-semibold flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-40"
        >
          {mut.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : enregistre && !modifie ? (
            <Check className="h-5 w-5" />
          ) : (
            <Save className="h-5 w-5" />
          )}
          {enregistre && !modifie ? 'Enregistrée' : 'Enregistrer'}
        </button>
      </div>
      <div style={{ height: 'env(safe-area-inset-bottom)' }} />
    </div>
  )
}

/** Plan 2 — the thread. Newest first, as the legacy lists it; the composer
 *  at the foot where the thumb is. */
function FilMessages({
  ofId,
  messages,
  chargement,
  erreurChargement,
  IDbonnetier,
  onChange,
}: {
  ofId: number
  messages: MessageOf[]
  chargement: boolean
  erreurChargement: boolean
  IDbonnetier: number
  onChange: () => void
}) {
  const [texte, setTexte] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [aSupprimer, setASupprimer] = useState<MessageOf | null>(null)

  const envoyer = useMutation({
    mutationFn: () => posterMessage(ofId, { IDbonnetier, observation: texte.trim() }),
    onSuccess: () => {
      setTexte('')
      setErreur(null)
      onChange()
    },
    onError: (e: Error & { status?: number }) => setErreur(messagePourErreur(e)),
  })
  const supprimer = useMutation({
    mutationFn: (m: MessageOf) => supprimerMessage(ofId, m.id, IDbonnetier),
    onSuccess: () => {
      setErreur(null)
      onChange()
    },
    onError: (e: Error & { status?: number }) =>
      setErreur(e.status === 403 ? "Ce message n'est pas le vôtre." : messagePourErreur(e)),
  })

  const vide = texte.trim().length === 0

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-transparent p-3 space-y-2.5">
        {chargement && (
          <div className="flex justify-center pt-6">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        )}
        {erreurChargement && (
          <p className="pt-6 text-center text-sm text-destructive">Impossible de charger les messages.</p>
        )}
        {!chargement && !erreurChargement && messages.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted-foreground italic">Aucun message sur cet OF.</p>
        )}
        {messages.map((m) => (
          <MessageCarte key={m.id} m={m} mien={m.IDbonnetier === IDbonnetier} onSupprimer={() => setASupprimer(m)} />
        ))}
      </div>

      {/* The composer — legacy SAI_Observation + « ENVOYER », with its own
          refusal on an empty field (« Vous n'avez écrit aucun message »). */}
      <div className="flex-shrink-0 border-t border-border bg-zinc-200/50 p-3 space-y-2">
        {erreur && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{erreur}</span>
          </p>
        )}
        <textarea
          value={texte}
          onChange={(e) => {
            setTexte(e.target.value)
            if (erreur) setErreur(null)
          }}
          rows={2}
          placeholder="Votre message pour cet OF…"
          className="w-full rounded-xl border border-border bg-card p-3 text-base leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          disabled={envoyer.isPending}
          title={vide ? "Vous n'avez écrit aucun message" : 'Envoyer le message'}
          onClick={() => {
            if (vide) {
              setErreur("Vous n'avez écrit aucun message.")
              return
            }
            envoyer.mutate()
          }}
          className="w-full h-14 rounded-xl bg-gold text-gold-foreground text-lg font-semibold flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-40"
        >
          {envoyer.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          Envoyer
        </button>
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </div>

      {aSupprimer && (
        <ConfirmSheet
          titre="Supprimer ce message ?"
          detail={aSupprimer.observation}
          oui="Oui, supprimer"
          icone={<Trash2 className="h-5 w-5" />}
          variante="destructive"
          onCancel={() => setASupprimer(null)}
          onConfirm={() => {
            const m = aSupprimer
            setASupprimer(null)
            supprimer.mutate(m)
          }}
        />
      )}
    </div>
  )
}

const quand = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

function MessageCarte({ m, mien, onSupprimer }: { m: MessageOf; mien: boolean; onSupprimer: () => void }) {
  const date = useMemo(() => (m.date_ms ? quand.format(new Date(m.date_ms)) : ''), [m.date_ms])
  return (
    <Card className={cn('p-3 flex items-start gap-2.5', mien && 'border-gold/40 bg-gold-light/40')}>
      <BonnetierPhoto id={m.IDbonnetier} nom={m.prenom} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold truncate">{m.prenom || '—'}</span>
          <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">{date}</span>
        </div>
        <p className="text-sm mt-0.5 whitespace-pre-wrap">{m.observation}</p>
      </div>
      {mien && (
        <button
          type="button"
          onClick={onSupprimer}
          title="Supprimer mon message"
          className="flex-shrink-0 h-9 w-9 -mr-1 rounded-full flex items-center justify-center text-muted-foreground active:bg-destructive/10 active:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </Card>
  )
}
