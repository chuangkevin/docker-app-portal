import React, { useRef, useEffect } from 'react'
import { useTabStore } from '../stores/tabStore'
import type { AppTab } from '../stores/tabStore'
import HomePage from '../pages/HomePage'

// Home icon SVG
const HomeIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)

// Close icon SVG
const CloseIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

interface TabItemProps {
  tab: AppTab
  isActive: boolean
  onActivate: () => void
  onClose?: () => void
}

const TabItem: React.FC<TabItemProps> = ({ tab, isActive, onActivate, onClose }) => {
  return (
    <div
      className={`flex items-center shrink-0 border-b-2 transition-colors ${
        isActive
          ? 'border-blue-500 bg-slate-800'
          : 'border-transparent hover:bg-slate-800/60'
      }`}
    >
      <button
        type="button"
        onClick={onActivate}
        className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
          isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
        }`}
        title={tab.title}
      >
        {tab.type === 'portal' ? (
          <HomeIcon />
        ) : (
          <span
            className="w-4 h-4 rounded text-xs flex items-center justify-center text-white font-bold shrink-0"
            style={{ backgroundColor: '#2563eb', fontSize: '10px' }}
          >
            {tab.title.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="max-w-[100px] md:max-w-[140px] truncate">{tab.title}</span>
      </button>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="pr-2 pl-0.5 py-2.5 text-slate-500 hover:text-white transition-colors"
          aria-label={`關閉 ${tab.title}`}
          title="關閉"
        >
          <CloseIcon />
        </button>
      )}
    </div>
  )
}

const TabLayout: React.FC = () => {
  const { tabs, activeTabId, closeTab, setActiveTab } = useTabStore()
  const topBarRef = useRef<HTMLDivElement>(null)
  const bottomBarRef = useRef<HTMLDivElement>(null)

  // Scroll active tab into view when it changes
  useEffect(() => {
    const scrollActiveIntoView = (ref: React.RefObject<HTMLDivElement>) => {
      if (!ref.current) return
      const activeEl = ref.current.querySelector<HTMLElement>('[data-active="true"]')
      activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
    scrollActiveIntoView(topBarRef)
    scrollActiveIntoView(bottomBarRef)
  }, [activeTabId])

  const renderTabs = () =>
    tabs.map((tab) => (
      <div key={tab.id} data-active={tab.id === activeTabId}>
        <TabItem
          tab={tab}
          isActive={tab.id === activeTabId}
          onActivate={() => setActiveTab(tab.id)}
          onClose={tab.type !== 'portal' ? () => closeTab(tab.id) : undefined}
        />
      </div>
    ))

  const tabBar = (ref: React.RefObject<HTMLDivElement>) => (
    <div ref={ref} className="flex overflow-x-auto scrollbar-hide">
      {renderTabs()}
    </div>
  )

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-900 overflow-hidden">
      {/* Top tab bar — desktop only */}
      <div className="hidden md:block shrink-0 bg-slate-950 border-b border-slate-800">
        {tabBar(topBarRef)}
      </div>

      {/* Content area */}
      <div className="flex-1 relative overflow-hidden">
        {tabs.map((tab) =>
          tab.type === 'portal' ? (
            <div
              key="portal"
              className={`absolute inset-0 overflow-y-auto ${
                activeTabId === 'portal' ? '' : 'hidden'
              }`}
            >
              <HomePage />
            </div>
          ) : (
            <iframe
              key={tab.id}
              src={tab.url}
              title={tab.title}
              className={`absolute inset-0 w-full h-full border-none bg-white ${
                activeTabId === tab.id ? '' : 'hidden'
              }`}
              allow="fullscreen"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
            />
          )
        )}
      </div>

      {/* Bottom tab bar — mobile only */}
      <div className="md:hidden shrink-0 bg-slate-950 border-t border-slate-800 pb-safe">
        {tabBar(bottomBarRef)}
      </div>
    </div>
  )
}

export default TabLayout
