export interface Team {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateTeamInput {
  name: string
}

export interface UpdateTeamInput {
  name?: string
}

export interface TeamQuery {
  id?: string
  name?: string
}

import type { PaginationQuery } from './pagination'

export interface TeamListQuery extends PaginationQuery {
  search?: string
}

export interface TeamListResponse {
  data: Team[]
  total: number
  page: number
  limit: number
  totalPages: number
}
