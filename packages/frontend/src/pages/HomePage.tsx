import React, { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { getServices } from '../api/services'
import { getPages } from '../api/pages'
import ServiceCard from '../components/ServiceCard'
import type { Service } from '../api/services'
import type { Page } from '../api/pages'

const TAB_ALL = '__all__'
const TAB_UNCATEGORIZED = '__uncategorized__'

const HomePage: React.FC = () => {
  const navigate = useNavigate()
  const currentUser = useAuthStore((state) => state.currentUser)
  const clearAuth = useAuthStore((state) => state.clearAuth)

  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState(TAB_ALL)

  const { data: services, isLoading: servicesLoading } = useQuery({
    queryKey: ['services'],
    queryFn: getServices,
  })

  const { data: pages, isLoading: pagesLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: getPages,
  })

  const handleSwitchUser = () => {
    clearAuth()
    navigate('/select')
  }

  // Build set of service IDs that belong to at least one page
  const categorizedServiceIds = useMemo(() => {
    const ids = new Set<number>()
    pages?.forEach((page: Page) => {
      page.services?.forEach((s: Service) => ids.add(s.id))
    })
    return ids
  }, [pages])

  // Filter services by search
  const filteredServices = useMemo(() => {
    if (!services) return []
    const term = search.toLowerCase().trim()
    if (!term) return services
    return services.filter(
      (s: Service) =>
        s.name.toLowerCase().includes(term) ||
        (s.description && s.description.toLowerCase().includes(term)) ||
        (s.custom_description &&
          s.custom_description.toLowerCase().includes(term)) ||
        (s.ai_description && s.ai_description.toLowerCase().includes(term))
    )
  }, [services, search])

  // Get visible services for the active tab
  const visibleServices = useMemo(() => {
    if (activeTab === TAB_ALL) return filteredServices
    if (activeTab === TAB_UNCATEGORIZED) {
      return filteredServices.filter(
        (s: Service) => !categorizedServiceIds.has(s.id)
      )
    }
    const pageId = Number(activeTab)
    const page = pages?.find((p: Page) => p.id === pageId)
    if (!page) return []
    const pageServiceIds = new Set(
      page.services?.map((s: Service) => s.id) || []
    )
    return filteredServices.filter((s: Service) => pageServiceIds.has(s.id))
  }, [activeTab, filteredServices, pages, categorizedServiceIds])

  const isLoading = servicesLoading || pagesLoading

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
        <div className="mb-6">
          <input
            type="text"
            placeholder="搜尋服務名稱或描述..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-2">
          <TabButton
            active={activeTab === TAB_ALL}
            onClick={() => setActiveTab(TAB_ALL)}
          >
            全部
          </TabButton>
          {pages?.map((page: Page) => (
            <TabButton
              key={page.id}
              active={activeTab === String(page.id)}
              onClick={() => setActiveTab(String(page.id))}
            >
              {page.name}
            </TabButton>
          ))}
          <TabButton
            active={activeTab === TAB_UNCATEGORIZED}
            onClick={() => setActiveTab(TAB_UNCATEGORIZED)}
          >
            未分類
          </TabButton>
        </div>

        {/* Service Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : visibleServices.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-500 text-lg">
              {search ? '找不到符合條件的服務' : '目前沒有可顯示的服務'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleServices.map((service: Service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

export default HomePage
