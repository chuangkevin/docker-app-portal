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
  deleteUser,
  getApiKeys,
  addApiKeys,
  deleteApiKey,
  getTokenUsage,
  getDomains,
  addDomain,
  removeDomain,
} from '../api/admin'
import type { ApiKeyInfo, DomainBinding } from '../api/admin'
import {
  getAllServices,
  updateService,
  regenerateDescription,
} from '../api/services'
import type { Service } from '../api/services'
import type { User } from '../api/users'

type AdminTab = 'domains' | 'services' | 'users' | 'system'

const AdminPage: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser)
  const [activeTab, setActiveTab] = useState<AdminTab>('domains')

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'domains', label: 'Domain 管理' },
    { key: 'services', label: '服務管理' },
    { key: 'users', label: '使用者管理' },
    { key: 'system', label: '系統設定' },
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

        {activeTab === 'domains' && <DomainsTab />}
        {activeTab === 'services' && <ServicesTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'system' && <SystemTab />}
      </main>
    </div>
  )
}

// ======================== Domains Tab ========================

function DomainsTab() {
  const queryClient = useQueryClient()
  const [newSubdomain, setNewSubdomain] = useState('')
  const [newPort, setNewPort] = useState('')
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)

  const { data: domains, isLoading } = useQuery({
    queryKey: ['domains'],
    queryFn: getDomains,
  })

  const addMutation = useMutation({
    mutationFn: ({ subdomain, port }: { subdomain: string; port: number }) =>
      addDomain(subdomain, port),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
      setNewSubdomain('')
      setNewPort('')
      setMsg({ text: '新增成功，Caddy 正在重新載入...', type: 'ok' })
      setTimeout(() => setMsg(null), 5000)
    },
    onError: () => {
      setMsg({ text: '新增失敗', type: 'err' })
      setTimeout(() => setMsg(null), 3000)
    },
  })

  const removeMutation = useMutation({
    mutationFn: (subdomain: string) => removeDomain(subdomain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
      setMsg({ text: '刪除成功，Caddy 正在重新載入...', type: 'ok' })
      setTimeout(() => setMsg(null), 5000)
    },
    onError: () => {
      setMsg({ text: '刪除失敗', type: 'err' })
      setTimeout(() => setMsg(null), 3000)
    },
  })

  const handleAdd = () => {
    const sub = newSubdomain.trim().toLowerCase()
    const port = parseInt(newPort, 10)
    if (!sub || isNaN(port) || port <= 0 || port > 65535) return
    addMutation.mutate({ subdomain: sub, port })
  }

  const handleRemove = (subdomain: string) => {
    if (!confirm(`確定要刪除 ${subdomain}.sisihome.org 的綁定嗎？`)) return
    removeMutation.mutate(subdomain)
  }

  return (
    <div className="space-y-6">
      {/* Add new domain binding */}
      <section className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h2 className="text-white font-semibold text-lg mb-4">
          新增 Domain 綁定
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="subdomain"
                value={newSubdomain}
                onChange={(e) => setNewSubdomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd()
                }}
                className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-sm"
              />
              <span className="text-slate-400 text-sm shrink-0">.sisihome.org</span>
            </div>
          </div>
          <input
            type="number"
            placeholder="Port"
            value={newPort}
            onChange={(e) => setNewPort(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
            }}
            min={1}
            max={65535}
            className="w-full sm:w-32 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-sm"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newSubdomain.trim() || !newPort.trim() || addMutation.isPending}
            className="px-6 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {addMutation.isPending ? '新增中...' : '新增'}
          </button>
        </div>
        {msg && (
          <p className={`mt-3 text-sm ${msg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
            {msg.text}
          </p>
        )}
      </section>

      {/* Existing bindings */}
      <section className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h2 className="text-white font-semibold text-lg mb-4">
          現有綁定
        </h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-8 h-8 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : !domains || domains.length === 0 ? (
          <p className="text-slate-500 text-center py-6">尚無 Domain 綁定</p>
        ) : (
          <div className="space-y-2">
            {domains.map((d: DomainBinding) => (
              <div
                key={d.subdomain}
                className="flex items-center justify-between bg-slate-700/50 rounded-lg px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-white font-medium text-sm">
                    {d.subdomain}.sisihome.org
                  </span>
                  <span className="text-slate-500 text-sm">
                    &rarr; localhost:{d.port}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(d.subdomain)}
                  disabled={removeMutation.isPending}
                  className="text-red-400 hover:text-red-300 transition text-sm disabled:opacity-50"
                >
                  刪除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
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
      queryClient.invalidateQueries({ queryKey: ['services'] })
      setEditingId(null)
    },
  })

  const updateDisplayNameMutation = useMutation({
    mutationFn: ({ id, displayName }: { id: number; displayName: string }) =>
      updateService(id, { display_name: displayName || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-services'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
      setEditingDisplayNameId(null)
    },
  })

  const regenMutation = useMutation({
    mutationFn: (id: number) => regenerateDescription(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-services'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
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
      {services?.map((service: Service) => (
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
              {service.domain && (
                <p className="text-blue-400 text-xs mt-1">{service.domain}</p>
              )}
            </div>
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

// ======================== Users Tab ========================

function UsersTab() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.currentUser)

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: getAdminUsers,
  })

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

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
          </div>
        )
      })}

      {(!users || users.length === 0) && (
        <p className="text-slate-500 text-center py-10">目前沒有使用者</p>
      )}
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

export default AdminPage
