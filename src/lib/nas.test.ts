import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE, ApiError } from "./api"
import {
  breadcrumbs,
  browseNas,
  connectNas,
  createNasShareLink,
  deleteNasItem,
  disconnectNas,
  downloadNasFile,
  formatModified,
  formatSize,
  getNasConnection,
  joinPath,
  listNasConnections,
  listShares,
  normalizePath,
  mkdirNas,
  parentPath,
  parseShareMounts,
  previewKind,
  readNasFile,
  readNasText,
  renameNas,
  searchNas,
  searchResultPath,
  setNasConnection,
  setNasReconnectHandler,
  sortItems,
  toShareResourceId,
  uploadNasFile,
  usableConnection,
} from "./nas"
import { setToken } from "./token"

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init })
}

/** 後端 NAS 連線失效的回應：401 加自訂 header。 */
function nasAuthResponse(header: "X-NAS-Required" | "X-NAS-Token-Expired", detail: string) {
  return new Response(JSON.stringify({ detail }), { status: 401, headers: { "Content-Type": "application/json", [header]: "true" } })
}

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  vi.stubGlobal("dispatchEvent", () => true)
  setToken("SESSION")
  setNasConnection(null)
  setNasReconnectHandler(null)
})
afterEach(() => {
  vi.unstubAllGlobals()
  setNasConnection(null)
  setNasReconnectHandler(null)
})

function lastCall(fn: ReturnType<typeof vi.fn>) {
  const call = fn.mock.calls.at(-1) as unknown as [string, RequestInit]
  return { url: call[0], init: call[1], headers: new Headers(call[1].headers) }
}

describe("連線管理端點", () => {
  it("connect 送 host／username／password，帳密錯誤時後端回 200 加 success:false", async () => {
    const fn = vi.fn(async () => jsonResponse({ success: false, token: null, error: "NAS 帳號或密碼錯誤", host: null }))
    vi.stubGlobal("fetch", fn)
    const res = await connectNas({ host: "nas.test.invalid", username: "u", password: "p" })
    const { url, init } = lastCall(fn)
    expect(url).toBe(`${API_BASE}/api/nas/connect`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(String(init.body))).toEqual({ host: "nas.test.invalid", username: "u", password: "p" })
    expect(res.success).toBe(false)
    expect(res.error).toBe("NAS 帳號或密碼錯誤")
  })

  it("connect 連不到 NAS 時 503 的 detail 照原樣丟出", async () => {
    const fn = vi.fn(async () => jsonResponse({ detail: "無法連線至 NAS nas.test.invalid" }, { status: 503 }))
    vi.stubGlobal("fetch", fn)
    await expect(connectNas({ host: "nas.test.invalid", username: "u", password: "p" })).rejects.toMatchObject({
      status: 503,
      detail: "無法連線至 NAS nas.test.invalid",
    })
  })

  it("connections 回連線陣列", async () => {
    const conns = [{ token: "T1", host: "h", username: "u", created_at: "a", expires_at: "b", last_used_at: "c" }]
    const fn = vi.fn(async () => jsonResponse({ connections: conns }))
    vi.stubGlobal("fetch", fn)
    expect(await listNasConnections()).toEqual(conns)
    expect(lastCall(fn).url).toBe(`${API_BASE}/api/nas/connections`)
  })

  it("disconnect 用 DELETE 並帶 X-NAS-Token", async () => {
    setNasConnection({ token: "T1", host: "h", username: "u" })
    const fn = vi.fn(async () => jsonResponse({ success: true }))
    vi.stubGlobal("fetch", fn)
    await disconnectNas()
    const { url, init, headers } = lastCall(fn)
    expect(url).toBe(`${API_BASE}/api/nas/disconnect`)
    expect(init.method).toBe("DELETE")
    expect(headers.get("X-NAS-Token")).toBe("T1")
  })
})

describe("瀏覽與搜尋端點", () => {
  beforeEach(() => setNasConnection({ token: "T1", host: "h", username: "u" }))

  it("shares 取 shares 欄位，並同時帶 session 與 NAS token", async () => {
    const fn = vi.fn(async () => jsonResponse({ shares: [{ name: "共用區", type: "disk" }] }))
    vi.stubGlobal("fetch", fn)
    expect(await listShares()).toEqual([{ name: "共用區", type: "disk" }])
    const { url, headers } = lastCall(fn)
    expect(url).toBe(`${API_BASE}/api/nas/shares`)
    expect(headers.get("Authorization")).toBe("Bearer SESSION")
    expect(headers.get("X-NAS-Token")).toBe("T1")
  })

  it("browse 把路徑放進 path query", async () => {
    const fn = vi.fn(async () => jsonResponse({ path: "/共用區/甲一", items: [] }))
    vi.stubGlobal("fetch", fn)
    await browseNas("/共用區/甲一")
    expect(lastCall(fn).url).toBe(`${API_BASE}/api/nas/browse?path=${encodeURIComponent("/共用區/甲一")}`)
  })

  it("search 帶 path、query 與上限預設值", async () => {
    const fn = vi.fn(async () => jsonResponse({ query: "圖", path: "/共用區", results: [], total: 0 }))
    vi.stubGlobal("fetch", fn)
    await searchNas("/共用區", "圖")
    const url = new URL(lastCall(fn).url)
    expect(url.pathname.endsWith("/api/nas/search")).toBe(true)
    expect(url.searchParams.get("path")).toBe("/共用區")
    expect(url.searchParams.get("query")).toBe("圖")
    expect(url.searchParams.get("max_depth")).toBe("3")
    expect(url.searchParams.get("max_results")).toBe("100")
  })

  it("file 與 download 各自打自己的端點並回 blob／文字", async () => {
    const fn = vi.fn(async () => new Response("hello", { status: 200 }))
    vi.stubGlobal("fetch", fn)
    expect(await readNasText("/共用區/a.txt")).toBe("hello")
    expect(lastCall(fn).url).toBe(`${API_BASE}/api/nas/file?path=${encodeURIComponent("/共用區/a.txt")}`)

    const blob = await readNasFile("/共用區/a.png")
    expect(blob).toBeInstanceOf(Blob)

    await downloadNasFile("/共用區/a.bin")
    expect(lastCall(fn).url).toBe(`${API_BASE}/api/nas/download?path=${encodeURIComponent("/共用區/a.bin")}`)
  })
})

describe("連線失效的攔截與重試", () => {
  it("X-NAS-Required：清掉連線、跑重連流程、重試一次", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(nasAuthResponse("X-NAS-Required", "請先連線 NAS"))
      .mockResolvedValueOnce(jsonResponse({ shares: [{ name: "共用區", type: "disk" }] }))
    vi.stubGlobal("fetch", fn)

    const reconnect = vi.fn(async () => {
      const next = { token: "T2", host: "h", username: "u" }
      setNasConnection(next)
      return next
    })
    setNasReconnectHandler(reconnect)

    expect(await listShares()).toEqual([{ name: "共用區", type: "disk" }])
    expect(reconnect).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledTimes(2)
    // 重試那一次帶的是新 token
    expect(lastCall(fn).headers.get("X-NAS-Token")).toBe("T2")
  })

  it("X-NAS-Token-Expired：同一條路，而且只重試一次", async () => {
    setNasConnection({ token: "T1", host: "h", username: "u" })
    const fn = vi.fn(async () => nasAuthResponse("X-NAS-Token-Expired", "NAS 連線已過期，請重新連線"))
    vi.stubGlobal("fetch", fn)
    setNasReconnectHandler(async () => {
      const next = { token: "T2", host: "h", username: "u" }
      setNasConnection(next)
      return next
    })

    await expect(browseNas("/共用區")).rejects.toBeInstanceOf(ApiError)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("跨網域讀不到自訂 header 時，改用後端寫死的 detail 判斷", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: "NAS 連線已過期，請重新連線" }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ path: "/共用區", items: [] }))
    vi.stubGlobal("fetch", fn)
    const reconnect = vi.fn(async () => {
      const next = { token: "T2", host: "h", username: "u" }
      setNasConnection(next)
      return next
    })
    setNasReconnectHandler(reconnect)

    await browseNas("/共用區")
    expect(reconnect).toHaveBeenCalledTimes(1)
    // NAS 的 401 不可以把使用者登出
    expect(localStorage.getItem("ctos-web.token")).toBe("SESSION")
  })

  it("兩支同時撞到過期的請求：只問一次重連，連好之後兩支都拿得到結果", async () => {
    setNasConnection({ token: "T1", host: "h", username: "u" })
    // 前兩次（兩支原請求）回過期，之後（兩支各自的重試）回正常資料
    let calls = 0
    const fn = vi.fn(async (url: string) => {
      calls += 1
      if (calls <= 2) return nasAuthResponse("X-NAS-Token-Expired", "NAS 連線已過期，請重新連線")
      return url.includes("/api/nas/shares")
        ? jsonResponse({ shares: [{ name: "共用區", type: "disk" }] })
        : jsonResponse({ path: "/共用區", items: [] })
    })
    vi.stubGlobal("fetch", fn)

    let release: ((conn: { token: string; host: string; username: string } | null) => void) | null = null
    const reconnect = vi.fn(
      () =>
        new Promise<{ token: string; host: string; username: string } | null>((resolve) => {
          release = resolve
        }),
    )
    setNasReconnectHandler(reconnect)

    const shares = listShares()
    const browse = browseNas("/共用區")

    // 同一波過期只會叫出一次連線流程（頁面那邊也就只會開一次對話框）
    await vi.waitFor(() => expect(reconnect).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(release).not.toBeNull())

    const next = { token: "T2", host: "h", username: "u" }
    setNasConnection(next)
    release!(next)

    expect(await shares).toEqual([{ name: "共用區", type: "disk" }])
    expect(await browse).toEqual({ path: "/共用區", items: [] })
    expect(reconnect).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledTimes(4)
  })

  it("使用者關掉連線對話框（重連傳回 null）就不重試，把 detail 丟出來", async () => {
    const fn = vi.fn(async () => nasAuthResponse("X-NAS-Required", "請先連線 NAS"))
    vi.stubGlobal("fetch", fn)
    setNasReconnectHandler(async () => null)

    await expect(listShares()).rejects.toMatchObject({ status: 401, detail: "請先連線 NAS" })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(getNasConnection()).toBeNull()
  })

  it("session 過期的 401 照舊清掉 session，不會被當成 NAS 問題", async () => {
    const fn = vi.fn(async () => jsonResponse({ detail: "未授權，請重新登入" }, { status: 401 }))
    vi.stubGlobal("fetch", fn)
    const reconnect = vi.fn(async () => null)
    setNasReconnectHandler(reconnect)

    await expect(listShares()).rejects.toMatchObject({ status: 401, detail: "未授權，請重新登入" })
    expect(reconnect).not.toHaveBeenCalled()
    expect(localStorage.getItem("ctos-web.token")).toBeNull()
  })

  it("權限不足的 403 原樣丟出，不觸發重連", async () => {
    setNasConnection({ token: "T1", host: "h", username: "u" })
    const fn = vi.fn(async () => jsonResponse({ detail: "無權限存取此資料夾" }, { status: 403 }))
    vi.stubGlobal("fetch", fn)
    const reconnect = vi.fn(async () => null)
    setNasReconnectHandler(reconnect)

    await expect(browseNas("/共用區")).rejects.toMatchObject({ status: 403, detail: "無權限存取此資料夾" })
    expect(reconnect).not.toHaveBeenCalled()
  })
})

describe("路徑與顯示工具", () => {
  it("normalizePath／joinPath／parentPath", () => {
    expect(normalizePath(null)).toBe("/")
    expect(normalizePath("共用區/甲一/")).toBe("/共用區/甲一")
    expect(joinPath("/", "共用區")).toBe("/共用區")
    expect(joinPath("/共用區", "甲一")).toBe("/共用區/甲一")
    expect(parentPath("/共用區/甲一")).toBe("/共用區")
    expect(parentPath("/共用區")).toBe("/")
    expect(parentPath("/")).toBe("/")
  })

  it("breadcrumbs 每一段都帶自己的完整路徑", () => {
    expect(breadcrumbs("/")).toEqual([])
    expect(breadcrumbs("/共用區/甲一/圖面")).toEqual([
      { name: "共用區", path: "/共用區" },
      { name: "甲一", path: "/共用區/甲一" },
      { name: "圖面", path: "/共用區/甲一/圖面" },
    ])
  })

  it("searchResultPath 把 share 名稱接回搜尋結果（後端的 path 不含 share）", () => {
    expect(searchResultPath("/共用區", "/a.pdf")).toBe("/共用區/a.pdf")
    expect(searchResultPath("/共用區/甲一", "/甲一/圖面/a.pdf")).toBe("/共用區/甲一/圖面/a.pdf")
  })

  it("formatSize 與 formatModified", () => {
    expect(formatSize(null)).toBe("—")
    expect(formatSize(512)).toBe("512 B")
    expect(formatSize(2048)).toBe("2.0 KB")
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB")
    expect(formatModified(null)).toBe("—")
    // 後端給的是沒有時區的 isoformat，照本地時間顯示
    expect(formatModified("2026-09-10T14:23:05")).toBe("2026-09-10 14:23")
  })

  it("previewKind 只認圖片、PDF 與文字類", () => {
    expect(previewKind("a.PNG")).toBe("image")
    expect(previewKind("a.pdf")).toBe("pdf")
    expect(previewKind("a.md")).toBe("text")
    expect(previewKind("a.csv")).toBe("text")
    expect(previewKind("a.dwg")).toBe("none")
  })

  it("sortItems 資料夾排前面", () => {
    const items = [
      { name: "b.txt", type: "file" as const, size: 1, modified: null },
      { name: "a 資料夾", type: "directory" as const, size: null, modified: null },
      { name: "a.txt", type: "file" as const, size: 1, modified: null },
    ]
    expect(sortItems(items).map((i) => i.name)).toEqual(["a 資料夾", "a.txt", "b.txt"])
  })
})

describe("沿用現成連線", () => {
  const make = (token: string, expires: string) => ({
    token,
    host: "h",
    username: "u",
    created_at: "2026-09-12T10:00:00",
    expires_at: expires,
    last_used_at: "2026-09-12T10:00:00",
  })
  const now = new Date("2026-09-12T12:00:00").getTime()

  it("跳過已經過期的那幾筆（後端的 get_user_connections 不會自己清）", () => {
    const list = [make("old", "2026-09-12T11:30:00"), make("good", "2026-09-12T12:20:00")]
    expect(usableConnection(list, now)?.token).toBe("good")
  })

  it("全部過期就回 null，會走連線對話框", () => {
    expect(usableConnection([make("old", "2026-09-12T11:30:00")], now)).toBeNull()
    expect(usableConnection([], now)).toBeNull()
  })

  it("expires_at 解析不出來時不擋（寧可讓請求自己撞 401 走重連）", () => {
    expect(usableConnection([make("weird", "not-a-date")], now)?.token).toBe("weird")
  })
})

describe("寫入端點", () => {
  beforeEach(() => setNasConnection({ token: "T1", host: "h", username: "u" }))

  it("upload 用 multipart 送 path（目標資料夾）與 file", async () => {
    const fn = vi.fn(async () => jsonResponse({ success: true, message: "上傳成功" }))
    vi.stubGlobal("fetch", fn)
    const file = new File(["x"], "圖面.pdf", { type: "application/pdf" })
    expect(await uploadNasFile("/共用區/甲一", file)).toEqual({ success: true, message: "上傳成功" })
    const { url, init, headers } = lastCall(fn)
    expect(url).toBe(`${API_BASE}/api/nas/upload`)
    expect(init.method).toBe("POST")
    // multipart 的 Content-Type 要留給瀏覽器自己帶 boundary
    expect(headers.get("Content-Type")).toBeNull()
    const form = init.body as FormData
    expect(form.get("path")).toBe("/共用區/甲一")
    expect((form.get("file") as File).name).toBe("圖面.pdf")
  })

  it("mkdir 送完整的新資料夾路徑", async () => {
    const fn = vi.fn(async () => jsonResponse({ success: true, message: "建立成功" }))
    vi.stubGlobal("fetch", fn)
    await mkdirNas("/共用區/甲一/新資料夾")
    const { url, init } = lastCall(fn)
    expect(url).toBe(`${API_BASE}/api/nas/mkdir`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(String(init.body))).toEqual({ path: "/共用區/甲一/新資料夾" })
  })

  it("rename 用 PATCH，欄位是 path 與 new_name", async () => {
    const fn = vi.fn(async () => jsonResponse({ success: true, message: "重命名成功" }))
    vi.stubGlobal("fetch", fn)
    await renameNas("/共用區/甲一/舊.pdf", "新.pdf")
    const { url, init } = lastCall(fn)
    expect(url).toBe(`${API_BASE}/api/nas/rename`)
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(String(init.body))).toEqual({ path: "/共用區/甲一/舊.pdf", new_name: "新.pdf" })
  })

  it("delete 用 DELETE 帶 body，recursive 照傳", async () => {
    const fn = vi.fn(async () => jsonResponse({ success: true, message: "刪除成功" }))
    vi.stubGlobal("fetch", fn)
    await deleteNasItem("/共用區/甲一", true)
    const { url, init } = lastCall(fn)
    expect(url).toBe(`${API_BASE}/api/nas/file`)
    expect(init.method).toBe("DELETE")
    expect(JSON.parse(String(init.body))).toEqual({ path: "/共用區/甲一", recursive: true })
  })

  it("資料夾不是空的那個 400 原樣丟出", async () => {
    const fn = vi.fn(async () => jsonResponse({ detail: "資料夾不是空的，請使用遞迴刪除" }, { status: 400 }))
    vi.stubGlobal("fetch", fn)
    await expect(deleteNasItem("/共用區/甲一", false)).rejects.toMatchObject({
      status: 400,
      detail: "資料夾不是空的，請使用遞迴刪除",
    })
  })
})

describe("分享連結的 resource_id", () => {
  const mounts = parseShareMounts("/共用區/在案資料=/mnt/nas/projects;/共用區/線路圖=/mnt/nas/circuits")

  it("parseShareMounts 解析成前綴對掛載點", () => {
    expect(mounts).toEqual([
      { prefix: "/共用區/在案資料", mount: "/mnt/nas/projects" },
      { prefix: "/共用區/線路圖", mount: "/mnt/nas/circuits" },
    ])
    expect(parseShareMounts(undefined)).toEqual([])
    expect(parseShareMounts("亂寫沒有等號")).toEqual([])
  })

  it("檔案管理器路徑換成掛載點路徑；不在設定範圍內回 null", () => {
    // 後端 path_manager 只認 /tmp/ 與 /mnt/ 開頭的絕對路徑，SMB 路徑會被判成 NAS zone 而拒絕
    expect(toShareResourceId("/共用區/在案資料/甲一/圖面.pdf", mounts)).toBe("/mnt/nas/projects/甲一/圖面.pdf")
    expect(toShareResourceId("/共用區/線路圖/a.dwg", mounts)).toBe("/mnt/nas/circuits/a.dwg")
    expect(toShareResourceId("/共用區/其他/x.pdf", mounts)).toBeNull()
    expect(toShareResourceId("/備份區/x.pdf", mounts)).toBeNull()
    // 前綴只比整段，不比字首
    expect(toShareResourceId("/共用區/在案資料夾/x.pdf", mounts)).toBeNull()
  })

  it("createNasShareLink 送 nas_file 與換算後的路徑", async () => {
    const fn = vi.fn(async () => jsonResponse({ token: "t", url: "/s/t", full_url: "https://x/s/t", resource_type: "nas_file", resource_id: "/mnt/nas/projects/甲一/圖面.pdf", resource_title: "圖面.pdf" }))
    vi.stubGlobal("fetch", fn)
    await createNasShareLink("/mnt/nas/projects/甲一/圖面.pdf", { expires_in: "24h", password: "1234" })
    const { url, init } = lastCall(fn)
    expect(url).toBe(`${API_BASE}/api/share`)
    expect(JSON.parse(String(init.body))).toEqual({
      resource_type: "nas_file",
      resource_id: "/mnt/nas/projects/甲一/圖面.pdf",
      expires_in: "24h",
      password: "1234",
    })
  })
})
