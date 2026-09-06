export interface LoginInput {
  email: string
  password: string
}

export interface LoginResponse {
  user: AuthUser
  accessToken: string
  refreshToken: string
}

export interface RegisterInput {
  email: string
  username?: string
  password: string
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

export interface RefreshTokenInput {
  refreshToken: string
}

export interface RefreshTokenResponse {
  user: AuthUser
  accessToken: string
  refreshToken: string
}

export interface LogoutInput {
  refreshToken: string
}

export interface LogoutResponse {
  message: string
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