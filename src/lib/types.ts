export type LoginMethod = "nas" | "local"

export interface LoginResponse {
  success: boolean
  token: string | null
  username: string | null
  error: string | null
  role: string | null
  must_change_password: boolean
}

export interface UserInfo {
  id: number
  username: string
  display_name: string | null
  is_admin: boolean
  role: string
  account_role: string
  auth_type: string
  has_password: boolean
  nas_username: string | null
  permissions: { apps: Record<string, boolean>; knowledge: Record<string, boolean> } | null
}

export interface NasBindingResponse {
  success: boolean
  nas_username: string | null
}
