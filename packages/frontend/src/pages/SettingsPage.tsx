import React from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { getServices, updateServicePrefs } from '../api/services'
import type { Service } from '../api/services'

const SettingsPage: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser)
  const queryClient = useQueryClient()

  const { data: services, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: getServices,
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
        <p className="text-slate-400 text-sm mb-6">
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
      </main>
    </div>
  )
}

export default SettingsPage
