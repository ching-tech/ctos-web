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

export async function apiFetch<T>(path: string, init: RequestInit & { keepSessionOn401?: boolean } = {}): Promise<T> {
  const { keepSessionOn401, ...rest } = init
  const headers = new Headers(rest.headers)
  if (!headers.has("Content-Type") && typeof rest.body === "string") headers.set("Content-Type", "application/json")
  const token = getToken()
  if (token) headers.set("Authorization", `Bearer ${token}`)

  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers })
  if (res.status === 204) return undefined as T
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const data = (await res.json()) as { detail?: unknown; error?: unknown }
      if (typeof data.detail === "string") detail = data.detail
      // FastAPI 的 422 會把 detail 給成驗證錯誤陣列（每筆有 msg），不是字串；
      // 攤成可讀的一行，否則使用者只看得到「HTTP 422」。
      else if (Array.isArray(data.detail)) {
        const msgs = data.detail
          .map((e) => (typeof e === "object" && e !== null && "msg" in e ? String((e as { msg: unknown }).msg) : ""))
          .filter(Boolean)
        if (msgs.length > 0) detail = msgs.join("；")
      } else if (typeof data.error === "string") detail = data.error
    } catch { /* 非 JSON 回應 */ }
    if (res.status === 401 && !keepSessionOn401) clearSession()
    throw new ApiError(res.status, detail)
  }
  return (await res.json()) as T
}
