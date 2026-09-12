import { apiFetch } from "./api"
// 日期邊界的轉法沿用 AI Log 那一支（本地日 00:00／23:59:59.999 轉 ISO），
// 時區行為由 ai-log.test.ts 釘住，不在這裡再寫一遍。
import { toDayEnd, toDayStart } from "./ai-log"

/** `DeviceType`（ching-tech-os models/login_record.py 10–16）。 */
export type DeviceType = "desktop" | "mobile" | "tablet" | "unknown"

/**
 * `LoginRecordListItem`（ching-tech-os models/login_record.py 73–85）。
 * `device_type` 後端存的是字串欄位、回的型別是 `str | None`（84），
 * 不保證落在 `DeviceType` 裡，所以這裡不收斂成 enum。
 */
export interface LoginRecordListItem {
  id: number
  created_at: string
  username: string
  success: boolean
  failure_reason: string | null
  ip_address: string
  geo_country: string | null
  geo_city: string | null
  device_type: string | null
  browser: string | null
}

/** `LoginRecordListResponse`（ching-tech-os models/login_record.py 88–95）。 */
export interface LoginRecordListResponse {
  items: LoginRecordListItem[]
  total: number
  page: number
  limit: number
  total_pages: number
}

/** `RecentLoginsResponse`（ching-tech-os models/login_record.py 112–115）。 */
export interface RecentLoginsResponse {
  items: LoginRecordListItem[]
}

/**
 * `LoginRecordResponse`（ching-tech-os models/login_record.py 51–70）。
 * `geo_latitude`／`geo_longitude` 是 `Decimal | None`（64–65），pydantic v2 的 JSON
 * 模式把 Decimal 序列化成字串，所以當字串接（同 erp.ts 的數量與金額）。
 */
export interface LoginRecord {
  id: number
  created_at: string
  user_id: number | null
  username: string
  success: boolean
  failure_reason: string | null
  ip_address: string
  user_agent: string | null
  geo_country: string | null
  geo_city: string | null
  geo_latitude: string | null
  geo_longitude: string | null
  device_fingerprint: string | null
  device_type: string | null
  browser: string | null
  os: string | null
  session_id: string | null
}

/**
 * `GET /api/login-records/stats` 的回應（ching-tech-os services/login_record.py 348–355）。
 * `success_count` 與 `failure_count` 是 SQL 的 `SUM(CASE …)`（322–323、338–339），
 * 區間內一筆都沒有時 Postgres 回 NULL，所以會拿到 null 而不是 0。
 */
export interface LoginStats {
  total: number
  success_count: number | null
  failure_count: number | null
  unique_ips: number
  unique_devices: number
  days: number
}

export interface LoginRecordFilters {
  /** 非管理員一律被後端限縮成自己（api/login_records.py 25–29），前端不送。 */
  userId?: number
  /** 使用者名稱是**等值**比對（services/login_record.py 146），而且只有管理員送得出去（api/login_records.py 55）。 */
  username?: string
  /** 成功／失敗；undefined 代表不篩。 */
  success?: boolean
  /** IP 是等值比對，後端轉 `::inet`（services/login_record.py 158）。 */
  ip?: string
  /** 起日，`YYYY-MM-DD`（本地時區）。 */
  from?: string
  /** 迄日，`YYYY-MM-DD`（本地時區）。 */
  to?: string
  /** 裝置指紋，等值比對（services/login_record.py 175）。 */
  fingerprint?: string
  page?: number
}

/** 後端 `limit` 上限 100（api/login_records.py 46）。 */
export const LOGIN_RECORD_PAGE_SIZE = 20

/** 統計天數選項；後端收 1–365（api/login_records.py 95）。 */
export const STATS_DAY_OPTIONS = [7, 30, 90] as const
export const DEFAULT_STATS_DAYS = 30

export const DEVICE_TYPE_LABEL: Record<DeviceType, string> = {
  desktop: "桌機",
  mobile: "手機",
  tablet: "平板",
  unknown: "未知",
}

export function deviceTypeLabel(v: string | null): string {
  if (!v) return "—"
  return v in DEVICE_TYPE_LABEL ? DEVICE_TYPE_LABEL[v as DeviceType] : v
}

/** 組清單查詢字串；空值不帶，`success=false` 不能被 falsy 判斷吃掉。 */
export function buildLoginRecordQuery(f: LoginRecordFilters, limit = LOGIN_RECORD_PAGE_SIZE): string {
  const params = new URLSearchParams()
  if (f.userId !== undefined) params.set("user_id", String(f.userId))
  if (f.username) params.set("username", f.username)
  if (f.success !== undefined) params.set("success", String(f.success))
  if (f.ip) params.set("ip_address", f.ip)
  if (f.from) params.set("start_date", toDayStart(f.from))
  if (f.to) params.set("end_date", toDayEnd(f.to))
  if (f.fingerprint) params.set("device_fingerprint", f.fingerprint)
  params.set("page", String(f.page ?? 1))
  params.set("limit", String(limit))
  return `?${params.toString()}`
}

export function listLoginRecords(
  f: LoginRecordFilters,
  limit = LOGIN_RECORD_PAGE_SIZE,
): Promise<LoginRecordListResponse> {
  return apiFetch<LoginRecordListResponse>(`/api/login-records${buildLoginRecordQuery(f, limit)}`)
}

/** `GET /api/login-records/recent`；`limit` 上限 50（api/login_records.py 75）。 */
export function getRecentLogins(
  opts: { userId?: number; username?: string; limit?: number } = {},
): Promise<RecentLoginsResponse> {
  const params = new URLSearchParams()
  if (opts.userId !== undefined) params.set("user_id", String(opts.userId))
  if (opts.username) params.set("username", opts.username)
  if (opts.limit !== undefined) params.set("limit", String(opts.limit))
  const qs = params.toString()
  return apiFetch<RecentLoginsResponse>(`/api/login-records/recent${qs ? `?${qs}` : ""}`)
}

/** `GET /api/login-records/stats`；統計不吃清單的篩選，後端只收 `user_id` 與 `days`。 */
export function getLoginStats(opts: { userId?: number; days?: number } = {}): Promise<LoginStats> {
  const params = new URLSearchParams()
  if (opts.userId !== undefined) params.set("user_id", String(opts.userId))
  params.set("days", String(opts.days ?? DEFAULT_STATS_DAYS))
  return apiFetch<LoginStats>(`/api/login-records/stats?${params.toString()}`)
}

export function getLoginRecord(id: number): Promise<LoginRecord> {
  return apiFetch<LoginRecord>(`/api/login-records/${id}`)
}

/** 成功率；`total` 為 0 或統計還沒回來時給 null，由畫面顯示破折號。 */
export function successRate(stats: LoginStats | undefined): number | null {
  if (!stats || stats.total === 0) return null
  return ((stats.success_count ?? 0) / stats.total) * 100
}

/** 地點：國家與城市有什麼顯示什麼，都沒有給破折號。 */
export function geoLabel(r: { geo_country: string | null; geo_city: string | null }): string {
  const parts = [r.geo_country, r.geo_city].filter(Boolean)
  return parts.length > 0 ? parts.join("／") : "—"
}

export const loginRecordKeys = {
  all: ["login-records"] as const,
  list: (f: LoginRecordFilters) => ["login-records", "list", f] as const,
  stats: (days: number) => ["login-records", "stats", days] as const,
  detail: (id: number) => ["login-records", "detail", id] as const,
  recent: (opts: { userId?: number; username?: string; limit?: number }) =>
    ["login-records", "recent", opts] as const,
}
