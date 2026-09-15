// The section band of a card — sand ground, accent uppercase label — the way
// the réglage sheet titles its Repères / Réglages / Fils cards. Shared so
// every sectioned card of this app wears the same head.
export function Entete({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-2 bg-sand border-b border-border">
      <span className="text-xs font-semibold uppercase tracking-wide text-accent">{children}</span>
    </div>
  )
}
