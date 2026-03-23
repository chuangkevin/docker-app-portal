import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { getServicesForSettings, updateServicePrefs } from '../api/services'
import {
  getPages,
  createPage,
  updatePage,
  deletePage,
  setPageServices,
} from '../api/pages'
import type { Service } from '../api/services'
import type { Page } from '../api/pages'

const SettingsPage: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser)
  const queryClient = useQueryClient()

  const { data: services, isLoading } = useQuery({
    queryKey: ['services-settings'],
    queryFn: getServicesForSettings,
  })

  const toggleMutation = useMutation({
    mutationFn: ({
      id,
      is_hidden,
    }: {
      id: number
      is_hidden: 0 | 1
    }) => updateServicePrefs(id, { is_hidden }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services-settings'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })

  const portMutation = useMutation({
    mutationFn: ({
      id,
      preferred_port,
    }: {
      id: number
      preferred_port: number | null
    }) => updateServicePrefs(id, { preferred_port }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services-settings'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-white text-xl font-bold">個人設定</h1>
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

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Section 1: Service Visibility */}
        <section>
          <h2 className="text-white text-lg font-semibold mb-1">
            服務顯示設定
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            選擇要在首頁顯示或隱藏的服務。管理員強制隱藏的服務不會出現在此列表中。
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : !services || services.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-slate-500">目前沒有可設定的服務</p>
            </div>
          ) : (
            <div className="space-y-2">
              {services.map((service: Service) => (
                <div
                  key={service.id}
                  className="bg-slate-800 rounded-lg border border-slate-700 px-4 py-3 flex items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          service.status === 'online'
                            ? 'bg-green-400'
                            : 'bg-slate-500'
                        }`}
                      />
                      <span className="text-white font-medium truncate">
                        {service.name}
                      </span>
                    </div>
                    <p className="text-slate-500 text-xs mt-1 truncate">
                      {service.custom_description ||
                        service.ai_description ||
                        '暫無描述'}
                    </p>
                    {service.ports && service.ports.length > 1 && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-slate-500 text-xs">Port：</span>
                        <select
                          value={service.preferred_port ?? ''}
                          onChange={(e) =>
                            portMutation.mutate({
                              id: service.id,
                              preferred_port: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                          className="bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                          <option value="">
                            自動 ({service.ports[0]?.public})
                          </option>
                          {service.ports.map((p, idx) => (
                            <option key={idx} value={p.public}>
                              {p.public}:{p.private}/{p.type}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={!service.is_hidden}
                      onChange={() =>
                        toggleMutation.mutate({
                          id: service.id,
                          is_hidden: service.is_hidden ? 0 : 1,
                        })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                    <span className="ms-2 text-sm text-slate-400 w-8">
                      {service.is_hidden ? '隱藏' : '顯示'}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Divider */}
        <div className="border-t border-slate-700 my-8" />

        {/* Section 2: Page Management */}
        <section>
          <h2 className="text-white text-lg font-semibold mb-1">我的頁面</h2>
          <p className="text-slate-400 text-sm mb-4">
            建立自訂頁面來分組你的服務
          </p>
          <PageManagementSection />
        </section>
      </main>
    </div>
  )
}

// ======================== Page Management Section ========================

function PageManagementSection() {
  const queryClient = useQueryClient()
  const [newPageName, setNewPageName] = useState('')
  const [editingPageId, setEditingPageId] = useState<number | null>(null)
  const [editPageName, setEditPageName] = useState('')
  const [assigningPageId, setAssigningPageId] = useState<number | null>(null)
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<number>>(
    new Set()
  )

  const { data: pages, isLoading: pagesLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: getPages,
  })

  const { data: allServices } = useQuery({
    queryKey: ['services-settings'],
    queryFn: getServicesForSettings,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => createPage({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
      setNewPageName('')
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      updatePage(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
      setEditingPageId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
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
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
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
    <div className="space-y-4">
      {/* Create new page */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="新頁面名稱..."
          value={newPageName}
          onChange={(e) => setNewPageName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newPageName.trim()) {
              createMutation.mutate(newPageName.trim())
            }
          }}
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && editPageName.trim()) {
                    renameMutation.mutate({
                      id: page.id,
                      name: editPageName,
                    })
                  }
                }}
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
                disabled={!editPageName.trim() || renameMutation.isPending}
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
          目前沒有自訂頁面，請新增一個。
        </p>
      )}
    </div>
  )
}

export default SettingsPage
