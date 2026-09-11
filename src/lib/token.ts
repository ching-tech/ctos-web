import type { UserInfo } from "./types"

const TOKEN_KEY = "ctos-web.token"
const USER_KEY = "ctos-web.user"

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}
export function getCachedUser(): UserInfo | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as UserInfo } catch { return null }
}
export function setCachedUser(user: UserInfo) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}
// 事件名稱：session 被清掉時廣播，讓 AuthProvider 同步丟掉記憶體裡的 user，
// 避免「token 已清但 user 還留著」造成登入頁與 RequireAuth 互踢的重導迴圈。
export const SESSION_CLEARED_EVENT = "ctos:session-cleared"

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_CLEARED_EVENT))
}
