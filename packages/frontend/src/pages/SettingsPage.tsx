import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { getLinks, createLink, updateLink, deleteLink } from '../api/links'
import type { CustomLink } from '../api/links'

const SettingsPage: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser)

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
        <section>
          <h2 className="text-white text-lg font-semibold mb-1">我的書籤</h2>
          <p className="text-slate-400 text-sm mb-4">
            新增自訂書籤，將任何網頁加入你的 Portal 首頁
          </p>
          <BookmarkManagementSection />
        </section>
      </main>
    </div>
  )
}

// ======================== Bookmark Management Section ========================

function BookmarkManagementSection() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.currentUser)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editDesc, setEditDesc] = useState('')

  const { data: links, isLoading } = useQuery({
    queryKey: ['links'],
    queryFn: getLinks,
  })

  const createMutation = useMutation({
    mutationFn: (data: { name: string; url: string; description?: string; icon_color?: string }) =>
      createLink(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['links'] })
      setNewName('')
      setNewUrl('')
      setNewDesc('')
      setNewColor('#3b82f6')
      setShowAddForm(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: number
      name?: string
      url?: string
      description?: string | null
    }) => updateLink(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['links'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteLink(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['links'] })
    },
  })

  const handleCreate = () => {
    if (!newName.trim() || !newUrl.trim()) return
    createMutation.mutate({
      name: newName.trim(),
      url: newUrl.trim(),
      description: newDesc.trim() || undefined,
      icon_color: newColor,
    })
  }

  const startEdit = (link: CustomLink) => {
    setEditingId(link.id)
    setEditName(link.name)
    setEditUrl(link.url)
    setEditDesc(link.description || '')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-8 h-8 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Add bookmark button / form */}
      {showAddForm ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3">
          <input
            type="text"
            placeholder="書籤名稱"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
          />
          <input
            type="url"
            placeholder="https://..."
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
          />
          <input
            type="text"
            placeholder="描述（選填）"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
          />
          <div className="flex items-center gap-3">
            <label className="text-slate-400 text-sm">圖示顏色</label>
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              title="選擇圖示顏色"
              className="w-8 h-8 rounded cursor-pointer border border-slate-600 bg-transparent"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || !newUrl.trim() || createMutation.isPending}
              className="flex-1 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? '新增中...' : '新增書籤'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="flex-1 py-2 rounded-lg text-sm font-medium border border-slate-600 text-slate-400 hover:text-white transition"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="w-full py-2.5 rounded-xl text-sm font-medium border-2 border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 transition"
        >
          + 新增書籤
        </button>
      )}

      {/* Bookmark list */}
      {links && links.length > 0 ? (
        <div className="space-y-2">
          {links.map((link: CustomLink) => (
            <div
              key={link.id}
              className="bg-slate-800 rounded-lg border border-slate-700 px-4 py-3"
            >
              {editingId === link.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="書籤名稱"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="url"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="描述"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateMutation.mutate({
                          id: link.id,
                          name: editName.trim(),
                          url: editUrl.trim(),
                          description: editDesc.trim() || null,
                        })
                      }
                      disabled={!editName.trim() || !editUrl.trim()}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40"
                    >
                      儲存
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium border border-slate-600 text-slate-400 hover:text-white transition"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-xs"
                      style={{ backgroundColor: link.icon_color }}
                    >
                      {link.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate text-sm">
                        {link.name}
                      </p>
                      <p className="text-slate-500 text-xs truncate">
                        {link.url}
                      </p>
                      {link.description && (
                        <p className="text-slate-400 text-xs truncate mt-0.5">
                          {link.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(link.created_by === currentUser?.id ||
                      currentUser?.role === 'admin') && (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(link)}
                          className="text-xs text-blue-400 hover:text-blue-300 transition"
                        >
                          編輯
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`確定要刪除書籤「${link.name}」嗎？`))
                              deleteMutation.mutate(link.id)
                          }}
                          className="text-xs text-red-400 hover:text-red-300 transition"
                        >
                          刪除
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-slate-500 text-center py-6">
          還沒有書籤，新增一個試試！
        </p>
      )}
    </div>
  )
}

export default SettingsPage
