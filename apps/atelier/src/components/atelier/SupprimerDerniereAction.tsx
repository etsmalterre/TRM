// « Supprimer ma dernière action » on the poste footer (Vincent 2026-11-10).
// Shown only when the server says this person may (`annulable_par`): his own
// last action on this métier, a Défaut or a Nettoyage of the piece on the
// machine, once — never « the last, then the new last ». The rule and its
// reasons: API lib/annulation-atelier.ts. A deletion cannot be undone, so it
// asks first, like the legacy (« Voulez-vous vraiment supprimer votre
// dernière action ? »).
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Trash2 } from 'lucide-react'
import { ConfirmSheet } from '@/components/atelier/ConfirmSheet'
import { supprimerDerniereAction, type DerniereAction } from '@/lib/atelier-api'
import type { ApiError } from '@/lib/api'
import { messagePourErreur } from '@/lib/erreurs'

export function SupprimerDerniereAction({
  ofId,
  action,
  moi,
  onErreur,
}: {
  ofId: number
  action: DerniereAction
  moi: number
  onErreur: (message: string | null) => void
}) {
  const qc = useQueryClient()
  const [confirmer, setConfirmer] = useState(false)
  const supprimer = useMutation({
    mutationFn: () => supprimerDerniereAction(ofId, moi),
    onSuccess: () => {
      onErreur(null)
      qc.invalidateQueries({ queryKey: ['atelier', 'of', ofId] })
      qc.invalidateQueries({ queryKey: ['atelier', 'machines'] })
    },
    onError: (e) => {
      const err = e as ApiError
      onErreur(err.detail && err.code !== 'appareil_non_enrole' ? err.detail : messagePourErreur(err))
    },
  })

  if (action.annulable_par !== moi) return null
  const quoi = action.evenement === 'Défaut' ? `le défaut « ${action.detail || 'Défaut'} »` : 'le nettoyage'
  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmer(true)}
        disabled={supprimer.isPending}
        title="Supprimer ma dernière action"
        aria-label="Supprimer ma dernière action"
        className="flex-shrink-0 h-11 w-11 rounded-full border border-white/25 flex items-center justify-center text-white active:bg-white/10 disabled:opacity-50"
      >
        {supprimer.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
      </button>
      {confirmer && (
        <ConfirmSheet
          titre="Supprimer votre dernière action ?"
          detail={`Vous allez supprimer ${quoi}. Une seule fois : l'action d'avant ne pourra pas l'être.`}
          oui="Oui, supprimer"
          icone={<Trash2 className="h-5 w-5" />}
          variante="destructive"
          onCancel={() => setConfirmer(false)}
          onConfirm={() => {
            setConfirmer(false)
            supprimer.mutate()
          }}
        />
      )}
    </>
  )
}
