export interface Role {
  id: string
  name: string
  isSystem: boolean
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

export const ROLE_NAMES = {
  USER: 'USER',
  MODERATOR: 'MODERATOR',
  ADMIN: 'ADMIN',
} as const

export type RoleName = (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES]

export const SYSTEM_ROLE_NAMES: readonly RoleName[] = [
  ROLE_NAMES.USER,
  ROLE_NAMES.MODERATOR,
  ROLE_NAMES.ADMIN,
]

export const ROLE_RANK: Record<string, number> = {
  [ROLE_NAMES.USER]: 1,
  [ROLE_NAMES.MODERATOR]: 2,
  [ROLE_NAMES.ADMIN]: 3,
}

export function normalizeRoleName(name: string): string {
  return name.trim().toUpperCase()
}

export function roleRank(name: string): number {
  return ROLE_RANK[normalizeRoleName(name)] ?? 0
}

export function isRoleAtLeast(name: string, min: RoleName): boolean {
  return roleRank(name) >= roleRank(min)
}

export function isSystemRoleName(name: string): boolean {
  return SYSTEM_ROLE_NAMES.includes(normalizeRoleName(name) as RoleName)
}

/**
 * Returns true when `assigner` may create/update a user to the `target` role.
 *
 * Explicit policy:
 * - ADMIN may assign any role (USER, MODERATOR, ADMIN).
 * - MODERATOR may assign USER and MODERATOR only, never ADMIN.
 * - Anyone else (e.g. USER or unknown roles) may not assign anything.
 */
export function canAssignRole(assigner: string, target: string): boolean {
  const assignerRole = normalizeRoleName(assigner)
  const targetRole = normalizeRoleName(target)

  switch (assignerRole) {
    case ROLE_NAMES.ADMIN:
      return true
    case ROLE_NAMES.MODERATOR:
      return (
        targetRole === ROLE_NAMES.USER || targetRole === ROLE_NAMES.MODERATOR
      )
    default:
      return false
  }
}