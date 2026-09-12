import { apiFetch } from "./api"
import type { ShareLink } from "./types"

/**
 * 分享連結管理（列出與撤銷）。契約對 ching-tech-os：
 * `api/share.py` 135–166（`GET /api/share`）、169–199（`DELETE /api/share/{token}`）、
 * `models/share.py` 22–42（`ShareLinkResponse`／`ShareLinkListResponse`）、
 * `services/share.py` 549–600（`list_my_links`）、602–647（`list_all_links`）、649–676（`revoke_link`）。
 *
 * 建立在這裡沒有：知識庫（`kb.ts` 的 `createShareLink`）與檔案管理（`nas.ts` 的
 * `createNasShareLink`）各自有建立對話框，這一頁只管列出與撤銷。
 *
 * **權限**：`POST /api/share` 才掛 `require_app_permission("share-manager")`（`api/share.py` 58）；
 * `GET`／`DELETE` 只掛 `get_current_session`（142、176），登入就打得到。
 * 這一頁的 `share-manager` 閘門因此只在前端（`routes.tsx` 的 `RequireApp`），
 * 後端沒有第二道；撤銷本身另有建立者／管理員檢查（`services/share.py` 668–670）。
 */

/** `resource_type` 的五種值（`models/share.py` 11 的 Literal）。 */
export const SHARE_RESOURCE_TYPES = [
  "knowledge",
  "project",
  "nas_file",
  "project_attachment",
  "content",
] as const

export type ShareResourceType = (typeof SHARE_RESOURCE_TYPES)[number]

/**
 * `ShareLinkResponse`（`models/share.py` 22–37）。
 * `types.ts` 的 `ShareLink` 是建立時用得到的那幾欄，清單多回這些。
 *
 * `password` 只在建立時回傳（`services/share.py` 546），清單不給，所以這裡沒有。
 */
export interface ShareLinkInfo extends ShareLink {
  /** ISO 時間字串；null＝永久（`models/share.py` 29）。 */
  expires_at: string | null
  access_count: number
  created_at: string
  /** 建立者帳號；`list_my_links`／`list_all_links` 都會帶（`services/share.py` 596、649）。 */
  created_by: string | null
  /** 後端拿 `expires_at` 跟當下時間比出來的（`services/share.py` 578–581）。 */
  is_expired: boolean
  has_password: boolean
}

/** `ShareLinkListResponse`（`models/share.py` 40–44）。`is_admin` 由路由設定（`api/share.py` 161）。 */
export interface ShareLinkListResponse {
  links: ShareLinkInfo[]
  is_admin: boolean
}

/** 清單檢視範圍。`all` 只有管理員有效，非管理員送 `all` 後端一樣只回自己的（`api/share.py` 155–159）。 */
export type ShareView = "mine" | "all"

export function listShareLinks(view: ShareView = "mine"): Promise<ShareLinkListResponse> {
  return apiFetch<ShareLinkListResponse>(`/api/share?view=${view}`)
}

/** 成功是 204 無內容（`api/share.py` 171）；404 的 detail 是「連結不存在」，403 是「您沒有權限撤銷此連結」。 */
export function revokeShareLink(token: string): Promise<void> {
  return apiFetch<void>(`/api/share/${encodeURIComponent(token)}`, { method: "DELETE" })
}

/** 資源類型的中文名（後端沒有這份對照表，`modules.py` 只有 app 名稱）。 */
export const SHARE_RESOURCE_TYPE_LABEL: Record<string, string> = {
  knowledge: "知識庫",
  project: "專案",
  nas_file: "檔案",
  project_attachment: "專案附件",
  content: "內容",
}

export function shareResourceTypeLabel(type: string): string {
  return SHARE_RESOURCE_TYPE_LABEL[type] ?? type
}

/**
 * 資源在這個前端的連結；沒有對應頁面的回 null。
 *
 * `nas_file` 的檔案要有 NAS 連線才打得開，檔案頁也不吃「單一檔案」的網址，所以不連；
 * `project_attachment` 與 `content` 本來就沒有落點。
 */
export function shareResourceHref(link: Pick<ShareLinkInfo, "resource_type" | "resource_id">): string | null {
  if (!link.resource_id) return null
  if (link.resource_type === "knowledge") return `/kb/${link.resource_id}`
  if (link.resource_type === "project") return `/projects/${link.resource_id}`
  return null
}

/**
 * 清單要顯示的標題。
 *
 * `nas_file` 顯示路徑（`resource_id`）而不是 `resource_title`：後端的 `get_resource_title`
 * 對 nas_file 只回檔名（`services/share.py` 423–426），同名檔案分不出來。
 * `project`／`project_attachment` 後端沒有實作標題，一律回「未知資源」
 * （`services/share.py` 430–431），這裡就照後端顯示，不自己編。
 * 原始資源被刪掉時後端回「（已刪除）」（`services/share.py` 573）。
 */
export function shareLinkTitle(link: Pick<ShareLinkInfo, "resource_type" | "resource_id" | "resource_title">): string {
  if (link.resource_type === "nas_file") return link.resource_id || link.resource_title
  return link.resource_title
}

export const shareKeys = {
  all: ["shares"] as const,
  list: (view: ShareView) => ["shares", "list", view] as const,
}
