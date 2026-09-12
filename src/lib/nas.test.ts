import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE, ApiError } from "./api"
import {
  breadcrumbs,
  browseNas,
  connectNas,
  disconnectNas,
  downloadNasFile,
  formatModified,
  formatSize,
  getNasConnection,
  joinPath,
  listNasConnections,
  listShares,
  normalizePath,
  parentPath,
  previewKind,
  readNasFile,
  readNasText,
  searchNas,
  searchResultPath,
  setNasConnection,
  setNasReconnectHandler,
  sortItems,
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
