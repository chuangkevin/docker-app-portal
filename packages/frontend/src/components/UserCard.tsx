import React from 'react'
import { User } from '../api/users'

interface UserCardProps {
  user: User
  onClick: (user: User) => void
}

const LockIcon: React.FC = () => (
  <svg
    className="w-4 h-4"
    fill="currentColor"
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
      clipRule="evenodd"
    />
  </svg>
)

const UserCard: React.FC<UserCardProps> = ({ user, onClick }) => {
  const initial = user.username.charAt(0).toUpperCase()

  return (
    <button
      onClick={() => onClick(user)}
      className="flex flex-col items-center gap-3 group cursor-pointer focus:outline-none"
      aria-label={`選擇使用者 ${user.username}`}
    >
      <div className="relative">
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold transition-all duration-200 group-hover:ring-4 group-hover:ring-white group-hover:scale-105"
          style={{ backgroundColor: user.avatar_color }}
        >
          {initial}
        </div>
        {user.role === 'admin' && (
          <div className="absolute bottom-0 right-0 bg-yellow-500 text-white rounded-full p-1 shadow-md">
            <LockIcon />
          </div>
        )}
      </div>
      <span className="text-white text-sm font-medium group-hover:text-gray-200 transition-colors duration-200">
        {user.username}
      </span>
    </button>
  )
}

export default UserCard
