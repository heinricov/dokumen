export interface LoginInput {
  email: string
  password: string
}

export interface LoginResponse {
  user: AuthUser
  accessToken: string
  refreshToken?: string
}

export interface RegisterInput {
  email: string
  username?: string
  password: string
  roleId?: string
  teamId?: string
}

export interface RegisterResponse {
  user: AuthUser
}

export interface ForgotPasswordInput {
  email: string
}

export interface ForgotPasswordResponse {
  message: string
}

export interface ResetPasswordInput {
  token: string
  password: string
  confirmPassword: string
}

export interface ResetPasswordResponse {
  message: string
}

export interface Session {
  id: string
  userId: string
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface SessionUser {
  id: string
  email: string
  username: string | null
  roleId: string
  teamId: string | null
}

export interface AuthUser {
  id: string
  email: string
  username: string | null
  role: AuthRole
  team: AuthTeam | null
}

export interface AuthRole {
  id: string
  name: string
}

export interface AuthTeam {
  id: string
  name: string
}
