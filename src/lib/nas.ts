import * as React from "react"
import { API_BASE, ApiError } from "./api"
import { clearSession, getToken } from "./token"

// 型別一律對齊後端 `api/nas.py`（連線相關的 model 在檔頭 46–80 行）與 `models/nas.py`，不自己猜欄位。
//
// 三個後端契約細節值得記著：
// 1. `POST /api/nas/connect` 帳密錯誤時回的是 **200 加 `{success:false, error}`**（api/nas.py 104–108 行的
//    `except SMBAuthError`），不是 401；只有連不到 NAS 才是 503。docstring 上寫的 401 沒有實作。
// 2. NAS 連線問題一律回 401，帶 `X-NAS-Required`（沒連線）或 `X-NAS-Token-Expired`（過期）header。
//    但後端 `main.py` 的 CORSMiddleware 沒有設 `expose_headers`，跨網域部署時瀏覽器讀不到這兩個 header，
//    所以這裡另外用後端寫死的兩句 detail 當退路（見 `needsReconnect`）。
// 3. `GET /api/nas/browse?path=/` 會回 400（`_parse_path` 不接受空路徑）；根目錄要改打 `/api/nas/shares`。
//    `GET /api/nas/search` 同理，在根目錄不能用。

/** 連線對話框的 host 預設值。後端 `settings.nas_host` 沒有端點可拿，用環境變數帶。 */
export const NAS_HOST_DEFAULT: string = import.meta.env.VITE_NAS_HOST ?? ""

export interface NasConnectionInfo {
  token: string
  host: string
  username: string
  created_at: string
  expires_at: string
  last_used_at: string
}

export interface NasConnectResponse {
  success: boolean
  token: string | null
  error: string | null
  host: string | null
}

export interface NasShare {
  name: string
  type: string
}

export type NasItemType = "file" | "directory"

export interface NasItem {
  name: string
  type: NasItemType
  size: number | null
  modified: string | null
}

export interface NasBrowseResponse {
  path: string
  items: NasItem[]
}

export interface NasSearchItem {
  name: string
  path: string
  type: NasItemType
}

export interface NasSearchResponse {
  query: string
  path: string
  results: NasSearchItem[]
  total: number
}

// ============================================================
// 連線狀態（只放記憶體：token 30 分鐘就過期，不進 localStorage）
// ============================================================

export interface NasConnection {
  token: string
  host: string
  username: string
}

let connection: NasConnection | null = null
const listeners = new Set<() => void>()

export function getNasConnection(): NasConnection | null {
  return connection
}

export function setNasConnection(next: NasConnection | null) {
  connection = next
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 元件訂閱連線狀態；連線是模組層級的狀態（fetch 包裝層也要拿），所以不放 context。 */
export function useNasConnection(): NasConnection | null {
  return React.useSyncExternalStore(subscribe, getNasConnection, () => null)
}

/**
 * 缺連線或連線過期時要跑的補救流程（頁面註冊：開連線對話框，回傳新連線或 null）。
 * 有補救成功才會把原請求重試一次。
 */
export type NasReconnect = () => Promise<NasConnection | null>

let reconnectHandler: NasReconnect | null = null
let reconnectInFlight: Promise<NasConnection | null> | null = null

export function setNasReconnectHandler(fn: NasReconnect | null) {
  reconnectHandler = fn
  if (!fn) reconnectInFlight = null
}

/**
 * 同一波過期只問一次。
 *
 * token 是 30 分鐘到期的，過期那一刻很可能同時有好幾支請求在跑（清單重抓、預覽、下載）。
 * 每支都各自呼叫一次重連流程的話，使用者會看到對話框被重開好幾次，頁面那邊也得記住一整排
 * 等著被喚醒的請求。這裡讓後到的請求共用同一個 promise，連好之後全部各自重試自己的原請求。
 */
function requestReconnect(): Promise<NasConnection | null> {
  if (!reconnectHandler) return Promise.resolve(null)
  if (!reconnectInFlight) {
    reconnectInFlight = reconnectHandler().finally(() => {
      reconnectInFlight = null
    })
  }
  return reconnectInFlight
}

// ============================================================
// fetch 包裝層
// ============================================================

/** 後端 `get_nas_connection`／`get_nas_connection_with_query` 在缺連線與過期時寫死的兩句 detail。 */
const RECONNECT_DETAILS = ["請先連線 NAS", "NAS 連線已過期，請重新連線"]

async function errorDetail(res: Response): Promise<string> {
  let detail = `HTTP ${res.status}`
  try {
    const data = (await res.json()) as { detail?: unknown; error?: unknown }
    if (typeof data.detail === "string") detail = data.detail
    else if (Array.isArray(data.detail)) {
      const msgs = data.detail
        .map((e) => (typeof e === "object" && e !== null && "msg" in e ? String((e as { msg: unknown }).msg) : ""))
        .filter(Boolean)
      if (msgs.length > 0) detail = msgs.join("；")
    } else if (typeof data.error === "string") detail = data.error
  } catch { /* 非 JSON 回應 */ }
  return detail
}

/**
 * 判斷這個 4xx 是不是「要重新連線 NAS」。
 *
 * 優先讀 header；跨網域讀不到 header 時（後端沒設 `expose_headers`）退回比對 detail。
 * session 過期的 401 detail 是「未授權，請重新登入」（`api/auth.py` 88–91 行），不會被誤判成 NAS 問題，
 * 所以 NAS 連線壞掉不會把使用者踢出登入。
 */
function needsReconnect(res: Response, detail: string): boolean {
  if (res.headers.get("X-NAS-Required") === "true") return true
  if (res.headers.get("X-NAS-Token-Expired") === "true") return true
  return res.status === 401 && RECONNECT_DETAILS.includes(detail)
}

async function nasFetch(path: string, init: RequestInit = {}, allowRetry = true): Promise<Response> {
  const headers = new Headers(init.headers)
  if (!headers.has("Content-Type") && typeof init.body === "string") headers.set("Content-Type", "application/json")
  const token = getToken()
  if (token) headers.set("Authorization", `Bearer ${token}`)
  const conn = getNasConnection()
  if (conn) headers.set("X-NAS-Token", conn.token)

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (res.ok) return res

  const detail = await errorDetail(res)
  if (needsReconnect(res, detail)) {
    setNasConnection(null)
    if (allowRetry && reconnectHandler) {
      const next = await requestReconnect()
      if (next) return nasFetch(path, init, false)
    }
    throw new ApiError(res.status, detail)
  }
  // NAS 以外的 401（session 過期）照既有規則清掉 session。
  if (res.status === 401) clearSession()
  throw new ApiError(res.status, detail)
}

async function nasJson<T>(path: string, init: RequestInit = {}, allowRetry = true): Promise<T> {
  const res = await nasFetch(path, init, allowRetry)
  return (await res.json()) as T
}

// ============================================================
// 端點
// ============================================================

/** 建立連線。帳密錯誤時後端回 200 加 `{success:false, error}`，連不到 NAS 才是 503（會丟 ApiError）。 */
export function connectNas(body: { host: string; username: string; password: string }): Promise<NasConnectResponse> {
  return nasJson<NasConnectResponse>("/api/nas/connect", { method: "POST", body: JSON.stringify(body) }, false)
}

/**
 * 挑一條還能用的連線。
 *
 * 後端的 `get_user_connections`（`services/nas_connection.py` 219–239）只照 `user_id` 過濾，
 * **不會把過期的剔掉**，直接沿用第一筆可能拿到已經死掉的 token。`expires_at` 是後端
 * `datetime.now()` 的 isoformat（沒有時區），JS 會照本地時間解析。
 */
export function usableConnection(list: NasConnectionInfo[], now: number = Date.now()): NasConnectionInfo | null {
  return (
    list.find((c) => {
      const expires = new Date(c.expires_at).getTime()
      return Number.isNaN(expires) || expires > now
    }) ?? null
  )
}

/** 進頁面先打這支：有現成連線就沿用第一筆還沒過期的，讓人不用每次重輸密碼。 */
export async function listNasConnections(): Promise<NasConnectionInfo[]> {
  const data = await nasJson<{ connections: NasConnectionInfo[] }>("/api/nas/connections", {}, false)
  return data.connections
}

export async function disconnectNas(): Promise<void> {
  await nasFetch("/api/nas/disconnect", { method: "DELETE" }, false)
}

export async function listShares(): Promise<NasShare[]> {
  const data = await nasJson<{ shares: NasShare[] }>("/api/nas/shares")
  return data.shares
}

export function browseNas(path: string): Promise<NasBrowseResponse> {
  return nasJson<NasBrowseResponse>(`/api/nas/browse?path=${encodeURIComponent(path)}`)
}

export function searchNas(
  path: string,
  query: string,
  opts: { maxDepth?: number; maxResults?: number } = {},
): Promise<NasSearchResponse> {
  const params = new URLSearchParams({ path, query })
  params.set("max_depth", String(opts.maxDepth ?? 3))
  params.set("max_results", String(opts.maxResults ?? 100))
  return nasJson<NasSearchResponse>(`/api/nas/search?${params.toString()}`)
}

/**
 * 讀檔內容（預覽用）。
 *
 * `GET /api/nas/file` 也吃 `?nas_token=`，但這裡一律走 header 拿 blob 再給 object URL：
 * token 不進網址與瀏覽紀錄，而且過期重連的攔截與重試跟其他端點同一條路。
 */
export async function readNasFile(path: string): Promise<Blob> {
  const res = await nasFetch(`/api/nas/file?path=${encodeURIComponent(path)}`)
  return res.blob()
}

export async function readNasText(path: string): Promise<string> {
  const res = await nasFetch(`/api/nas/file?path=${encodeURIComponent(path)}`)
  return res.text()
}

/** 下載：同樣走 header 取 blob（與 Bot 檔案分頁同一個做法），呼叫端自己 createObjectURL 觸發存檔。 */
export async function downloadNasFile(path: string): Promise<Blob> {
  const res = await nasFetch(`/api/nas/download?path=${encodeURIComponent(path)}`)
  return res.blob()
}

// ============================================================
// 路徑與顯示工具
// ============================================================

export const NAS_ROOT = "/"

export function isRoot(path: string): boolean {
  return path.replace(/\/+$/, "") === ""
}

export function normalizePath(path: string | null | undefined): string {
  if (!path) return NAS_ROOT
  const trimmed = path.replace(/\/+$/, "")
  if (!trimmed) return NAS_ROOT
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
}

export function joinPath(dir: string, name: string): string {
  return isRoot(dir) ? `/${name}` : `${normalizePath(dir)}/${name}`
}

export function parentPath(path: string): string {
  const p = normalizePath(path)
  if (isRoot(p)) return NAS_ROOT
  const idx = p.lastIndexOf("/")
  return idx <= 0 ? NAS_ROOT : p.slice(0, idx)
}

/** 麵包屑：根目錄之後每一段都可點。 */
export function breadcrumbs(path: string): { name: string; path: string }[] {
  const p = normalizePath(path)
  if (isRoot(p)) return []
  const segs = p.slice(1).split("/")
  return segs.map((name, i) => ({ name, path: `/${segs.slice(0, i + 1).join("/")}` }))
}

/**
 * 搜尋結果的 path 接回 share 名稱。
 *
 * `services/smb.py` 的 `search_files` 用 `base_path`（= 搜尋起點的 sub_path）拼結果路徑，
 * **不含 share 名稱**：在 `/共用區/在案` 底下搜到的檔案回的是 `/在案/x.pdf`。
 * 直接拿去 browse 會找不到，要把搜尋起點的第一段接回去。
 */
export function searchResultPath(searchPath: string, resultPath: string): string {
  const share = normalizePath(searchPath).slice(1).split("/")[0]
  const rest = resultPath.startsWith("/") ? resultPath : `/${resultPath}`
  return share ? `/${share}${rest}` : rest
}

export function formatSize(bytes: number | null): string {
  if (bytes == null) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

/**
 * 修改時間。後端給的是 SMB 的 `last_write_time` 轉成的 **naive** isoformat
 * （`services/smb.py` 315 行，沒有時區），JS 會照本地時間解析，直接照本地時間顯示。
 */
export function formatModified(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i
const PDF_EXT = /\.pdf$/i
const TEXT_EXT = /\.(txt|md|csv|json|log)$/i

export type NasPreviewKind = "image" | "pdf" | "text" | "none"

/** 能預覽的三類；其餘只提供下載。 */
export function previewKind(name: string): NasPreviewKind {
  if (IMAGE_EXT.test(name)) return "image"
  if (PDF_EXT.test(name)) return "pdf"
  if (TEXT_EXT.test(name)) return "text"
  return "none"
}

/** 資料夾排前面，同類照名稱排（後端不保證順序）。 */
export function sortItems(items: NasItem[]): NasItem[] {
  return [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1
    return a.name.localeCompare(b.name, "zh-Hant")
  })
}

// 快取鍵不帶連線 token：過期重連是在 fetch 包裝層原地重試同一個請求，鍵跟著換會讓結果落在舊鍵上。
// 換連線（手動連線／中斷）時由呼叫端 invalidate `nasKeys.all`，不會吃到上一條連線的結果。
export const nasKeys = {
  all: ["nas"] as const,
  connections: ["nas", "connections"] as const,
  list: (path: string) => ["nas", "list", path] as const,
  search: (path: string, query: string) => ["nas", "search", path, query] as const,
  preview: (path: string) => ["nas", "preview", path] as const,
}
