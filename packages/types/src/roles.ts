export interface Role {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateRoleInput {
  name: string
}

export interface UpdateRoleInput {
  name?: string
}

export interface RoleQuery {
  id?: string
  name?: string
}

export interface RoleListQuery {
  search?: string
  page?: number
  limit?: number
}

export interface RoleListResponse {
  data: Role[]
  total: number
  page: number
  limit: number
  totalPages: number
}
