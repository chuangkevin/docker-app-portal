import React, { useState, useMemo, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { useAuthStore } from '../stores/authStore'
import { getServices } from '../api/services'
import { getPages, updatePageOrder } from '../api/pages'
import { getLinks } from '../api/links'
import ServiceCard from '../components/ServiceCard'
import SortableServiceCard from '../components/SortableServiceCard'
import LinkCard from '../components/LinkCard'
import type { Service } from '../api/services'
import type { CustomLink } from '../api/links'
import type { Page } from '../api/pages'

const TAB_ALL = '__all__'
const TAB_UNCATEGORIZED = '__uncategorized__'

const HomePage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.currentUser)
  const clearAuth = useAuthStore((state) => state.clearAuth)

  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState(TAB_ALL)
  const [isEditing, setIsEditing] = useState(false)
  // Local order overrides per page: pageId -> serviceId[]
  const [localOrders, setLocalOrders] = useState<Record<number, number[]>>({})
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  const { data: services, isLoading: servicesLoading } = useQuery({
    queryKey: ['services'],
    queryFn: getServices,
  })

  const { data: pages, isLoading: pagesLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: getPages,
  })

  const { data: links } = useQuery({
    queryKey: ['links'],
    queryFn: getLinks,
  })

  // Filter links by search
  const filteredLinks = useMemo(() => {
    if (!links) return []
    // Only show links on "全部" or "未分類" tabs
    if (activeTab !== TAB_ALL && activeTab !== TAB_UNCATEGORIZED) return []
    const term = search.toLowerCase().trim()
    if (!term) return links
    return links.filter(
      (l: CustomLink) =>
        l.name.toLowerCase().includes(term) ||
        (l.description && l.description.toLowerCase().includes(term)) ||
        l.url.toLowerCase().includes(term)
    )
  }, [links, search, activeTab])

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

  // Get the ordered services for a specific page tab, respecting local reorder
  const getPageServices = useCallback(
    (pageId: number): Service[] => {
      const page = pages?.find((p: Page) => p.id === pageId)
      if (!page || !page.services) return []

      const localOrder = localOrders[pageId]
      if (localOrder) {
        // Use local order: map IDs to services, filter by search
        const serviceMap = new Map(
          filteredServices.map((s: Service) => [s.id, s])
        )
        return localOrder
          .map((id) => serviceMap.get(id))
          .filter((s): s is Service => s !== undefined)
      }

      // Default: use page.services order, filtered by search
      const filteredIds = new Set(filteredServices.map((s: Service) => s.id))
      return page.services.filter((s: Service) => filteredIds.has(s.id))
    },
    [pages, filteredServices, localOrders]
  )

  // Get visible services for the active tab
  const visibleServices = useMemo(() => {
    if (activeTab === TAB_ALL) return filteredServices
    if (activeTab === TAB_UNCATEGORIZED) {
      return filteredServices.filter(
        (s: Service) => !categorizedServiceIds.has(s.id)
      )
    }
    const pageId = Number(activeTab)
    return getPageServices(pageId)
  }, [activeTab, filteredServices, categorizedServiceIds, getPageServices])

  const isPageTab =
    activeTab !== TAB_ALL && activeTab !== TAB_UNCATEGORIZED

  const currentPageId = isPageTab ? Number(activeTab) : null

  const debouncedSave = useCallback(
    (pageId: number, serviceIds: number[]) => {
      if (debounceTimers.current[pageId]) {
        clearTimeout(debounceTimers.current[pageId])
      }
      debounceTimers.current[pageId] = setTimeout(async () => {
        try {
          await updatePageOrder(pageId, serviceIds)
          queryClient.invalidateQueries({ queryKey: ['pages'] })
        } catch (err) {
          console.error('Failed to save order:', err)
        }
      }, 300)
    },
    [queryClient]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!currentPageId) return
      const { active, over } = event
      if (!over || active.id === over.id) return

      const currentServices = getPageServices(currentPageId)
      const oldIndex = currentServices.findIndex(
        (s) => s.id === Number(active.id)
      )
      const newIndex = currentServices.findIndex(
        (s) => s.id === Number(over.id)
      )
      if (oldIndex === -1 || newIndex === -1) return

      const newOrder = arrayMove(currentServices, oldIndex, newIndex)
      const newIds = newOrder.map((s) => s.id)

      setLocalOrders((prev) => ({ ...prev, [currentPageId]: newIds }))
      debouncedSave(currentPageId, newIds)
    },
    [currentPageId, getPageServices, debouncedSave]
  )

  const handleToggleEdit = () => {
    if (isEditing) {
      // Exiting edit mode: clear local orders
      setLocalOrders({})
    }
    setIsEditing(!isEditing)
  }

  const isLoading = servicesLoading || pagesLoading

  // Can only edit when viewing a specific page tab (not "all" or "uncategorized")
  const canEdit = isPageTab && !isLoading && visibleServices.length > 0

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

            {canEdit && (
              <button
                type="button"
                onClick={handleToggleEdit}
                title={isEditing ? '完成編輯' : '編輯排版'}
                className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                  isEditing
                    ? 'border-green-500 text-green-400 hover:text-green-300 hover:border-green-400 bg-green-500/10'
                    : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                }`}
              >
                {isEditing ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="inline-block"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="inline-block"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                )}
              </button>
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

        {/* Edit mode banner */}
        {isEditing && (
          <div className="mb-4 px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-300 text-sm">
            編輯模式：拖拉卡片以重新排序，完成後點擊右上角勾勾按鈕。
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-2">
          <TabButton
            active={activeTab === TAB_ALL}
            onClick={() => {
              setActiveTab(TAB_ALL)
              setIsEditing(false)
            }}
          >
            全部
          </TabButton>
          {pages?.map((page: Page) => (
            <TabButton
              key={page.id}
              active={activeTab === String(page.id)}
              onClick={() => {
                setActiveTab(String(page.id))
                if (!isPageTab) setIsEditing(false)
              }}
            >
              {page.name}
            </TabButton>
          ))}
          <TabButton
            active={activeTab === TAB_UNCATEGORIZED}
            onClick={() => {
              setActiveTab(TAB_UNCATEGORIZED)
              setIsEditing(false)
            }}
          >
            未分類
          </TabButton>
        </div>

        {/* Service Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : visibleServices.length === 0 && filteredLinks.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-500 text-lg">
              {search ? '找不到符合條件的服務' : '目前沒有可顯示的服務'}
            </p>
          </div>
        ) : isEditing && isPageTab ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visibleServices.map((s) => s.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {visibleServices.map((service: Service) => (
                  <SortableServiceCard
                    key={service.id}
                    service={service}
                    isEditing={isEditing}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleServices.map((service: Service) => (
              <ServiceCard key={`svc-${service.id}`} service={service} />
            ))}
            {filteredLinks.map((link: CustomLink) => (
              <LinkCard key={`link-${link.id}`} link={link} />
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
