import React, { useState, useMemo } from 'react'
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useAuthStore } from '../../stores/authStore'
import {
  getAdminUsers,
  deleteUser,
} from '../../api/admin'
import type { User } from '../../api/users'

export default function UsersTab() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.currentUser)
  const [userSearch, setUserSearch] = useState('')

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

  const filteredUsers = useMemo(() => {
    if (!users) return []
    const term = userSearch.toLowerCase().trim()
    if (!term) return users
    return users.filter(
      (u: User) =>
        u.username.toLowerCase().includes(term) ||
        u.role.toLowerCase().includes(term)
    )
  }, [users, userSearch])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="mb-3">
        <input
          type="text"
          placeholder="搜尋使用者..."
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-sm"
        />
      </div>
      {filteredUsers.map((user: User) => {
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

      {filteredUsers.length === 0 && (
        <p className="text-slate-500 text-center py-10">
          {userSearch ? '找不到符合條件的使用者' : '目前沒有使用者'}
        </p>
      )}
    </div>
  )
}
