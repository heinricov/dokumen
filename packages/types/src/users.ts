export interface User {
  id: string
  email: string
  username: string | null
  roleId: string
  teamId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateUserInput {
  email: string
  username?: string
  password: string
  roleId: string
  teamId?: string
}

export interface UpdateUserInput {
  email?: string
  username?: string | null
  password?: string
  roleId?: string
  teamId?: string | null
}

export interface UserQuery {
  id?: string
  email?: string
  username?: string
  roleId?: string
  teamId?: string
}

export interface UserListQuery {
  search?: string
  roleId?: string
  teamId?: string
  page?: number
  limit?: number
}

export interface UserListResponse {
  data: User[]
  total: number
  page: number
  limit: number
  totalPages: number
}