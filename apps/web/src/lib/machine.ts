/** The label the atelier uses for a métier: its floor position
 *  (`emplacement`, "1G"), never its `nom` — two names are brands, not
 *  positions ("Beck" = 1G, "Orizio" = 1H; LIVA #1102). `nom` is the fallback
 *  for the archived machines whose `emplacement` is empty. Mirror of the MPS
 *  API's `machineLabel()` in `lib/production-trm.ts`, which labels the OF list
 *  and fiche; the web only needs it where it labels machines itself (the
 *  pickers over `/of-trm/lookups/machines`). Atelier › Maintenance keeps `nom`. */
export function machineLabel(m: { nom: string; emplacement: string }): string {
  return m.emplacement || m.nom
}
