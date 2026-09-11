import { apiFetch } from "./api"

/** GET /api/user/list 的簡化使用者（後端 models/user.py 的 SimpleUserInfo），登入即可讀，供下拉選單用。 */
export interface SimpleUser {
  id: number
  username: string
  display_name: string | null
}

export interface SimpleUserListResponse {
  users: SimpleUser[]
}

export function listSimpleUsers(): Promise<SimpleUserListResponse> {
  return apiFetch<SimpleUserListResponse>("/api/user/list")
}

/** 選單顯示名：優先 display_name，沒有才退回 username。 */
export function simpleUserName(u: SimpleUser): string {
  return u.display_name || u.username
}

export const userKeys = {
  all: ["users"] as const,
  list: ["users", "list"] as const,
}
