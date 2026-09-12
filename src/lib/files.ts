import { API_BASE, ApiError, apiFetch, withToken } from "./api"
import { getToken } from "./token"

// 型別對齊後端 `models/files.py` 的 `DirectoryListResponse`／`DirectoryFile`（8–23 行），
// 端點行為對齊 `api/files.py`：48–56 zone 驗證、234–276 `_read_file_content`、290–353 list、
// 356–390 download、393–430 讀檔；掛載對應看 `services/path_manager.py` 74–84。
//
// 這組端點**只有讀**：沒有上傳、改名、刪除、建資料夾，畫面上不要出現寫入動作。
// 認證走 `api/auth.py` 96–110 的 `get_session_from_token_or_query`（header 或 `?token=`），
// 沒有 app 閘：後端只檢查有沒有登入，`file-manager` 是前端自己沿用 `/files` 的 `RequireApp`。

/** 本機儲存區。`nas` 也是後端的 zone，但它走 SMB，列目錄會被擋（400），畫面上另外一條路。 */
export const LOCAL_ZONES = ["ctos", "shared", "temp", "local"] as const

export type LocalZone = (typeof LOCAL_ZONES)[number]

export type FilesZone = "nas" | LocalZone

/** 分頁切換鈕上的短名稱（避免跟 NAS 共享資料夾的名字撞在一起）。 */
export const ZONE_LABELS: Record<FilesZone, string> = {
  nas: "NAS",
  ctos: "CTOS",
  shared: "專案共用",
  temp: "暫存",
  local: "本機",
}

/**
 * 一句說明，照 `services/path_manager.py` 5–10 行與 `StorageZone` 33–37 行的註解。
 * 不寫死掛載路徑：掛載點是後端設定（`CTOS_MOUNT_PATH` 這些），前端拿不到也不該猜。
 */
export const ZONE_DESCRIPTIONS: Record<LocalZone, string> = {
  ctos: "CTOS 系統檔案",
  shared: "公司專案共用區",
  temp: "暫存檔案",
  local: "本機小檔案（應用程式 data 目錄）",
}

export function isLocalZone(value: string | null | undefined): value is LocalZone {
  return !!value && (LOCAL_ZONES as readonly string[]).includes(value)
}

/** 網址上的 `?zone=`：認得的才算數，其餘（含沒帶）一律當 NAS。 */
export function parseZone(value: string | null | undefined): FilesZone {
  return isLocalZone(value) ? value : "nas"
}

export interface DirectoryFile {
  name: string
  size: number
  /** `datetime.fromtimestamp(st_mtime)` 的 isoformat：沒有時區，是伺服器本地時間。 */
  modified_at: string
}

export interface DirectoryListResponse {
  success: boolean
  zone: string
  path: string
  dirs: string[]
  files: DirectoryFile[]
}

/**
 * zone 根目錄要送的路徑段：`%2F`（＝ `encodeURIComponent("/")`）。
 *
 * `GET /api/files/{zone}/{path}/list` 的 `path` 是空字串時回 400「請指定目錄路徑」
 * （`api/files.py` 314–318），所以列根目錄要找一個「非空、又指回根」的寫法。本機四種都打過：
 *
 * | 送出的網址 | 後端收到 | 結果 |
 * | --- | --- | --- |
 * | `/api/files/temp//list` | `path=""` | 400「請指定目錄路徑」 |
 * | `/api/files/temp/./list`（`%2E` 同） | `path="."` | 後端 200，但**瀏覽器送不出去**：WHATWG URL 會把單點路徑段（含 `%2E`）拿掉，實際送的是 `/api/files/temp/list`，落到讀檔路由回 404 |
 * | `/api/files/temp///list` | `path="/"` | 後端 200，但 nginx 預設 `merge_slashes on`，過反向代理時連續斜線會被併掉 |
 * | `/api/files/temp/%2F/list` | `path="/"` | 200，**這個** |
 *
 * `%2F` 既不是斜線也不是點段，瀏覽器與反向代理都不會動它；後端 unquote 成 `/`，
 * `_get_file_path` 組出 `<掛載點>//`，`pathlib` 收斂回掛載點本身。
 */
export const ZONE_ROOT_SEGMENT = "%2F"

/** 路徑一律存成「相對 zone 根目錄」的形式：根目錄是空字串，其餘像 `smoke-zones/sub`。 */
export function normalizeZonePath(path: string | null | undefined): string {
  if (!path) return ""
  return path
    .split("/")
    .filter((seg) => seg && seg !== ".")
    .join("/")
}

/** 後端 `_check_path_traversal` 看到 `..` 一律 400，前端先濾掉，不要送出去。 */
function encodeZonePath(path: string): string {
  const segs = normalizeZonePath(path)
    .split("/")
    .filter((seg) => seg && seg !== "..")
  return segs.length > 0 ? segs.map(encodeURIComponent).join("/") : ZONE_ROOT_SEGMENT
}

export function listZone(zone: LocalZone, path: string): Promise<DirectoryListResponse> {
  return apiFetch<DirectoryListResponse>(`/api/files/${zone}/${encodeZonePath(path)}/list`)
}

/**
 * 預覽用的直接網址（`<img src>`／`<iframe src>`）。
 *
 * 後端回的是 `Response(content, media_type)`，可以直接當資源網址用；header 設不了的地方
 * 靠 `?token=`（`api/auth.py` 96–110 就是為了這個才收 query token）。
 */
export function zoneFileUrl(zone: LocalZone, path: string): string {
  return withToken(`${API_BASE}/api/files/${zone}/${encodeZonePath(path)}`)
}

/** 下載網址：後端帶 `Content-Disposition: attachment`，直接給 `<a href>` 用。 */
export function zoneDownloadUrl(zone: LocalZone, path: string): string {
  return withToken(`${API_BASE}/api/files/${zone}/${encodeZonePath(path)}/download`)
}

/** 文字類預覽：token 走 header，不進網址。 */
export async function readZoneText(zone: LocalZone, path: string): Promise<string> {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set("Authorization", `Bearer ${token}`)
  const res = await fetch(`${API_BASE}/api/files/${zone}/${encodeZonePath(path)}`, { headers })
  if (!res.ok) {
    // 錯誤是 JSON（FastAPI 的 detail），成功才是檔案內容，所以只有失敗時才去 parse。
    let detail = `HTTP ${res.status}`
    try {
      const data = (await res.json()) as { detail?: unknown }
      if (typeof data.detail === "string") detail = data.detail
    } catch { /* 非 JSON 回應 */ }
    throw new ApiError(res.status, detail)
  }
  return res.text()
}

export const filesKeys = {
  all: ["files"] as const,
  list: (zone: string, path: string) => ["files", "list", zone, path] as const,
  preview: (zone: string, path: string) => ["files", "preview", zone, path] as const,
}
