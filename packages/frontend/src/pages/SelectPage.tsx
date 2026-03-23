import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getUsers, createUser, User } from '../api/users'
import { selectUser, adminLogin } from '../api/auth'
import { useAuthStore } from '../stores/authStore'
import UserCard from '../components/UserCard'
import AdminPasswordModal from '../components/AdminPasswordModal'
import AddUserModal from '../components/AddUserModal'
import SetupAdminForm from '../components/SetupAdminForm'

const PlusIcon: React.FC = () => (
  <svg
    className="w-8 h-8"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M12 4v16m8-8H4"
    />
  </svg>
)

const SelectPage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setAuth = useAuthStore((state) => state.setAuth)

  const [adminModalUser, setAdminModalUser] = useState<User | null>(null)
  const [adminModalError, setAdminModalError] = useState<string | null>(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [addUserError, setAddUserError] = useState<string | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)

  const {
    data: users,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
    retry: 1,
  })

  const createUserMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setShowAddUser(false)
      setAddUserError(null)
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : '新增使用者失敗，請稍後再試'
      setAddUserError(message)
    },
  })

  const handleUserClick = async (user: User) => {
    if (user.role === 'admin') {
      setAdminModalUser(user)
      setAdminModalError(null)
      return
    }

    try {
      const { accessToken } = await selectUser(user.id)
      setAuth(accessToken, {
        id: user.id,
        username: user.username,
        role: user.role,
      })
      navigate('/')
    } catch {
      // Could add a toast notification here
    }
  }

  const handleAdminConfirm = async (password: string) => {
    if (!adminModalUser) return
    try {
      const { accessToken } = await adminLogin(password)
      setAuth(accessToken, {
        id: adminModalUser.id,
        username: adminModalUser.username,
        role: adminModalUser.role,
      })
      setAdminModalUser(null)
      navigate('/')
    } catch {
      setAdminModalError('密碼錯誤，請重試')
    }
  }

  const handleAddUser = async (username: string) => {
    setAddUserError(null)
    await createUserMutation.mutateAsync({ username })
  }

  const handleSetupAdmin = async (username: string, password: string) => {
    setSetupError(null)
    try {
      const newUser = await createUser({ username, password })
      const { accessToken } = await adminLogin(password)
      setAuth(accessToken, {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
      })
      navigate('/')
    } catch {
      setSetupError('建立帳號失敗，請稍後再試')
    }
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">載入中...</p>
        </div>
      </div>
    )
  }

  // Show error state
  if (isError) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-2">無法載入使用者資料</p>
          <p className="text-slate-500 text-sm">請確認後端服務是否正常運行</p>
        </div>
      </div>
    )
  }

  // No users: show setup admin form
  if (users && users.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <SetupAdminForm onSubmit={handleSetupAdmin} error={setupError} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4 py-12">
      <h1 className="text-white text-4xl font-semibold mb-12 tracking-wide">
        誰在使用？
      </h1>

      <div className="flex flex-wrap justify-center gap-8 max-w-4xl">
        {users?.map((user) => (
          <UserCard key={user.id} user={user} onClick={handleUserClick} />
        ))}

        {/* Add User button */}
        <button
          onClick={() => {
            setShowAddUser(true)
            setAddUserError(null)
          }}
          className="flex flex-col items-center gap-3 group cursor-pointer focus:outline-none"
          aria-label="新增使用者"
        >
          <div className="w-24 h-24 rounded-full border-2 border-dashed border-slate-600 flex items-center justify-center text-slate-500 transition-all duration-200 group-hover:border-slate-400 group-hover:text-slate-300 group-hover:scale-105">
            <PlusIcon />
          </div>
          <span className="text-slate-500 text-sm group-hover:text-slate-300 transition-colors duration-200">
            新增使用者
          </span>
        </button>
      </div>

      {/* Admin Password Modal */}
      {adminModalUser && (
        <AdminPasswordModal
          username={adminModalUser.username}
          onConfirm={handleAdminConfirm}
          onClose={() => {
            setAdminModalUser(null)
            setAdminModalError(null)
          }}
          error={adminModalError}
        />
      )}

      {/* Add User Modal */}
      {showAddUser && (
        <AddUserModal
          onConfirm={handleAddUser}
          onClose={() => {
            setShowAddUser(false)
            setAddUserError(null)
          }}
          error={addUserError}
        />
      )}
    </div>
  )
}

export default SelectPage
