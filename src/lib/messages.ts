import { apiFetch } from "./api"
// 日期邊界的轉法與 AI Log 完全相同（本地日 00:00／23:59:59.999 轉 ISO），
// 沿用同一支避免兩處各寫一遍又各錯一次；它的時區行為有 ai-log.test.ts 釘住。
import { toDayEnd, toDayStart } from "./ai-log"

/** `MessageSeverity`（ching-tech-os models/message.py 10–17）。 */
export type MessageSeverity = "debug" | "info" | "warning" | "error" | "critical"
/** `MessageSource`（ching-tech-os models/message.py 20–26）。 */
export type MessageSource = "system" | "security" | "app" | "user"

/** `MessageListItem`（ching-tech-os models/message.py 58–67）。 */
export interface MessageListItem {
  id: number
  created_at: string
  severity: MessageSeverity
  source: MessageSource
  category: string | null
  title: string
  is_read: boolean
}

/** `MessageListResponse`（ching-tech-os models/message.py 70–77）。 */
export interface MessageListResponse {
  items: MessageListItem[]
  total: number
  page: number
  limit: number
  total_pages: number
}

/** `MessageResponse`（ching-tech-os models/message.py 42–55）。 */
export interface Message {
  id: number
  created_at: string
  severity: MessageSeverity
  source: MessageSource
  category: string | null
  title: string
  content: string | null
  metadata: Record<string, unknown> | null
  user_id: number | null
  session_id: string | null
  is_read: boolean
}

/** `UnreadCountResponse`（ching-tech-os models/message.py 97–100）。 */
export interface UnreadCountResponse {
  count: number
}

/** `MarkReadResponse`（ching-tech-os models/message.py 110–113）。 */
export interface MarkReadResponse {
  marked_count: number
}

/** `MarkReadRequest`（ching-tech-os models/message.py 103–107）。 */
export interface MarkReadRequest {
  ids?: number[]
  all?: boolean
}

export interface MessageFilters {
  severity?: MessageSeverity[]
  source?: MessageSource[]
  category?: string
  search?: string
  /** 已讀狀態；undefined 代表不篩。 */
  isRead?: boolean
  /** 起日，`YYYY-MM-DD`（本地時區）。 */
  from?: string
  /** 迄日，`YYYY-MM-DD`（本地時區）。 */
  to?: string
  page?: number
}

export const SEVERITY_ORDER: MessageSeverity[] = ["debug", "info", "warning", "error", "critical"]
export const SOURCE_ORDER: MessageSource[] = ["system", "security", "app", "user"]

export const SEVERITY_LABEL: Record<MessageSeverity, string> = {
  debug: "除錯",
  info: "資訊",
  warning: "警告",
  error: "錯誤",
  critical: "嚴重",
}

export const SOURCE_LABEL: Record<MessageSource, string> = {
  system: "系統",
  security: "安全",
  app: "應用程式",
  user: "使用者",
}

/** 嚴重程度的配色；一律搭 Badge 的 tint 版型，只換文字色。 */
export const SEVERITY_CLASS: Record<MessageSeverity, string> = {
  debug: "text-muted-foreground",
  info: "text-sky-600 dark:text-sky-400",
  warning: "text-amber-600 dark:text-amber-400",
  error: "text-destructive",
  critical: "bg-destructive/10 font-semibold text-destructive",
}

export function isSeverity(v: string): v is MessageSeverity {
  return (SEVERITY_ORDER as string[]).includes(v)
}

export function isSource(v: string): v is MessageSource {
  return (SOURCE_ORDER as string[]).includes(v)
}

export function severityLabel(s: MessageSeverity | string): string {
  return isSeverity(s) ? SEVERITY_LABEL[s] : s
}

export function sourceLabel(s: MessageSource | string): string {
  return isSource(s) ? SOURCE_LABEL[s] : s
}

export const MESSAGE_PAGE_SIZE = 20

/**
 * 組清單查詢字串。`severity` 與 `source` 是陣列參數，後端用
 * `list[MessageSeverity] | None = Query(None)` 收（api/messages.py 35–36），
 * 所以同名重複帶，不能逗號串起來。
 */
export function buildMessageQuery(f: MessageFilters, limit = MESSAGE_PAGE_SIZE): string {
  const params = new URLSearchParams()
  for (const s of f.severity ?? []) params.append("severity", s)
  for (const s of f.source ?? []) params.append("source", s)
  if (f.category) params.set("category", f.category)
  if (f.search) params.set("search", f.search)
  if (f.isRead !== undefined) params.set("is_read", String(f.isRead))
  if (f.from) params.set("start_date", toDayStart(f.from))
  if (f.to) params.set("end_date", toDayEnd(f.to))
  params.set("page", String(f.page ?? 1))
  params.set("limit", String(limit))
  return `?${params.toString()}`
}

export function listMessages(f: MessageFilters, limit = MESSAGE_PAGE_SIZE): Promise<MessageListResponse> {
  return apiFetch<MessageListResponse>(`/api/messages${buildMessageQuery(f, limit)}`)
}

export function getMessage(id: number): Promise<Message> {
  return apiFetch<Message>(`/api/messages/${id}`)
}

export function getUnreadCount(): Promise<UnreadCountResponse> {
  return apiFetch<UnreadCountResponse>("/api/messages/unread-count")
}

export function markRead(body: MarkReadRequest): Promise<MarkReadResponse> {
  return apiFetch<MarkReadResponse>("/api/messages/mark-read", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export const messageKeys = {
  all: ["messages"] as const,
  list: (f: MessageFilters) => ["messages", "list", f] as const,
  detail: (id: number) => ["messages", "detail", id] as const,
  unreadCount: ["messages", "unread-count"] as const,
}
