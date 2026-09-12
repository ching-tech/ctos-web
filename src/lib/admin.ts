import { apiFetch } from "./api"

export interface UserPermissions {
  apps: Record<string, boolean>
  knowledge: Record<string, boolean>
}

export interface AdminUserInfo {
  id: number
  username: string
  display_name: string | null
  is_admin: boolean
  permissions: UserPermissions
  created_at: string
  last_login_at: string | null
  is_active: boolean
  role: string
  has_password: boolean
}

export interface AdminUsersResponse {
  users: AdminUserInfo[]
}

export interface DefaultPermissions {
  apps: Record<string, boolean>
  knowledge: Record<string, boolean>
  app_names: Record<string, string>
}

export interface UpdatePermissionsBody {
  apps?: Record<string, boolean>
  knowledge?: Record<string, boolean>
}

export interface UpdatePermissionsResponse {
  success: boolean
  permissions: UserPermissions
}

export function listUsers(): Promise<AdminUsersResponse> {
  return apiFetch<AdminUsersResponse>("/api/admin/users")
}

export function getDefaultPermissions(): Promise<DefaultPermissions> {
  return apiFetch<DefaultPermissions>("/api/admin/default-permissions")
}

export function updateUserPermissions(id: number, body: UpdatePermissionsBody): Promise<UpdatePermissionsResponse> {
  return apiFetch<UpdatePermissionsResponse>(`/api/admin/users/${id}/permissions`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

/** `CreateUserRequest`（models/user.py 62–68）：username 1–100、password 至少 8 碼。 */
export interface CreateUserBody {
  username: string
  password: string
  display_name?: string | null
  role: string
}

/** `CreateUserResponse`（models/user.py 71–79）。新帳號一律 `must_change_password=true`（api/user.py 433）。 */
export interface CreateUserResponse {
  success: boolean
  id: number | null
  username: string | null
  display_name: string | null
  role: string | null
  error: string | null
}

/** `UpdateUserInfoRequest`（models/user.py 82–87）。三個欄位都可選，只送要改的。 */
export interface UpdateUserInfoBody {
  display_name?: string | null
  email?: string | null
  role?: string
}

/** `UserOperationResponse`（models/user.py 102–107）：編輯、狀態、重設密碼、清除密碼、刪除共用的回應。 */
export interface UserOperationResponse {
  success: boolean
  message: string | null
  error: string | null
}

export function createUser(body: CreateUserBody): Promise<CreateUserResponse> {
  return apiFetch<CreateUserResponse>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateUserInfo(id: number, body: UpdateUserInfoBody): Promise<UserOperationResponse> {
  return apiFetch<UserOperationResponse>(`/api/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

export function updateUserStatus(id: number, isActive: boolean): Promise<UserOperationResponse> {
  return apiFetch<UserOperationResponse>(`/api/admin/users/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: isActive }),
  })
}

export function resetUserPassword(id: number, newPassword: string): Promise<UserOperationResponse> {
  return apiFetch<UserOperationResponse>(`/api/admin/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ new_password: newPassword }),
  })
}

/** 後端沒有 request body（api/user.py 569–582）。 */
export function clearUserPassword(id: number): Promise<UserOperationResponse> {
  return apiFetch<UserOperationResponse>(`/api/admin/users/${id}/clear-password`, { method: "POST" })
}

export function deleteUser(id: number): Promise<UserOperationResponse> {
  return apiFetch<UserOperationResponse>(`/api/admin/users/${id}`, { method: "DELETE" })
}

export const adminKeys = {
  all: ["admin"] as const,
  users: ["admin", "users"] as const,
  defaultPermissions: ["admin", "default-permissions"] as const,
}
