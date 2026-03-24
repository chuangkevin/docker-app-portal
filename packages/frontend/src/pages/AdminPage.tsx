import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import {
  getAdminUsers,
  getUserOverrides,
  setUserOverrides,
  setGlobalOverride,
  deleteUser,
  getApiKeys,
  addApiKeys,
  deleteApiKey,
  getTokenUsage,
} from '../api/admin'
import type { ServiceOverride, ApiKeyInfo } from '../api/admin'
import {
  getAllServices,
  updateService,
  regenerateDescription,
} from '../api/services'
import {
  getPages,
  createPage,
  updatePage,
  deletePage,
  setPageServices,
} from '../api/pages'
import type { Service } from '../api/services'
import type { Page } from '../api/pages'
import type { User } from '../api/users'

type AdminTab = 'system' | 'services' | 'pages' | 'users'

const AdminPage: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser)
  const [activeTab, setActiveTab] = useState<AdminTab>('system')

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'system', label: '系統設定' },
    { key: 'services', label: '服務管理' },
    { key: 'pages', label: '頁面分組' },
    { key: 'users', label: '使用者管理' },
  ]

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-white text-xl font-bold">管理設定</h1>
          <div className="flex items-center gap-3">
            {currentUser && (
              <span className="text-slate-400 text-sm">
                {currentUser.username}
              </span>
            )}
            <Link
              to="/"
              className="px-3 py-1.5 rounded-lg text-sm border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition"
            >
              返回首頁
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                activeTab === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'system' && <SystemTab />}
        {activeTab === 'services' && <ServicesTab />}
        {activeTab === 'pages' && <PagesTab />}
        {activeTab === 'users' && <UsersTab />}
      </main>
    </div>
  )
}

// ======================== System Tab ========================

function SystemTab() {
  const queryClient = useQueryClient()
  const [keysInput, setKeysInput] = useState('')
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)

  const { data: apiKeys, isLoading: keysLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: getApiKeys,
  })

  const { data: usage } = useQuery({
    queryKey: ['token-usage'],
    queryFn: getTokenUsage,
  })

  const addMutation = useMutation({
    mutationFn: (keys: string) => addApiKeys(keys),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      queryClient.invalidateQueries({ queryKey: ['token-usage'] })
      setKeysInput('')
      setMsg({ text: `新增 ${result.added} 個 key（共 ${result.total} 個）`, type: 'ok' })
      setTimeout(() => setMsg(null), 3000)
    },
    onError: () => {
      setMsg({ text: '新增失敗', type: 'err' })
      setTimeout(() => setMsg(null), 3000)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (suffix: string) => deleteApiKey(suffix),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })

  const handleAdd = () => {
    if (!keysInput.trim()) return
    addMutation.mutate(keysInput)
  }

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  return (
    <div className="space-y-6">
      {/* API Key Pool */}
      <section className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h2 className="text-white font-semibold text-lg mb-4">
          Gemini API Keys
        </h2>

        {/* Key list */}
        {keysLoading ? (
          <p className="text-slate-500 text-sm mb-4">載入中...</p>
        ) : apiKeys?.keys && apiKeys.keys.length > 0 ? (
          <div className="space-y-2 mb-4">
            {apiKeys.keys.map((k: ApiKeyInfo) => (
              <div
                key={k.suffix}
                className="flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <code className="text-slate-300 text-sm font-mono">
                    ...{k.suffix}
                  </code>
                  <span className="text-slate-500 text-xs">
                    今日 {k.todayCalls} 次 / {formatTokens(k.todayTokens)} tokens
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(k.suffix)}
                  disabled={deleteMutation.isPending}
                  className="text-xs text-red-400 hover:text-red-300 transition"
                >
                  刪除
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-yellow-400 text-sm mb-4">
            尚未設定 API Key，請在下方貼上。
          </p>
        )}

        {/* Batch add textarea */}
        <textarea
          placeholder="貼上一個或多個 Gemini API Key（每行一個，自動辨識 AIza 開頭的 key）..."
          value={keysInput}
          onChange={(e) => setKeysInput(e.target.value)}
          rows={4}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-sm font-mono resize-y"
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!keysInput.trim() || addMutation.isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {addMutation.isPending ? '新增中...' : '新增 Key'}
          </button>
          {msg && (
            <span className={`text-sm ${msg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
              {msg.text}
            </span>
          )}
        </div>
      </section>

      {/* Token Usage Stats */}
      {usage && (
        <section className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h2 className="text-white font-semibold text-lg mb-4">
            Token 用量統計
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-700/50 rounded-lg p-4 text-center">
              <p className="text-slate-400 text-xs mb-1">今日</p>
              <p className="text-white text-2xl font-bold">{usage.today.calls}</p>
              <p className="text-slate-500 text-xs">{formatTokens(usage.today.tokens)} tokens</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4 text-center">
              <p className="text-slate-400 text-xs mb-1">本週</p>
              <p className="text-white text-2xl font-bold">{usage.week.calls}</p>
              <p className="text-slate-500 text-xs">{formatTokens(usage.week.tokens)} tokens</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4 text-center">
              <p className="text-slate-400 text-xs mb-1">本月</p>
              <p className="text-white text-2xl font-bold">{usage.month.calls}</p>
              <p className="text-slate-500 text-xs">{formatTokens(usage.month.tokens)} tokens</p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

// ======================== Services Tab ========================

function ServicesTab() {
  const queryClient = useQueryClient()

  const { data: services, isLoading } = useQuery({
    queryKey: ['admin-services'],
    queryFn: getAllServices,
  })

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDesc, setEditDesc] = useState('')
  const [editingDisplayNameId, setEditingDisplayNameId] = useState<number | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')

  const updateDescMutation = useMutation({
    mutationFn: ({ id, desc }: { id: number; desc: string }) =>
      updateService(id, { custom_description: desc || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-services'] })
      setEditingId(null)
    },
  })

  const updateDisplayNameMutation = useMutation({
    mutationFn: ({ id, displayName }: { id: number; displayName: string }) =>
      updateService(id, { display_name: displayName || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-services'] })
      setEditingDisplayNameId(null)
    },
  })

  const regenMutation = useMutation({
    mutationFn: (id: number) => regenerateDescription(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-services'] })
    },
  })

  const globalHideMutation = useMutation({
    mutationFn: ({
      id,
      is_force_hidden,
    }: {
      id: number
      is_force_hidden: 0 | 1
    }) => setGlobalOverride(id, { is_force_hidden }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-services'] })
    },
  })

  const startEdit = (service: Service) => {
    setEditingId(service.id)
    setEditDesc(service.custom_description || '')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {services?.map((service: Service & { is_force_hidden?: number }) => (
        <div
          key={service.id}
          className="bg-slate-800 rounded-xl border border-slate-700 p-4"
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    service.status === 'online'
                      ? 'bg-green-400'
                      : 'bg-slate-500'
                  }`}
                />
                <h3 className="text-white font-semibold truncate">
                  {service.name}
                </h3>
              </div>
              <p className="text-slate-500 text-xs mt-1">{service.image}</p>
            </div>

            <label className="flex items-center gap-2 shrink-0 cursor-pointer">
              <span className="text-xs text-slate-400">全域隱藏</span>
              <input
                type="checkbox"
                checked={!!service.is_force_hidden}
                onChange={() =>
                  globalHideMutation.mutate({
                    id: service.id,
                    is_force_hidden: service.is_force_hidden ? 0 : 1,
                  })
                }
                className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
              />
            </label>
          </div>

          {/* Display Name */}
          <div className="mb-3">
            {editingDisplayNameId === service.id ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="自訂顯示名稱..."
                  className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateDisplayNameMutation.mutate({
                      id: service.id,
                      displayName: editDisplayName,
                    })
                  }
                  disabled={updateDisplayNameMutation.isPending}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40"
                >
                  儲存
                </button>
                <button
                  type="button"
                  onClick={() => setEditingDisplayNameId(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-600 text-slate-400 hover:text-white transition"
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-xs">顯示名稱：</span>
                <span className="text-slate-300 text-sm flex-1 truncate">
                  {service.display_name || '（使用容器名稱）'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingDisplayNameId(service.id)
                    setEditDisplayName(service.display_name || '')
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 transition shrink-0"
                >
                  編輯
                </button>
              </div>
            )}
          </div>

          {/* Description */}
          {editingId === service.id ? (
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="自訂描述..."
                className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-sm"
              />
              <button
                type="button"
                onClick={() =>
                  updateDescMutation.mutate({
                    id: service.id,
                    desc: editDesc,
                  })
                }
                disabled={updateDescMutation.isPending}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40"
              >
                儲存
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-600 text-slate-400 hover:text-white transition"
              >
                取消
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-3">
              <p className="text-slate-400 text-sm flex-1 truncate">
                {service.custom_description ||
                  service.ai_description ||
                  '暫無描述'}
              </p>
              <button
                type="button"
                onClick={() => startEdit(service)}
                className="text-xs text-blue-400 hover:text-blue-300 transition shrink-0"
              >
                編輯
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => regenMutation.mutate(service.id)}
            disabled={regenMutation.isPending}
            className="text-xs text-slate-400 hover:text-white border border-slate-600 rounded-lg px-3 py-1.5 transition disabled:opacity-40"
          >
            重新生成 AI 描述
          </button>
        </div>
      ))}

      {(!services || services.length === 0) && (
        <p className="text-slate-500 text-center py-10">目前沒有服務</p>
      )}
    </div>
  )
}

// ======================== Pages Tab ========================

function PagesTab() {
  const queryClient = useQueryClient()
  const [newPageName, setNewPageName] = useState('')
  const [editingPageId, setEditingPageId] = useState<number | null>(null)
  const [editPageName, setEditPageName] = useState('')
  const [assigningPageId, setAssigningPageId] = useState<number | null>(null)
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<number>>(
    new Set()
  )

  const { data: pages, isLoading: pagesLoading } = useQuery({
    queryKey: ['admin-pages'],
    queryFn: getPages,
  })

  const { data: allServices } = useQuery({
    queryKey: ['admin-services'],
    queryFn: getAllServices,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => createPage({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pages'] })
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      setNewPageName('')
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      updatePage(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pages'] })
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      setEditingPageId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pages'] })
      queryClient.invalidateQueries({ queryKey: ['pages'] })
    },
  })

  const assignMutation = useMutation({
    mutationFn: ({
      pageId,
      serviceIds,
    }: {
      pageId: number
      serviceIds: number[]
    }) =>
      setPageServices(
        pageId,
        serviceIds.map((sid, idx) => ({ service_id: sid, order: idx }))
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pages'] })
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      setAssigningPageId(null)
    },
  })

  const startAssigning = (page: Page) => {
    setAssigningPageId(page.id)
    setSelectedServiceIds(
      new Set(page.services?.map((s: Service) => s.id) || [])
    )
  }

  const toggleServiceSelection = (serviceId: number) => {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev)
      if (next.has(serviceId)) {
        next.delete(serviceId)
      } else {
        next.add(serviceId)
      }
      return next
    })
  }

  if (pagesLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Create new page */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="新頁面名稱..."
          value={newPageName}
          onChange={(e) => setNewPageName(e.target.value)}
          className="flex-1 max-w-xs bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-sm"
        />
        <button
          type="button"
          onClick={() => {
            if (newPageName.trim()) createMutation.mutate(newPageName.trim())
          }}
          disabled={!newPageName.trim() || createMutation.isPending}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          新增頁面
        </button>
      </div>

      {/* Page list */}
      {pages?.map((page: Page) => (
        <div
          key={page.id}
          className="bg-slate-800 rounded-xl border border-slate-700 p-4"
        >
          {editingPageId === page.id ? (
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                aria-label="頁面名稱"
                value={editPageName}
                onChange={(e) => setEditPageName(e.target.value)}
                className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500 transition text-sm"
              />
              <button
                type="button"
                onClick={() =>
                  renameMutation.mutate({
                    id: page.id,
                    name: editPageName,
                  })
                }
                disabled={
                  !editPageName.trim() || renameMutation.isPending
                }
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40"
              >
                儲存
              </button>
              <button
                type="button"
                onClick={() => setEditingPageId(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-600 text-slate-400 hover:text-white transition"
              >
                取消
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-white font-semibold">{page.name}</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPageId(page.id)
                    setEditPageName(page.name)
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 transition"
                >
                  重命名
                </button>
                <button
                  type="button"
                  onClick={() => startAssigning(page)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition"
                >
                  指派服務
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`確定要刪除頁面「${page.name}」嗎？`))
                      deleteMutation.mutate(page.id)
                  }}
                  className="text-xs text-red-400 hover:text-red-300 transition"
                >
                  刪除
                </button>
              </div>
            </div>
          )}

          {/* Assigned services */}
          {assigningPageId === page.id ? (
            <div className="space-y-2">
              <p className="text-slate-400 text-xs mb-2">
                勾選要指派到此頁面的服務：
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto">
                {allServices?.map((s: Service) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded hover:bg-slate-700 transition"
                  >
                    <input
                      type="checkbox"
                      checked={selectedServiceIds.has(s.id)}
                      onChange={() => toggleServiceSelection(s.id)}
                      className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                    />
                    <span className="text-sm text-white truncate">
                      {s.name}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    assignMutation.mutate({
                      pageId: page.id,
                      serviceIds: Array.from(selectedServiceIds),
                    })
                  }
                  disabled={assignMutation.isPending}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40"
                >
                  儲存指派
                </button>
                <button
                  type="button"
                  onClick={() => setAssigningPageId(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-600 text-slate-400 hover:text-white transition"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {page.services && page.services.length > 0 ? (
                page.services.map((s: Service) => (
                  <span
                    key={s.id}
                    className="text-xs bg-slate-700 text-slate-300 rounded px-2 py-1"
                  >
                    {s.name}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">尚未指派服務</span>
              )}
            </div>
          )}
        </div>
      ))}

      {(!pages || pages.length === 0) && (
        <p className="text-slate-500 text-center py-10">
          目前沒有頁面分組，請新增一個。
        </p>
      )}
    </div>
  )
}

// ======================== Users Tab ========================

function UsersTab() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.currentUser)
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null)
  const [overrides, setOverrides] = useState<ServiceOverride[]>([])

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: getAdminUsers,
  })

  const { data: allServices } = useQuery({
    queryKey: ['admin-services'],
    queryFn: getAllServices,
  })

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  const saveOverridesMutation = useMutation({
    mutationFn: ({
      userId,
      overrideData,
    }: {
      userId: number
      overrideData: Array<{ service_id: number; is_hidden: 0 | 1 }>
    }) => setUserOverrides(userId, overrideData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setExpandedUserId(null)
    },
  })

  const handleExpand = async (userId: number) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null)
      return
    }
    try {
      const data = await getUserOverrides(userId)
      setOverrides(data)
      setExpandedUserId(userId)
    } catch {
      // Failed to load overrides
    }
  }

  const toggleOverride = (serviceId: number) => {
    setOverrides((prev) => {
      const existing = prev.find((o) => o.service_id === serviceId)
      if (existing) {
        return prev.map((o) =>
          o.service_id === serviceId
            ? { ...o, is_hidden: o.is_hidden ? 0 : (1 as 0 | 1) }
            : o
        )
      }
      const service = allServices?.find(
        (s: Service) => s.id === serviceId
      )
      return [
        ...prev,
        {
          service_id: serviceId,
          service_name: service?.name || '',
          is_hidden: 1 as 0 | 1,
        },
      ]
    })
  }

  const isServiceHiddenForUser = (serviceId: number): boolean => {
    const override = overrides.find((o) => o.service_id === serviceId)
    return override ? !!override.is_hidden : false
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {users?.map((user: User) => {
        const isCurrentOrAdmin =
          user.id === currentUser?.id || user.role === 'admin'
        const isExpanded = expandedUserId === user.id

        return (
          <div
            key={user.id}
            className="bg-slate-800 rounded-xl border border-slate-700 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: user.avatar_color || '#475569' }}
                >
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <span className="text-white font-medium">
                    {user.username}
                  </span>
                  <span className="text-slate-500 text-xs ml-2">
                    {user.role}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExpand(user.id)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition"
                >
                  {isExpanded ? '收起' : '服務權限'}
                </button>

                {!isCurrentOrAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(
                          `確定要刪除使用者「${user.username}」嗎？`
                        )
                      )
                        deleteUserMutation.mutate(user.id)
                    }}
                    className="text-xs text-red-400 hover:text-red-300 transition"
                  >
                    刪除
                  </button>
                )}
              </div>
            </div>

            {isExpanded && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <p className="text-slate-400 text-xs mb-2">
                  勾選要對此使用者隱藏的服務：
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto">
                  {allServices?.map((s: Service) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded hover:bg-slate-700 transition"
                    >
                      <input
                        type="checkbox"
                        checked={isServiceHiddenForUser(s.id)}
                        onChange={() => toggleOverride(s.id)}
                        className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                      />
                      <span className="text-sm text-white truncate">
                        {s.name}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() =>
                      saveOverridesMutation.mutate({
                        userId: user.id,
                        overrideData: overrides
                          .filter((o) => o.is_hidden)
                          .map((o) => ({
                            service_id: o.service_id,
                            is_hidden: 1 as 0 | 1,
                          })),
                      })
                    }
                    disabled={saveOverridesMutation.isPending}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40"
                  >
                    儲存
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedUserId(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-600 text-slate-400 hover:text-white transition"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {(!users || users.length === 0) && (
        <p className="text-slate-500 text-center py-10">目前沒有使用者</p>
      )}
    </div>
  )
}

export default AdminPage
