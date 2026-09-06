export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 100
export const MAX_PAGE_NUMBER = 10_000

export interface PaginationQuery {
  page?: number
  limit?: number
}