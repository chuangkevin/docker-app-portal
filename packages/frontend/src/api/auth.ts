import axios from 'axios'
import apiClient from './client'

const authClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

export interface SelectUserResponse {
  accessToken: string
}

export interface AdminLoginResponse {
  accessToken: string
}

export interface RefreshResponse {
  accessToken: string
}

export async function selectUser(userId: number): Promise<SelectUserResponse> {
  const { data } = await apiClient.post<SelectUserResponse>(
    `/auth/select/${userId}`
  )
  return data
}

export async function adminLogin(password: string): Promise<AdminLoginResponse> {
  const { data } = await apiClient.post<AdminLoginResponse>('/auth/admin-login', {
    password,
  })
  return data
}

export async function refreshToken(): Promise<RefreshResponse> {
  const { data } = await authClient.post<RefreshResponse>('/auth/refresh')
  return data
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout')
}
