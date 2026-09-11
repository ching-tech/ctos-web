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

export const adminKeys = {
  all: ["admin"] as const,
  users: ["admin", "users"] as const,
  defaultPermissions: ["admin", "default-permissions"] as const,
}
