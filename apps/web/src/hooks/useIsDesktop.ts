import { useState, useEffect } from 'react'

/** Tailwind's `md` breakpoint, in px. Keep in sync with tailwind.config.js. */
const MD_BREAKPOINT = 768

/**
 * True when the viewport is at or above Tailwind's `md` breakpoint.
 *
 * Why this exists: the table-centric screens (§27) render their rows TWICE —
 * a `hidden md:flex` desktop table and a `md:hidden` mobile card list — and
 * hide one with CSS. That is free on a 30-row list and expensive on a real
 * one: Tombé Métier › Stock holds ~1 000 pieces, so the browser was building,
 * styling and laying out ~2 000 row subtrees (40 000 elements, ~300 ms of
 * layout) to show 1 000 of them. Gating the two branches on this hook mounts
 * only the one the viewer can actually see.
 *
 * The initial value is read synchronously so the first paint already picks the
 * right branch — a `useEffect`-only default would mount the wrong list once and
 * pay the cost anyway.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia(`(min-width: ${MD_BREAKPOINT}px)`).matches
  })

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MD_BREAKPOINT}px)`)
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return isDesktop
}
