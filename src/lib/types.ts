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

/**
 * `ChangePasswordRequest`（ching-tech-os api/auth.py 554–558）。
 * 已有平台密碼的人必須帶 `current_password`；NAS 認證、還沒設密碼的人可以不帶。
 */
export interface ChangePasswordBody {
  current_password?: string
  new_password: string
}

/**
 * `ChangePasswordResponse`（api/auth.py 560–564）。
 * 失敗是 **200 加 `success:false` 與 `error` 字串**，不是 4xx，前端要照這個判斷。
 */
export interface ChangePasswordResponse {
  success: boolean
  error: string | null
}
