import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { fmtDateHeure, fmtKg, type LignePiece } from '@/lib/trs-equipe'
import { cn } from '@/lib/utils'

// The piece lists behind the KPI tiles — the legacy `TABLE_Visitage` /
// `TABLE_Defaut` / `TABLE_Restant` (and the Production list the legacy never
// had). A §27.3 split header / body table on desktop, a card list below
// `md`; one row selected at a time, its events shown beside the table.

export type ColonneKey = 'machine' | 'numero' | 'poids' | 'reference' | 'finMs' | 'visiteeMs'

export interface ColonnePiece {
  key: ColonneKey
  label: string
  width: string
  align?: 'left' | 'right'
}

type Dir = 'asc' | 'desc'

function cellule(r: LignePiece, key: ColonneKey): string {
  switch (key) {
    case 'machine': return r.machine || '—'
    case 'numero': return r.numero
    case 'poids': return fmtKg(r.poids)
    case 'reference': return r.reference || '—'
    case 'finMs': return fmtDateHeure(r.finMs)
    case 'visiteeMs': return r.visiteeMs === null ? '' : fmtDateHeure(r.visiteeMs)
  }
}

function valeurTri(r: LignePiece, key: ColonneKey): string | number {
  switch (key) {
    case 'poids': return r.poids
    case 'finMs': return r.finMs ?? 0
    case 'visiteeMs': return r.visiteeMs ?? 0
    default: return String(r[key] ?? '').toLowerCase()
  }
}

export function PiecesTable({
  rows,
  colonnes,
  selectedCle,
  onSelect,
  emptyLabel,
}: {
  rows: LignePiece[]
  colonnes: ColonnePiece[]
  selectedCle: string | null
  onSelect: (cle: string) => void
  emptyLabel: string
}) {
  const [sort, setSort] = useState<{ key: ColonneKey; dir: Dir } | null>(null)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const s = [...rows].sort((a, b) => {
      const va = valeurTri(a, sort.key)
      const vb = valeurTri(b, sort.key)
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr')
      return sort.dir === 'asc' ? c : -c
    })
    return s
  }, [rows, sort])

  const onSort = (key: ColonneKey) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground italic text-center py-8">{emptyLabel}</p>
  }

  const colgroup = (
    <colgroup>
      {colonnes.map((c) => (
        <col key={c.key} style={{ width: c.width }} />
      ))}
    </colgroup>
  )

  return (
    <>
      {/* Desktop — split header / body (§27.3) */}
      <div className="hidden md:flex flex-1 min-h-0 flex-col rounded-lg border border-border/60 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          {colgroup}
          <thead className="bg-zinc-200/60 border-b border-border/60">
            <tr className="text-xs uppercase tracking-wide text-muted-foreground">
              {colonnes.map((c) => {
                const active = sort?.key === c.key
                return (
                  <th
                    key={c.key}
                    onClick={() => onSort(c.key)}
                    className={cn(
                      'px-2 py-2.5 font-semibold cursor-pointer select-none whitespace-nowrap',
                      c.align === 'right' ? 'text-right' : 'text-left',
                      active && 'text-accent',
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {active && (sort!.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
        </table>
        <div className="flex-1 min-h-0 overflow-auto scrollbar-transparent">
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
            {colgroup}
            <tbody>
              {sorted.map((r) => {
                const selected = r.cle === selectedCle
                return (
                  <tr
                    key={r.cle}
                    data-stock-row
                    onClick={() => onSelect(r.cle)}
                    className={cn(
                      'border-b border-border/40 cursor-pointer transition-colors',
                      selected ? 'bg-accent/10' : 'hover:bg-accent/5',
                    )}
                  >
                    {colonnes.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          'px-2 py-1.5 truncate',
                          c.align === 'right' ? 'text-right' : 'text-left',
                          (c.key === 'poids' || c.key === 'finMs' || c.key === 'visiteeMs') && 'tabular-nums',
                        )}
                        title={cellule(r, c.key)}
                      >
                        {c.key === 'numero' && r.secondChoix ? (
                          <span className="inline-flex items-center gap-1.5">
                            {r.numero}
                            <Badge variant="outline" className="text-[10px] px-1 py-0 bg-red-500/10 text-red-800 border-red-500/30">
                              2ᵉ choix
                            </Badge>
                          </span>
                        ) : (
                          cellule(r, c.key) || <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Phone — card list (§40.2) */}
      <div className="md:hidden flex-1 min-h-0 overflow-y-auto space-y-2 scrollbar-transparent">
        {sorted.map((r) => {
          const selected = r.cle === selectedCle
          return (
            <div
              key={r.cle}
              data-stock-row
              onClick={() => onSelect(r.cle)}
              className={cn(
                'rounded-lg border bg-card p-2.5 shadow-sm cursor-pointer',
                selected ? 'border-gold ring-1 ring-gold' : 'border-border/60',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold tabular-nums">
                  {r.numero}
                  {r.secondChoix && <span className="ml-1.5 text-xs font-medium text-red-700">2ᵉ choix</span>}
                </p>
                <p className="text-sm tabular-nums">{fmtKg(r.poids)}</p>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {r.machine || '—'} · {r.reference || '—'}
                {r.finMs !== null && ` · fin ${fmtDateHeure(r.finMs)}`}
                {r.visiteeMs !== null && ` · visitée ${fmtDateHeure(r.visiteeMs)}`}
              </p>
            </div>
          )
        })}
      </div>
    </>
  )
}
