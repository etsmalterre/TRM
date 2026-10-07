// Fournitures (LIVA #1263) — picking a constructeur: one chip per known
// constructeur (the accepted ones first, marked), and « + Nouveau » to type a
// new one, created by the API on save. Single choice (montage, stock entry)
// or multiple (the constructeurs accepted for a reference).

import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ChoixConstructeur, Constructeur } from '@/lib/fournitures'
import { cn } from '@/lib/utils'

const inputClass =
  'w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring'

export function ConstructeurChip({
  label,
  active,
  hint,
  disabled,
  title,
  onClick,
}: {
  label: string
  active: boolean
  /** Small grey word after the label when not active (« acceptée »). */
  hint?: string
  disabled?: boolean
  title?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 h-8 px-3 rounded-md border text-sm transition-colors disabled:cursor-default',
        active
          ? 'border-accent ring-1 ring-accent bg-accent/10 font-medium'
          : 'border-border bg-background hover:border-accent/50',
        disabled && !active && 'opacity-50',
      )}
    >
      {active && <Check className="h-3.5 w-3.5 text-accent" />}
      {label}
      {hint && !active && <span className="text-[10px] text-muted-foreground">· {hint}</span>}
    </button>
  )
}

/** Single choice. `value` null = none chosen; `{ nom }` = a new one being typed. */
export function ConstructeurPicker({
  constructeurs,
  acceptes = [],
  value,
  onChange,
  allowNone,
  noneLabel = 'Non précisé',
}: {
  constructeurs: Constructeur[]
  /** Ids shown first and marked « acceptée ». */
  acceptes?: number[]
  value: ChoixConstructeur | null
  onChange: (v: ChoixConstructeur | null) => void
  /** Offer an explicit « Non précisé » chip (stock entries, counts). */
  allowNone?: boolean
  noneLabel?: string
}) {
  const accepte = new Set(acceptes)
  const ordonnes = [...constructeurs].sort(
    (a, b) => Number(accepte.has(b.id)) - Number(accepte.has(a.id)) || a.nom.localeCompare(b.nom, 'fr'),
  )
  const nouveau = value !== null && 'nom' in value
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {allowNone && <ConstructeurChip label={noneLabel} active={value === null} onClick={() => onChange(null)} />}
        {ordonnes.map((c) => (
          <ConstructeurChip
            key={c.id}
            label={c.nom}
            active={value !== null && 'id' in value && value.id === c.id}
            hint={accepte.has(c.id) ? 'acceptée' : undefined}
            onClick={() => onChange({ id: c.id })}
          />
        ))}
        <ConstructeurChip label="+ Nouveau" active={nouveau} onClick={() => onChange({ nom: '' })} />
      </div>
      {nouveau && (
        <input
          type="text"
          autoFocus
          value={value.nom}
          onChange={(e) => onChange({ nom: e.target.value })}
          placeholder="Nom du constructeur"
          maxLength={100}
          className={inputClass}
        />
      )}
    </div>
  )
}

/** A complete choice (a new name must not be blank), normalised for the API. */
export function choixValide(v: ChoixConstructeur | null): ChoixConstructeur | null {
  if (v === null) return null
  if ('id' in v) return v
  const nom = v.nom.trim()
  return nom ? { nom } : null
}

/** Multiple choice — the constructeurs accepted for a reference. Ids whose
 *  chip is `locked` stay ticked (mounted on a métier). */
export function ConstructeursAcceptes({
  constructeurs,
  ids,
  nouveaux,
  locked = [],
  onChange,
}: {
  constructeurs: Constructeur[]
  ids: number[]
  nouveaux: string[]
  locked?: number[]
  onChange: (ids: number[], nouveaux: string[]) => void
}) {
  const [saisie, setSaisie] = useState('')
  const set = new Set(ids)
  const bloques = new Set(locked)
  const ajouter = () => {
    const nom = saisie.trim()
    if (!nom) return
    const existant = constructeurs.find((c) => c.nom.toLowerCase() === nom.toLowerCase())
    if (existant) onChange([...new Set([...ids, existant.id])], nouveaux)
    else if (!nouveaux.some((n) => n.toLowerCase() === nom.toLowerCase())) onChange(ids, [...nouveaux, nom])
    setSaisie('')
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {constructeurs.map((c) => (
          <ConstructeurChip
            key={c.id}
            label={c.nom}
            active={set.has(c.id) || bloques.has(c.id)}
            disabled={bloques.has(c.id)}
            title={bloques.has(c.id) ? 'Monté sur un métier : reste accepté' : undefined}
            onClick={() => onChange(set.has(c.id) ? ids.filter((i) => i !== c.id) : [...ids, c.id], nouveaux)}
          />
        ))}
        {nouveaux.map((nom) => (
          <ConstructeurChip
            key={`n-${nom}`}
            label={nom}
            active
            title="Nouveau — cliquer pour retirer"
            onClick={() => onChange(ids, nouveaux.filter((n) => n !== nom))}
          />
        ))}
        {constructeurs.length === 0 && nouveaux.length === 0 && (
          <span className="text-sm text-muted-foreground italic">Aucun constructeur pour l&apos;instant.</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ajouter()
            }
          }}
          placeholder="Nouveau constructeur"
          maxLength={100}
          className={inputClass}
        />
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={ajouter} disabled={!saisie.trim()}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Ajouter
        </Button>
      </div>
    </div>
  )
}
