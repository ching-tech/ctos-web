import { apiFetch } from "./api"
import { clearSession, setToken } from "./token"
import type { LoginMethod, LoginResponse, NasBindingResponse, UserInfo } from "./types"

export async function login(username: string, password: string, method: LoginMethod): Promise<LoginResponse> {
  const res = await apiFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password, method }),
  })
  if (res.success && res.token) setToken(res.token)
  return res
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" })
  } catch { /* 登出失敗也要清本機 */ }
  clearSession()
}

export function fetchMe(): Promise<UserInfo> {
  return apiFetch<UserInfo>("/api/user/me")
}

export function bindNas(nas_username: string, password: string): Promise<NasBindingResponse> {
  return apiFetch<NasBindingResponse>("/api/user/me/nas-binding", {
    method: "POST",
    body: JSON.stringify({ nas_username, password }),
    // NAS 帳密錯誤時這支端點回 401，那是 NAS 憑證錯誤，不是平台登入失效，不應清掉本機 session。
    keepSessionOn401: true,
  })
}

export function unbindNas(): Promise<NasBindingResponse> {
  return apiFetch<NasBindingResponse>("/api/user/me/nas-binding", { method: "DELETE" })
}
