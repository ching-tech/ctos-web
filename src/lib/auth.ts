import { apiFetch } from "./api"
import { clearSession, setToken } from "./token"
import type {
  ChangePasswordBody,
  ChangePasswordResponse,
  LoginMethod,
  LoginResponse,
  NasBindingResponse,
  UserInfo,
} from "./types"

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

/**
 * 變更或首次設定平台密碼（`POST /api/auth/change-password`，api/auth.py 566–631）。
 *
 * 這支端點**失敗也回 200**，只有 body 的 `success` 與 `error` 會變（目前密碼錯、
 * 沒帶目前密碼、強度不足都是這樣），所以呼叫端不能只看有沒有 throw。
 * 成功後後端會把 `must_change_password` 清掉（services/user.py 87–115）。
 */
export function changePassword(body: ChangePasswordBody): Promise<ChangePasswordResponse> {
  return apiFetch<ChangePasswordResponse>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify(body),
  })
}
