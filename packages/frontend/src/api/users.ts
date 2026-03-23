import apiClient from './client'

export interface User {
  id: number
  username: string
  role: 'admin' | 'user'
  avatar_color: string
}

export interface CreateUserPayload {
  username: string
  password?: string
}

export async function getUsers(): Promise<User[]> {
  const { data } = await apiClient.get<User[]>('/users')
  return data
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  const { data } = await apiClient.post<User>('/users', payload)
  return data
}
