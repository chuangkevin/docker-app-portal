import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import DomainsTab from '../components/admin/DomainsTab'
import ServicesTab from '../components/admin/ServicesTab'
import UsersTab from '../components/admin/UsersTab'
import SystemTab from '../components/admin/SystemTab'

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

export default AdminPage
