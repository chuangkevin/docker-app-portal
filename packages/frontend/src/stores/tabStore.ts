import { create } from 'zustand'

export interface AppTab {
  id: string
  type: 'portal' | 'app'
  title: string
  url?: string
}

const PORTAL_TAB: AppTab = {
  id: 'portal',
  type: 'portal',
  title: 'Portal',
}

interface TabStore {
  tabs: AppTab[]
  activeTabId: string
  openApp: (title: string, url: string) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
}

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [PORTAL_TAB],
  activeTabId: 'portal',

  openApp: (title, url) => {
    const { tabs } = get()
    // If already open, just switch to it
    const existing = tabs.find((t) => t.url === url)
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    const id = `tab-${Date.now()}`
    const newTab: AppTab = { id, type: 'app', title, url }
    set({ tabs: [...tabs, newTab], activeTabId: id })
  },

  closeTab: (id) => {
    if (id === 'portal') return
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === id)
    const newTabs = tabs.filter((t) => t.id !== id)
    let newActiveId = activeTabId
    if (activeTabId === id) {
      const newIdx = Math.min(idx, newTabs.length - 1)
      newActiveId = newTabs[newIdx]?.id ?? 'portal'
    }
    set({ tabs: newTabs, activeTabId: newActiveId })
  },

  setActiveTab: (id) => set({ activeTabId: id }),
}))
