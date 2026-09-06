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

export interface TeamListQuery {
  search?: string
  page?: number
  limit?: number
}

export interface TeamListResponse {
  data: Team[]
  total: number
  page: number
  limit: number
  totalPages: number
}
