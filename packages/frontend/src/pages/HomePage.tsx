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

const HomePage: React.FC = () => {
  const navigate = useNavigate()
  const currentUser = useAuthStore((state) => state.currentUser)
  const clearAuth = useAuthStore((state) => state.clearAuth)

  const [search, setSearch] = useState('')

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

  // All services sorted alphabetically
  const sortedServices = useMemo(
    () =>
      [...filteredServices].sort((a, b) => {
        const nameA = (a.display_name || a.name).toLowerCase()
        const nameB = (b.display_name || b.name).toLowerCase()
        return nameA.localeCompare(nameB)
      }),
    [filteredServices]
  )

  const hasNothingToShow =
    sortedServices.length === 0 && filteredLinks.length === 0

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
            placeholder="搜尋服務或書籤..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        {servicesLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : hasNothingToShow ? (
          <div className="text-center py-20">
            <p className="text-slate-500 text-lg">
              {search ? '找不到符合條件的服務或書籤' : '目前沒有可顯示的服務'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Pinned Items (Services + Links) */}
            {(pinnedServices.length > 0 || pinnedLinks.length > 0) && (
              <section>
                <h2 className="text-white text-lg font-semibold mb-4 flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="text-yellow-400"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  置頂
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {pinnedServices.map((service: Service) => (
                    <ServiceCard key={`pin-${service.id}`} service={service} />
                  ))}
                  {pinnedLinks.map((link: CustomLink) => (
                    <LinkCard key={`pin-link-${link.id}`} link={link} />
                  ))}
                </div>
              </section>
            )}

            {/* All Services */}
            {sortedServices.length > 0 && (
              <section>
                <h2 className="text-white text-lg font-semibold mb-4 flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-blue-400"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  所有服務
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {sortedServices.map((service: Service) => (
                    <ServiceCard key={`svc-${service.id}`} service={service} />
                  ))}
                </div>
              </section>
            )}

            {/* Bookmarks (non-pinned) */}
            {unpinnedLinks.length > 0 && (
              <section>
                <h2 className="text-white text-lg font-semibold mb-4 flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-green-400"
                  >
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                  我的書籤
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {unpinnedLinks.map((link: CustomLink) => (
                    <LinkCard key={`link-${link.id}`} link={link} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default HomePage
