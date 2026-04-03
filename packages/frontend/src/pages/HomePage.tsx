import React, { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { getServices } from '../api/services'
import { getLinks } from '../api/links'
import ServiceCard from '../components/ServiceCard'
import LinkCard from '../components/LinkCard'
import type { Service } from '../api/services'
import type { CustomLink } from '../api/links'

type HomeTab = 'pinned' | 'services' | 'bookmarks'

const HomePage: React.FC = () => {
  const navigate = useNavigate()
  const currentUser = useAuthStore((state) => state.currentUser)
  const clearAuth = useAuthStore((state) => state.clearAuth)

  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<HomeTab>('pinned')

  const { data: services, isLoading: servicesLoading } = useQuery({
    queryKey: ['services'],
    queryFn: getServices,
  })

  const { data: links } = useQuery({
    queryKey: ['links'],
    queryFn: getLinks,
  })

  const handleSwitchUser = () => {
    clearAuth()
    navigate('/select')
  }

  // Filter services by search
  const filteredServices = useMemo(() => {
    if (!services) return []
    const term = search.toLowerCase().trim()
    if (!term) return services
    return services.filter(
      (s: Service) =>
        s.name.toLowerCase().includes(term) ||
        (s.display_name && s.display_name.toLowerCase().includes(term)) ||
        (s.description && s.description.toLowerCase().includes(term)) ||
        (s.custom_description &&
          s.custom_description.toLowerCase().includes(term)) ||
        (s.ai_description && s.ai_description.toLowerCase().includes(term)) ||
        (s.domain && s.domain.toLowerCase().includes(term))
    )
  }, [services, search])

  // Filter links by search
  const filteredLinks = useMemo(() => {
    if (!links) return []
    const term = search.toLowerCase().trim()
    if (!term) return links
    return links.filter(
      (l: CustomLink) =>
        l.name.toLowerCase().includes(term) ||
        (l.description && l.description.toLowerCase().includes(term)) ||
        l.url.toLowerCase().includes(term)
    )
  }, [links, search])

  // Pinned services
  const pinnedServices = useMemo(
    () => filteredServices.filter((s) => s.is_pinned),
    [filteredServices]
  )

  // Pinned links
  const pinnedLinks = useMemo(
    () => filteredLinks.filter((l) => l.is_pinned),
    [filteredLinks]
  )

  // Non-pinned links
  const unpinnedLinks = useMemo(
    () => filteredLinks.filter((l) => !l.is_pinned),
    [filteredLinks]
  )

  // All services sorted: online first, then alphabetical
  const sortedServices = useMemo(
    () =>
      [...filteredServices].sort((a, b) => {
        // online first
        if (a.status !== b.status) {
          return a.status === 'online' ? -1 : 1
        }
        const nameA = (a.display_name || a.name).toLowerCase()
        const nameB = (b.display_name || b.name).toLowerCase()
        return nameA.localeCompare(nameB)
      }),
    [filteredServices]
  )

  const pinnedCount = pinnedServices.length + pinnedLinks.length
  const bookmarkCount = unpinnedLinks.length

  const tabs: { key: HomeTab; label: string; count: number }[] = [
    { key: 'pinned', label: '置頂', count: pinnedCount },
    { key: 'services', label: '所有服務', count: sortedServices.length },
    { key: 'bookmarks', label: '我的書籤', count: bookmarkCount },
  ]

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-white text-xl font-bold">Docker App Portal</h1>

          <div className="flex items-center gap-3">
            {currentUser && (
              <span className="text-slate-400 text-sm hidden sm:inline">
                {currentUser.username}
              </span>
            )}

            <Link
              to="/settings"
              className="px-3 py-1.5 rounded-lg text-sm border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition"
            >
              個人設定
            </Link>

            {currentUser?.role === 'admin' && (
              <Link
                to="/admin"
                className="px-3 py-1.5 rounded-lg text-sm border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition"
              >
                管理設定
              </Link>
            )}

            <button
              type="button"
              onClick={handleSwitchUser}
              className="px-3 py-1.5 rounded-lg text-sm border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition"
            >
              切換使用者
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="搜尋服務或書籤..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition flex items-center gap-2 ${
                activeTab === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {tab.label}
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-700 text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {servicesLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Pinned Tab */}
            {activeTab === 'pinned' && (
              pinnedCount > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {pinnedServices.map((service: Service) => (
                    <ServiceCard key={`pin-${service.id}`} service={service} />
                  ))}
                  {pinnedLinks.map((link: CustomLink) => (
                    <LinkCard key={`pin-link-${link.id}`} link={link} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <p className="text-slate-500 text-lg">
                    {search ? '找不到符合條件的置頂項目' : '尚無置頂項目，點擊服務卡片上的星號來置頂'}
                  </p>
                </div>
              )
            )}

            {/* Services Tab */}
            {activeTab === 'services' && (
              sortedServices.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {sortedServices.map((service: Service) => (
                    <ServiceCard key={`svc-${service.id}`} service={service} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <p className="text-slate-500 text-lg">
                    {search ? '找不到符合條件的服務' : '目前沒有可顯示的服務'}
                  </p>
                </div>
              )
            )}

            {/* Bookmarks Tab */}
            {activeTab === 'bookmarks' && (
              unpinnedLinks.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {unpinnedLinks.map((link: CustomLink) => (
                    <LinkCard key={`link-${link.id}`} link={link} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <p className="text-slate-500 text-lg">
                    {search ? '找不到符合條件的書籤' : '尚無書籤，到個人設定頁新增'}
                  </p>
                </div>
              )
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default HomePage
