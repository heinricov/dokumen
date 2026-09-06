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

import type { PaginationQuery } from './pagination'

export interface RoleListQuery extends PaginationQuery {
  search?: string
}

export interface RoleListResponse {
  data: Role[]
  total: number
  page: number
  limit: number
  totalPages: number
}
