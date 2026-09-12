import { apiFetch } from "./api"
import { NAV_ITEMS } from "./nav"

/**
 * 個人存取權杖（PAT）。契約對 ching-tech-os：
 * `api/auth.py` 472–547（建立／列表／撤銷）、`models/auth.py` 76–114、`services/api_token.py`。
 * 原始 token 只在建立時回傳一次，資料庫只存 SHA-256（`services/api_token.py` 6–10、31–38）。
 */

/** token 字串前綴（`services/api_token.py` 25）。 */
export const PAT_PREFIX = "ctos_pat_"

/** `ApiTokenInfo`（`models/auth.py` 87–97）。 */
export interface ApiTokenInfo {
  id: number
  name: string
  scopes: string[]
  read_only: boolean
  expires_at: string | null
  last_used_at: string | null
  created_at: string
}

/** `ApiTokenListResponse`（`models/auth.py` 110–114）。 */
export interface ApiTokenListResponse {
  success: boolean
  tokens: ApiTokenInfo[]
}

/** `ApiTokenCreateRequest`（`models/auth.py` 76–84）。scopes 空陣列＝使用者全部 app 權限，expires_days 為 null＝永不過期。 */
export interface CreateApiTokenBody {
  name: string
  scopes: string[]
  expires_days: number | null
  read_only: boolean
}

/** `ApiTokenCreateResponse`（`models/auth.py` 99–107）。 */
export interface ApiTokenCreateResponse {
  success: boolean
  token: string
  info: ApiTokenInfo
}

export function listApiTokens(): Promise<ApiTokenListResponse> {
  return apiFetch<ApiTokenListResponse>("/api/auth/tokens")
}

export function createApiToken(body: CreateApiTokenBody): Promise<ApiTokenCreateResponse> {
  return apiFetch<ApiTokenCreateResponse>("/api/auth/tokens", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

/** 後端回 `{"success": true}`（`api/auth.py` 546）；404 的 detail 是「token 不存在」。 */
export function revokeApiToken(id: number): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/auth/tokens/${id}`, { method: "DELETE" })
}

/**
 * app id 對到中文名稱。`/api/admin/default-permissions` 的 `app_names` 只有管理員拿得到，
 * 這裡改用側邊欄的 title 對照，對不到的就顯示原本的 id。
 */
const APP_TITLES: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.filter((i) => i.app).map((i) => [i.app as string, i.title]),
)

export function scopeLabel(app: string): string {
  return APP_TITLES[app] ?? app
}

export const apiTokenKeys = {
  all: ["api-tokens"] as const,
  list: ["api-tokens", "list"] as const,
}
