import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle, Download, UtensilsCrossed, Moon, Clock, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PopoverSelect, type PopoverSelectOption } from '@/components/ui/popover-select'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { cn } from '@/lib/utils'
import { fetchPaie, fetchSalariesAdmin, messageErreur, type PaieSemaine } from '@/lib/pointage-admin'
import { heuresMinutes, jourCourt, jourDe, semainesDuMoisPrecedent } from '@/lib/pointage-heures'
import { nomComplet } from '@/components/pointage/parts'

// Pointage › Paie — port of the WinDev Admin Pointage's FEN_Données_paie
// (plan ~/.claude/plans/admin-pointage.md § 9.7, code read on 2026-09-22).
//
// Every month Leticia takes a salarié over a range of weeks and reads the
// figures payroll needs: the meals (« paniers ») owed and the night hours.
// From the validated weeks only (lst_lissage): a day meal per M / A / E day of
// six hours or more, a night meal per N day of six hours or more, nothing for
// J; night hours are the N days' totals. The range defaults to the ISO weeks of
// the month just ended. Read-only, plus an .xlsx export of the same table.

const QK = ['pointage-admin'] as const
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const JOURS_LONGS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

export function PointagePaie() {
  const aujourdhui = useMemo(() => jourDe(Date.now()), [])
  const defaut = useMemo(() => semainesDuMoisPrecedent(aujourdhui), [aujourdhui])
  const anneeCourante = +aujourdhui.slice(0, 4)
  const [annee, setAnnee] = useState(defaut.annee)
  const [du, setDu] = useState(defaut.du)
  const [au, setAu] = useState(defaut.au)
  const [idSalarie, setIdSalarie] = useState(0)
  const isDesktop = useIsDesktop()

  const { data: salaries } = useQuery({ queryKey: [...QK, 'salaries'], queryFn: fetchSalariesAdmin })
  useEffect(() => {
    if (idSalarie === 0 && salaries?.length) setIdSalarie(salaries.find((s) => !s.supprime)?.id ?? salaries[0].id)
  }, [salaries, idSalarie])

  const salarieOptions = useMemo<PopoverSelectOption[]>(
    () =>
      [...(salaries ?? [])]
        .sort((a, b) => Number(a.supprime) - Number(b.supprime) || nomComplet(a).localeCompare(nomComplet(b), 'fr'))
        .map((s) => ({ id: s.id, primary: nomComplet(s), secondary: s.supprime ? 'ancien' : undefined })),
    [salaries],
  )
  const anneeOptions = useMemo<PopoverSelectOption[]>(
    () => Array.from({ length: anneeCourante - 2015 }, (_, i) => ({ id: anneeCourante - i, primary: String(anneeCourante - i) })),
    [anneeCourante],
  )

  const paie = useQuery({
    queryKey: [...QK, 'paie', idSalarie, annee, du, au],
    queryFn: () => fetchPaie(idSalarie, annee, du, au),
    enabled: idSalarie > 0 && du <= au,
  })
  const data = paie.data
  const nb = data?.nbSemaines ?? 53
  const semaineOptions = useMemo<PopoverSelectOption[]>(() => Array.from({ length: nb }, (_, i) => ({ id: i + 1, primary: `Semaine ${i + 1}` })), [nb])

  const salarie = salaries?.find((s) => s.id === idSalarie) ?? null

  const exporter = useCallback(async () => {
    if (!data || !salarie) return
    const XLSX = await import('xlsx')
    const entete = ['Semaine', 'Du', ...JOURS_LONGS.flatMap((j) => [j, `Type ${j.toLowerCase()}`]), 'Total', 'Heures de nuit', 'Repas jour', 'Repas nuit']
    const lignes = data.semaines.map((s) => [
      s.numero,
      jourCourt(s.lundi),
      ...s.jours.flatMap((j) => [heuresMinutes(j.totalMin), j.type]),
      heuresMinutes(s.totalMin),
      heuresMinutes(s.nuitMin),
      s.paniersJour,
      s.paniersNuit,
    ])
    const totaux = ['Totaux', '', ...JOURS_LONGS.flatMap(() => ['', '']), heuresMinutes(data.totaux.totalMin), heuresMinutes(data.totaux.nuitMin), data.totaux.paniersJour, data.totaux.paniersNuit]
    const ws = XLSX.utils.aoa_to_sheet([[`${nomComplet(salarie)} — ${annee}, semaines ${du} à ${au}`], [], entete, ...lignes, totaux])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Paie')
    XLSX.writeFile(wb, `Paie_${salarie.nom}_${annee}_S${du}-S${au}.xlsx`)
  }, [data, salarie, annee, du, au])

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="flex-shrink-0 flex flex-wrap items-center gap-3">
        <div className="w-64 flex-shrink-0">
          <PopoverSelect options={salarieOptions} value={idSalarie} onChange={setIdSalarie} emptyLabel="Choisir un salarié…" />
        </div>
        <div className="w-28 flex-shrink-0">
          <PopoverSelect options={anneeOptions} value={annee} onChange={setAnnee} hideEmpty />
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs text-muted-foreground">de la</span>
          <div className="w-36"><PopoverSelect options={semaineOptions} value={du} onChange={(v) => { setDu(v); if (v > au) setAu(v) }} hideEmpty /></div>
          <span className="text-xs text-muted-foreground">à la</span>
          <div className="w-36"><PopoverSelect options={semaineOptions} value={au} onChange={(v) => { setAu(v); if (v < du) setDu(v) }} hideEmpty /></div>
        </div>
        <Button variant="outline" size="sm" className="ml-auto flex-shrink-0" onClick={exporter} disabled={!data || data.semaines.length === 0} title="Exporter en Excel">
          <Download className="h-3.5 w-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">Exporter</span>
        </Button>
      </div>

      {data && (
        <div className="flex-shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tuile icon={<UtensilsCrossed className="h-4 w-4" />} label="Repas jour" value={String(data.totaux.paniersJour)} detail="jours M, A ou E de 6 h et plus" />
          <Tuile icon={<Moon className="h-4 w-4" />} label="Repas nuit" value={String(data.totaux.paniersNuit)} detail="jours N de 6 h et plus" />
          <Tuile icon={<Clock className="h-4 w-4" />} label="Heures lissées" value={heuresMinutes(data.totaux.totalMin)} detail={`${data.semaines.length} semaine${data.semaines.length > 1 ? 's' : ''} validée${data.semaines.length > 1 ? 's' : ''}`} />
          <Tuile icon={<Moon className="h-4 w-4" />} label="dont heures de nuit" value={heuresMinutes(data.totaux.nuitMin)} detail="jours de type N" />
        </div>
      )}

      {data && data.manquantes.length > 0 && (
        <div className="flex-shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex items-start gap-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-700" />
          <span>
            Semaine{data.manquantes.length > 1 ? 's' : ''} non validée{data.manquantes.length > 1 ? 's' : ''} dans la plage : {data.manquantes.join(', ')}. Les totaux ne les comptent pas — validez-les dans Semaines.
          </span>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border/60 bg-white shadow-sm overflow-hidden">
        {idSalarie === 0 || paie.isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : paie.isError ? (
          <div className="flex flex-col items-center justify-center h-full text-destructive gap-2">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">{(paie.error as { status?: number })?.status === 403 ? 'Accès restreint : le droit « Consulter le pointage » est nécessaire.' : messageErreur(paie.error)}</p>
          </div>
        ) : data && data.semaines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <UtensilsCrossed className="h-12 w-12 opacity-30" />
            <p className="text-sm">Aucune semaine validée entre les semaines {du} et {au}</p>
          </div>
        ) : data ? (
          isDesktop ? <TablePaie data={data} /> : <CartesPaie semaines={data.semaines} />
        ) : null}
      </div>
    </div>
  )
}

function Tuile({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-white shadow-sm px-4 py-3 flex items-center gap-3">
      <div className="h-9 w-9 flex-shrink-0 rounded-lg bg-gold text-gold-foreground flex items-center justify-center shadow-sm">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xl font-bold tabular-nums leading-tight">{value}</p>
        <p className="text-[11px] text-muted-foreground truncate">{detail}</p>
      </div>
    </div>
  )
}

function TypeChip({ type }: { type: string }) {
  const t = type.toUpperCase()
  const cls = t === 'N' ? 'bg-indigo-500/15 text-indigo-800 border-indigo-500/30' : t === 'M' || t === 'A' || t === 'E' ? 'bg-emerald-500/15 text-emerald-800 border-emerald-500/30' : 'bg-zinc-100 text-zinc-600 border-zinc-300/70'
  return <span className={cn('inline-block rounded border px-1 text-[10px] font-mono leading-4', cls)}>{t || '·'}</span>
}

function TablePaie({ data }: { data: NonNullable<ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchPaie>>>>['data']> }) {
  return (
    <div className="hidden md:flex md:flex-col flex-1 min-h-0">
      <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '9%' }} />
          {JOURS.map((j) => <col key={j} style={{ width: '9%' }} />)}
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '6%' }} />
          <col style={{ width: '6%' }} />
        </colgroup>
        <thead className="bg-zinc-200/60 border-b border-border/60">
          <tr className="text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-2.5 text-left font-semibold">Semaine</th>
            {JOURS.map((j) => <th key={j} className="px-2 py-2.5 text-right font-semibold">{j}</th>)}
            <th className="px-2 py-2.5 text-right font-semibold">Total</th>
            <th className="px-2 py-2.5 text-right font-semibold">Nuit</th>
            <th className="px-2 py-2.5 text-right font-semibold" title="Repas jour">R. jour</th>
            <th className="px-2 py-2.5 text-right font-semibold" title="Repas nuit">R. nuit</th>
          </tr>
        </thead>
      </table>
      <div className="flex-1 min-h-0 overflow-auto scrollbar-transparent">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '9%' }} />
            {JOURS.map((j) => <col key={j} style={{ width: '9%' }} />)}
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '6%' }} />
          </colgroup>
          <tbody>
            {data.semaines.map((s) => (
              <tr key={s.numero} className="border-b border-border/40">
                <td className="px-2 py-2">
                  <div className="font-medium">S{s.numero}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">{jourCourt(s.lundi).slice(-5)}</div>
                </td>
                {s.jours.map((j, i) => (
                  <td key={i} className="px-2 py-2 text-right tabular-nums">
                    <span className={cn(j.totalMin === 0 && 'text-muted-foreground/60')}>{heuresMinutes(j.totalMin)}</span> <TypeChip type={j.type} />
                  </td>
                ))}
                <td className="px-2 py-2 text-right tabular-nums font-medium">{heuresMinutes(s.totalMin)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{s.nuitMin ? heuresMinutes(s.nuitMin) : '—'}</td>
                <td className="px-2 py-2 text-right tabular-nums">{s.paniersJour || '—'}</td>
                <td className="px-2 py-2 text-right tabular-nums">{s.paniersNuit || '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-zinc-100/80 border-t border-border/60 font-semibold">
              <td className="px-2 py-2" colSpan={8}>Totaux</td>
              <td className="px-2 py-2 text-right tabular-nums">{heuresMinutes(data.totaux.totalMin)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{heuresMinutes(data.totaux.nuitMin)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{data.totaux.paniersJour}</td>
              <td className="px-2 py-2 text-right tabular-nums">{data.totaux.paniersNuit}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function CartesPaie({ semaines }: { semaines: PaieSemaine[] }) {
  return (
    <div className="md:hidden flex-1 min-h-0 overflow-y-auto scrollbar-transparent p-2 space-y-2 bg-zinc-100/80">
      {semaines.map((s) => (
        <div key={s.numero} className="rounded-lg border border-border/60 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Semaine {s.numero} <span className="text-xs text-muted-foreground">· {jourCourt(s.lundi)}</span></p>
            <p className="text-sm font-semibold tabular-nums">{heuresMinutes(s.totalMin)}</p>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1 text-center">
            {s.jours.map((j, i) => (
              <div key={i} className="rounded border border-border/40 px-0.5 py-1">
                <div className="text-[9px] uppercase text-muted-foreground">{JOURS[i]}</div>
                <div className={cn('text-[11px] tabular-nums', j.totalMin === 0 && 'text-muted-foreground/60')}>{heuresMinutes(j.totalMin)}</div>
                <TypeChip type={j.type} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Nuit {s.nuitMin ? heuresMinutes(s.nuitMin) : '—'}</span>
            <span>Repas jour {s.paniersJour} · nuit {s.paniersNuit}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
