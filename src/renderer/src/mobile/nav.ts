import { create } from 'zustand'
import type { UtilityView } from '@/store/useStore'

// Phone navigation: a bottom tab bar, each tab with its own stack of full-screen pages
// (Notion's mobile model). Only the top page of the active tab is rendered.

export type Tab = 'home' | 'today' | 'calendar' | 'search'

export type Route =
  | { name: 'tab' }
  | { name: 'desk'; id: string }
  | { name: 'memo'; id: string; workspaceId: string | null }
  | { name: 'utility'; view: UtilityView }

interface NavState {
  tab: Tab
  stacks: Record<Tab, Route[]>
  setTab: (tab: Tab) => void
  push: (route: Route) => void
  /** Replace the top page (e.g. a new memo opened from a list that should not stay behind it). */
  replace: (route: Route) => void
  /** Back one page; false when already at the tab's root. */
  pop: () => boolean
}

const ROOT: Route[] = [{ name: 'tab' }]

const sameRoute = (a: Route, b: Route): boolean => JSON.stringify(a) === JSON.stringify(b)

export const useNav = create<NavState>((set, get) => ({
  tab: 'home',
  stacks: { home: ROOT, today: ROOT, calendar: ROOT, search: ROOT },
  // Tapping the active tab again returns to its root, as on every phone app.
  setTab: (tab) =>
    set((s) => (s.tab === tab ? { stacks: { ...s.stacks, [tab]: ROOT } } : { tab })),
  push: (route) =>
    set((s) => {
      const stack = s.stacks[s.tab]
      if (sameRoute(stack[stack.length - 1], route)) return s
      return { stacks: { ...s.stacks, [s.tab]: [...stack, route] } }
    }),
  replace: (route) =>
    set((s) => {
      const stack = s.stacks[s.tab]
      return { stacks: { ...s.stacks, [s.tab]: [...stack.slice(0, -1), route] } }
    }),
  pop: () => {
    const { tab, stacks } = get()
    if (stacks[tab].length <= 1) return false
    set({ stacks: { ...stacks, [tab]: stacks[tab].slice(0, -1) } })
    return true
  }
}))

export const currentRoute = (s: NavState): Route => s.stacks[s.tab][s.stacks[s.tab].length - 1]
