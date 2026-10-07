// « Effectué ce jour » — the confirmation, with what was done (the régleurs,
// 2026-10-07: « changement aiguilles — 12 cassées sur la chute 3 »). The
// comment is optional and becomes the item's comment on the fiche: the one
// shown there is always the latest intervention's. Every confirmation adds an
// entry to the item's history (HistoriqueDialog).

import { useEffect, useState } from 'react'
import { AlertCircle, CalendarCheck, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function FaitDialog({
  open,
  description,
  isPending,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean
  description: string
  isPending: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (commentaire: string | null) => void
}) {
  const [commentaire, setCommentaire] = useState('')
  useEffect(() => {
    if (open) setCommentaire('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isPending && onCancel()}>
      <DialogContent className="max-w-md" onClose={onCancel}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-accent" />
            Entretien effectué
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">{description}</p>
          <div className="space-y-1">
            <label htmlFor="fait-commentaire" className="text-[11px] font-medium text-muted-foreground">
              Commentaire (facultatif)
            </label>
            <textarea
              id="fait-commentaire"
              rows={3}
              autoFocus
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Ce qui a été fait, ce qui a été constaté…"
              className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Annuler
          </Button>
          <Button onClick={() => onConfirm(commentaire.trim() || null)} disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <CalendarCheck className="h-3.5 w-3.5 mr-1.5" />
            )}
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
