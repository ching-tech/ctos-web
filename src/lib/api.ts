import { clearSession, getToken } from "./token"

export const API_BASE: string = (() => {
  const base = import.meta.env.VITE_API_BASE
  if (base) {
    return base.replace(/\/$/, "")
  }
  return "https://ching-tech.ddns.net/ctos"
})()

export class ApiError extends Error {
  status: number
  detail: string
  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
    this.detail = detail
    this.name = "ApiError"
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json")
  const token = getToken()
  if (token) headers.set("Authorization", `Bearer ${token}`)

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (res.status === 204) return undefined as T
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const data = (await res.json()) as { detail?: unknown; error?: unknown }
      if (typeof data.detail === "string") detail = data.detail
      else if (typeof data.error === "string") detail = data.error
    } catch { /* 非 JSON 回應 */ }
    if (res.status === 401) clearSession()
    throw new ApiError(res.status, detail)
  }
  return (await res.json()) as T
}
