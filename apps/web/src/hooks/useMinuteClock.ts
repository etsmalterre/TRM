import { useEffect, useState } from 'react'

/** A clock that ticks once a minute, so time-derived rendering advances on
 *  its own between two fetches — a waiting piece crosses 2 h and its row
 *  turns amber, the « maintenant » line of a timeline moves — without anyone
 *  touching the page. One interval per consumer.
 *
 *  Lifted out of PiecesAVisiterWidget for Production › TRS. */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}
