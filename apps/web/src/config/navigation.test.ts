import { describe, it, expect } from 'vitest'
import {
  mainNavigation,
  visibleMainNavigation,
  visibleSubmenus,
  canOpenScreen,
  firstVisibleScreenHref,
  menuAccessKey,
  screenHideKey,
  type NavAccess,
} from './navigation'

/** A non-admin viewer holding exactly `keys`. */
function viewer(keys: string[]): NavAccess {
  const set = new Set(keys)
  return {
    isEffectiveAdmin: false,
    has: (k) => set.has(k),
    hasRaw: (k) => set.has(k),
  }
}

/** An effective admin, as GET /permissions-trm/me reports them: the bypass on
 *  `has`, and a raw set that deliberately contains no hide keys. */
function admin(): NavAccess {
  const set = new Set(mainNavigation.map((m) => menuAccessKey(m.href)))
  return {
    isEffectiveAdmin: true,
    has: () => true,
    hasRaw: (k) => set.has(k),
  }
}

const ALL_MENUS = mainNavigation.map((m) => menuAccessKey(m.href))
const ids = (menus: { id: string }[]) => menus.map((m) => m.id)

describe('screen access — menu grants', () => {
  it('is default closed: a user with no keys sees no menu at all', () => {
    expect(visibleMainNavigation(viewer([]))).toEqual([])
  })

  it('granting a menu grants every screen under it', () => {
    const v = viewer([menuAccessKey('/fils')])
    const menus = visibleMainNavigation(v)
    expect(ids(menus)).toEqual(['fils'])
    expect(menus[0].submenus.map((s) => s.href)).toEqual(
      mainNavigation.find((m) => m.id === 'fils')!.submenus.map((s) => s.href),
    )
  })

  it('an ungranted menu is closed even if its screens carry no hide key', () => {
    expect(canOpenScreen('/fils/stock', viewer([]))).toBe(false)
    expect(canOpenScreen('/fils/stock', viewer([menuAccessKey('/fils')]))).toBe(true)
  })
})

describe('screen access — per-screen hides', () => {
  it('hides one screen and leaves the rest of the menu', () => {
    const v = viewer([menuAccessKey('/clients'), screenHideKey('/clients/facturation')])
    const clients = visibleMainNavigation(v).find((m) => m.id === 'clients')!
    expect(clients.submenus.map((s) => s.href)).not.toContain('/clients/facturation')
    expect(clients.submenus.map((s) => s.href)).toContain('/clients/commandes')
    expect(canOpenScreen('/clients/facturation', v)).toBe(false)
    expect(canOpenScreen('/clients/commandes', v)).toBe(true)
  })

  it('drops the menu once every one of its screens is hidden', () => {
    const qualite = mainNavigation.find((m) => m.id === 'qualite')!
    const v = viewer([
      menuAccessKey('/qualite'),
      ...qualite.submenus.map((s) => screenHideKey(s.href)),
    ])
    expect(ids(visibleMainNavigation(v))).toEqual([])
  })

  it('sends the menu index to the first screen the user can still open', () => {
    const v = viewer([menuAccessKey('/clients'), screenHideKey('/clients/commandes')])
    expect(firstVisibleScreenHref('/clients', v)).toBe('/clients/expeditions')
    expect(firstVisibleScreenHref('/clients', viewer([]))).toBeNull()
  })
})

describe('screen access — effective admin', () => {
  it('sees every menu and every screen', () => {
    const a = admin()
    expect(ids(visibleMainNavigation(a))).toEqual(ids(mainNavigation))
    for (const m of mainNavigation) {
      for (const s of m.submenus) expect(canOpenScreen(s.href, a)).toBe(true)
    }
  })

  it('is NOT hidden by hide keys — they must be read without the bypass', () => {
    // The regression this guards: reading a hide key through has(), which
    // returns true for every key when the viewer is an effective admin, would
    // hide the whole app from the admin.
    const a = admin()
    expect(visibleSubmenus(mainNavigation[1].submenus, a).length).toBeGreaterThan(0)
  })
})

describe('screen access — interaction with the action catalog', () => {
  it('honours a submenu permission gate when one is declared', () => {
    // No TRM submenu carries a `permission` yet (the one action key so far,
    // edit_commandes_client, gates buttons inside a screen rather than the
    // screen itself). The filter must still respect one the day it appears.
    const gated = { title: 'Finance', href: '/rapports/finance', permission: 'view_rapport_finance' }
    expect(visibleSubmenus([gated], viewer([]))).toEqual([])
    expect(visibleSubmenus([gated], viewer(['view_rapport_finance']))).toEqual([gated])
  })

  it('leaves non-nav routes alone (dashboard, paramètres, unknown)', () => {
    const v = viewer([])
    expect(canOpenScreen('/', v)).toBe(true)
    expect(canOpenScreen('/settings/utilisateurs', v)).toBe(true)
  })
})

describe('screen access — a shop-floor viewer', () => {
  it('grants only the menus a bonnetier needs', () => {
    const wanted = ['/production', '/atelier', '/qualite'].map(menuAccessKey)
    const v = viewer(ALL_MENUS.filter((k) => wanted.includes(k)))
    expect(ids(visibleMainNavigation(v))).toEqual(['production', 'atelier', 'qualite'])
  })
})
