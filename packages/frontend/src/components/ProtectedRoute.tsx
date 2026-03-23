import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

interface ProtectedRouteProps {
  children: React.ReactNode
  adminOnly?: boolean
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  adminOnly,
}) => {
  const accessToken = useAuthStore((state) => state.accessToken)
  const currentUser = useAuthStore((state) => state.currentUser)

  if (!accessToken) {
    return <Navigate to="/select" replace />
  }

  if (adminOnly && currentUser?.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default ProtectedRoute
