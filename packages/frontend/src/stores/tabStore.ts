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

const SESSION_KEY = 'portal:tab'

const saveTabSession = (url: string, title: string) => {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ url, title })) } catch {}
}

const clearTabSession = () => {
  try { sessionStorage.removeItem(SESSION_KEY) } catch {}
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
      window.location.hash = `app=${encodeURIComponent(url)}&title=${encodeURIComponent(existing.title)}`
      saveTabSession(url, existing.title)
      set({ activeTabId: existing.id })
      return
    }
    const id = `tab-${Date.now()}`
    const newTab: AppTab = { id, type: 'app', title, url }
    window.location.hash = `app=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`
    saveTabSession(url, title)
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
    const newActiveTab = newTabs.find((t) => t.id === newActiveId)
    if (newActiveTab?.type === 'app' && newActiveTab.url) {
      window.location.hash = `app=${encodeURIComponent(newActiveTab.url)}&title=${encodeURIComponent(newActiveTab.title)}`
      saveTabSession(newActiveTab.url, newActiveTab.title)
    } else {
      window.location.hash = ''
      clearTabSession()
    }
    set({ tabs: newTabs, activeTabId: newActiveId })
  },

  setActiveTab: (id) => {
    const { tabs } = get()
    const tab = tabs.find((t) => t.id === id)
    if (tab?.type === 'app' && tab.url) {
      window.location.hash = `app=${encodeURIComponent(tab.url)}&title=${encodeURIComponent(tab.title)}`
      saveTabSession(tab.url, tab.title)
    } else {
      window.location.hash = ''
      clearTabSession()
    }
    set({ activeTabId: id })
  },
}))
