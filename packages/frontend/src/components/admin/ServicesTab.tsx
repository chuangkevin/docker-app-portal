import { useState, useMemo } from 'react'
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  getAllServices,
  updateService,
  regenerateDescription,
  toggleServiceVisibility,
} from '../../api/services'
import type { Service } from '../../api/services'

export default function ServicesTab() {
  const queryClient = useQueryClient()

  const { data: services, isLoading } = useQuery({
    queryKey: ['admin-services'],
    queryFn: getAllServices,
  })

  const [serviceSearch, setServiceSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
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

  const visibilityMutation = useMutation({
    mutationFn: ({ id, is_hidden }: { id: number; is_hidden: boolean }) =>
      toggleServiceVisibility(id, is_hidden),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-services'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })

  const bulkVisibilityMutation = useMutation({
    mutationFn: async ({ ids, is_hidden }: { ids: number[]; is_hidden: boolean }) => {
      await Promise.all(ids.map((id) => toggleServiceVisibility(id, is_hidden)))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-services'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
      setSelectedIds(new Set())
    },
  })

  const filteredServices = useMemo(() => {
    if (!services) return []
    const term = serviceSearch.toLowerCase().trim()
    let list = services
    if (term) {
      list = services.filter(
        (s: Service) =>
          s.name.toLowerCase().includes(term) ||
          (s.display_name && s.display_name.toLowerCase().includes(term)) ||
          (s.domain && s.domain.toLowerCase().includes(term)) ||
          (s.image && s.image.toLowerCase().includes(term))
      )
    }
    // Sort: visible first, hidden last; within each group alphabetical
    return [...list].sort((a, b) => {
      const aHidden = a.is_hidden ? 1 : 0
      const bHidden = b.is_hidden ? 1 : 0
      if (aHidden !== bHidden) return aHidden - bHidden
      const nameA = (a.display_name || a.name).toLowerCase()
      const nameB = (b.display_name || b.name).toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [services, serviceSearch])

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredServices.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredServices.map((s) => s.id)))
    }
  }

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
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <input
          type="text"
          placeholder="搜尋服務..."
          value={serviceSearch}
          onChange={(e) => setServiceSearch(e.target.value)}
          className="flex-1 min-w-[200px] max-w-sm bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-sm"
        />
        {filteredServices.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectAll}
            className="text-xs text-slate-400 hover:text-white border border-slate-600 rounded-lg px-3 py-2 transition"
          >
            {selectedIds.size === filteredServices.length ? '取消全選' : '全選'}
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 bg-slate-700/50 rounded-lg px-4 py-2.5">
          <span className="text-slate-300 text-sm">
            已選取 {selectedIds.size} 個服務
          </span>
          <button
            type="button"
            onClick={() =>
              bulkVisibilityMutation.mutate({
                ids: [...selectedIds],
                is_hidden: true,
              })
            }
            disabled={bulkVisibilityMutation.isPending}
            className="text-xs text-yellow-400 border border-yellow-600 rounded-lg px-3 py-1.5 hover:bg-yellow-600/10 transition disabled:opacity-40"
          >
            批次隱藏
          </button>
          <button
            type="button"
            onClick={() =>
              bulkVisibilityMutation.mutate({
                ids: [...selectedIds],
                is_hidden: false,
              })
            }
            disabled={bulkVisibilityMutation.isPending}
            className="text-xs text-green-400 border border-green-600 rounded-lg px-3 py-1.5 hover:bg-green-600/10 transition disabled:opacity-40"
          >
            批次顯示
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-slate-400 hover:text-white transition ml-auto"
          >
            取消選取
          </button>
        </div>
      )}
      {filteredServices.map((service: Service) => (
        <div
          key={service.id}
          className={`bg-slate-800 rounded-xl border p-4 ${
            service.is_hidden
              ? 'border-slate-700/50 opacity-60'
              : 'border-slate-700'
          }`}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.has(service.id)}
                  onChange={() => toggleSelect(service.id)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 shrink-0 cursor-pointer"
                />
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
                {service.is_hidden && (
                  <span className="text-xs text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                    已隱藏
                  </span>
                )}
              </div>
              <p className="text-slate-500 text-xs mt-1">{service.image}</p>
              {service.domain && (
                <p className="text-blue-400 text-xs mt-1">{service.domain}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() =>
                visibilityMutation.mutate({
                  id: service.id,
                  is_hidden: !service.is_hidden,
                })
              }
              disabled={visibilityMutation.isPending}
              className={`text-xs px-3 py-1.5 rounded-lg border transition shrink-0 ${
                service.is_hidden
                  ? 'border-green-600 text-green-400 hover:bg-green-600/10'
                  : 'border-slate-600 text-slate-400 hover:text-yellow-400 hover:border-yellow-600'
              } disabled:opacity-40`}
            >
              {service.is_hidden ? '顯示' : '隱藏'}
            </button>
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

      {filteredServices.length === 0 && (
        <p className="text-slate-500 text-center py-10">
          {serviceSearch ? '找不到符合條件的服務' : '目前沒有服務'}
        </p>
      )}
    </div>
  )
}
