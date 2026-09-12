import { ApiError, API_BASE, apiFetch } from "./api"
import { clearSession, getToken } from "./token"

export type Platform = "line" | "telegram"

export interface PlatformBindingStatus {
  is_bound: boolean
  display_name: string | null
  picture_url: string | null
  bound_at: string | null
}

export interface BindingStatus {
  is_bound: boolean
  line_display_name: string | null
  line_picture_url: string | null
  bound_at: string | null
  line: PlatformBindingStatus | null
  telegram: PlatformBindingStatus | null
}

export interface BindingCode {
  code: string
  expires_at: string
}

export interface BotGroup {
  id: string
  platform_type: Platform
  platform_group_id: string
  name: string | null
  picture_url: string | null
  member_count: number | null
  project_id: string | null
  project_name: string | null
  is_active: boolean
  allow_ai_response: boolean
  joined_at: string | null
  left_at: string | null
  created_at: string
  updated_at: string
}

export interface BotUser {
  id: string
  platform_type: Platform
  platform_user_id: string
  display_name: string | null
  picture_url: string | null
  status_message: string | null
  language: string | null
  user_id: number | null
  is_friend: boolean
  created_at: string
  updated_at: string
  bound_username: string | null
  bound_display_name: string | null
  is_blocked: boolean
  blocked_at: string | null
  blocked_reason: string | null
}

export interface BotMessage {
  id: string
  message_id: string
  bot_user_id: string | null
  user_display_name: string | null
  user_picture_url: string | null
  bot_group_id: string | null
  message_type: string
  content: string | null
  file_id: string | null
  file_info: Record<string, unknown> | null
  is_from_bot: boolean
  ai_processed: boolean
  created_at: string
}

export interface BotFile {
  id: string
  message_id: string | null
  file_type: string
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  nas_path: string | null
  thumbnail_path: string | null
  duration: number | null
  created_at: string
  bot_group_id: string | null
  bot_user_id: string | null
  user_display_name: string | null
  group_name: string | null
}

export interface BotGroupListResponse {
  items: BotGroup[]
  total: number
}

export interface BotUserListResponse {
  items: BotUser[]
  total: number
}

export interface BotMessageListResponse {
  items: BotMessage[]
  total: number
  page: number
  page_size: number
}

export interface BotFileListResponse {
  items: BotFile[]
  total: number
}

// offset 型分頁（groups／users／blocklist 共用）：limit 固定、offset=(page-1)*limit，platform 空值略過。
export interface ListFilter {
  platform?: Platform | ""
  page: number
}

export interface MessageFilter {
  platform?: Platform | ""
  page: number
  groupId?: string
  userId?: string
  // 預設 50；群組明細的「最近訊息」用 20（GET /api/bot/messages?group_id={id}&page=1&page_size=20）。
  pageSize?: number
}

export interface FileFilter {
  platform?: Platform | ""
  page: number
  fileType?: string
  groupId?: string
}

// 群組明細的檔案分頁：群組在路徑上，只剩頁碼與類型。
export interface GroupFileFilter {
  page: number
  fileType?: string
}

export interface GroupPatch {
  allow_ai_response?: boolean
  name?: string
  is_active?: boolean
  project_id?: string | null
}

/** 檔案類型篩選的選項（後端 `file_type` 的四個值，檔案分頁與群組檔案分頁共用）。 */
export const FILE_TYPE_OPTIONS = [
  { value: "image", label: "圖片" },
  { value: "video", label: "影片" },
  { value: "audio", label: "音訊" },
  { value: "file", label: "檔案" },
] as const

export const PLATFORM_LABEL = { line: "Line", telegram: "Telegram" } as const satisfies Record<Platform, string>
export function platformLabel(p: Platform): string {
  return PLATFORM_LABEL[p]
}

function offsetQuery(limit: number, f: ListFilter): string {
  const params = new URLSearchParams()
  params.set("limit", String(limit))
  params.set("offset", String((f.page - 1) * limit))
  if (f.platform) params.set("platform_type", f.platform)
  return params.toString()
}

// ── 綁定 ──────────────────────────────────────────────

export function getBindingStatus(): Promise<BindingStatus> {
  return apiFetch<BindingStatus>("/api/bot/binding/status")
}

export function generateBindingCode(platform: Platform): Promise<BindingCode> {
  return apiFetch<BindingCode>(`/api/bot/binding/generate-code?platform_type=${platform}`, { method: "POST" })
}

export async function unbind(platform: Platform): Promise<void> {
  await apiFetch<unknown>(`/api/bot/binding?platform_type=${platform}`, { method: "DELETE" })
}

// ── 群組 ──────────────────────────────────────────────

export function listGroups(f: ListFilter): Promise<BotGroupListResponse> {
  return apiFetch<BotGroupListResponse>(`/api/bot/groups?${offsetQuery(20, f)}`)
}

export function getGroup(id: string): Promise<BotGroup> {
  return apiFetch<BotGroup>(`/api/bot/groups/${id}`)
}

export function updateGroup(id: string, patch: GroupPatch): Promise<BotGroup> {
  return apiFetch<BotGroup>(`/api/bot/groups/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
}

export async function deleteGroup(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/bot/groups/${id}`, { method: "DELETE" })
}

export async function bindGroupProject(groupId: string, projectId: string): Promise<void> {
  await apiFetch<unknown>(`/api/bot/groups/${groupId}/bind-project`, {
    method: "POST",
    body: JSON.stringify({ project_id: projectId }),
  })
}

export async function unbindGroupProject(groupId: string): Promise<void> {
  await apiFetch<unknown>(`/api/bot/groups/${groupId}/bind-project`, { method: "DELETE" })
}

// ── 使用者 ────────────────────────────────────────────

export function listUsersWithBinding(f: ListFilter): Promise<BotUserListResponse> {
  return apiFetch<BotUserListResponse>(`/api/bot/users-with-binding?${offsetQuery(20, f)}`)
}

/**
 * 單一使用者明細（`api/linebot_router.py` 699–709）。回的是與清單同一個
 * `LineUserResponse`，但服務層 `services/bot_line/admin.py` 193–206 是
 * `SELECT * FROM bot_users`，沒有 JOIN users，所以 `bound_username` 與
 * `bound_display_name` 一律是 model 預設的 null——綁定與否只能看 `user_id`。
 * 找不到回 404，detail 是 `User not found`。
 */
export function getUser(id: string): Promise<BotUser> {
  return apiFetch<BotUser>(`/api/bot/users/${id}`)
}

export function listBlockedUsers(f: ListFilter): Promise<BotUserListResponse> {
  const params = new URLSearchParams()
  params.set("blocked", "true")
  params.set("limit", "20")
  params.set("offset", String((f.page - 1) * 20))
  if (f.platform) params.set("platform_type", f.platform)
  return apiFetch<BotUserListResponse>(`/api/bot/users?${params.toString()}`)
}

export function blockUser(id: string, reason: string | null): Promise<BotUser> {
  return apiFetch<BotUser>(`/api/bot/users/${id}/block`, { method: "PATCH", body: JSON.stringify({ reason }) })
}

export function unblockUser(id: string): Promise<BotUser> {
  return apiFetch<BotUser>(`/api/bot/users/${id}/unblock`, { method: "PATCH" })
}

// ── 訊息 ──────────────────────────────────────────────

export function listMessages(f: MessageFilter): Promise<BotMessageListResponse> {
  const params = new URLSearchParams()
  if (f.groupId) params.set("group_id", f.groupId)
  if (f.userId) params.set("user_id", f.userId)
  params.set("page", String(f.page))
  params.set("page_size", String(f.pageSize ?? 50))
  if (f.platform) params.set("platform_type", f.platform)
  return apiFetch<BotMessageListResponse>(`/api/bot/messages?${params.toString()}`)
}

// ── 檔案 ──────────────────────────────────────────────

export function listFiles(f: FileFilter): Promise<BotFileListResponse> {
  const params = new URLSearchParams()
  params.set("page", String(f.page))
  params.set("page_size", "30")
  if (f.platform) params.set("platform_type", f.platform)
  if (f.fileType) params.set("file_type", f.fileType)
  if (f.groupId) params.set("group_id", f.groupId)
  return apiFetch<BotFileListResponse>(`/api/bot/files?${params.toString()}`)
}

/**
 * 群組檔案（`api/linebot_router.py` 773–799）。與 `GET /api/bot/files?group_id=…`
 * 走的是同一支 `list_files`（`services/bot_line/file_handler.py` 348–424）與同一個
 * `LineFileListResponse`，只是專用端點把 group 放在路徑上，也不收 `user_id` 與
 * `platform_type`——群組本身就決定了平台，所以在這個畫面上兩者等價。
 * `page_size` 後端預設 50，這裡照畫面固定 30。
 */
export function listGroupFiles(groupId: string, f: GroupFileFilter): Promise<BotFileListResponse> {
  const params = new URLSearchParams()
  params.set("page", String(f.page))
  params.set("page_size", "30")
  if (f.fileType) params.set("file_type", f.fileType)
  return apiFetch<BotFileListResponse>(`/api/bot/groups/${groupId}/files?${params.toString()}`)
}

export async function deleteFile(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/bot/files/${id}`, { method: "DELETE" })
}

// 下載認證：`api_download_file` 的 dependency 是 `get_current_session`（純 `Authorization` header，
// 不吃 query token），不是 `get_session_from_token_or_query`，所以不能用 `?token=` 的 <a> 連結，
// 改用 fetch 帶 Bearer header 取 Blob，交給呼叫端 URL.createObjectURL 觸發下載。
export async function downloadFile(id: string): Promise<Blob> {
  const token = getToken()
  const headers = new Headers()
  if (token) headers.set("Authorization", `Bearer ${token}`)
  const res = await fetch(`${API_BASE}/api/bot/files/${id}/download`, { headers })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const data = (await res.json()) as { detail?: unknown }
      if (typeof data.detail === "string") detail = data.detail
    } catch { /* 非 JSON 回應 */ }
    if (res.status === 401) clearSession()
    throw new ApiError(res.status, detail)
  }
  return res.blob()
}

export const botKeys = {
  all: ["bot"] as const,
  binding: ["bot", "binding"] as const,
  groups: (f: ListFilter) => ["bot", "groups", f] as const,
  group: (id: string) => ["bot", "group", id] as const,
  users: (f: ListFilter) => ["bot", "users", f] as const,
  user: (id: string) => ["bot", "user", id] as const,
  blocked: (f: ListFilter) => ["bot", "blocked", f] as const,
  messages: (f: MessageFilter) => ["bot", "messages", f] as const,
  files: (f: FileFilter) => ["bot", "files", f] as const,
  groupFiles: (groupId: string, f: GroupFileFilter) => ["bot", "files", "group", groupId, f] as const,
}

/** 檔案顯示名稱：沒有檔名就用類型＋id 前 8 碼 */
export function fileDisplayName(f: BotFile): string {
  return f.file_name || `${f.file_type}_${f.id.slice(0, 8)}`
}
