import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import {
  isLocalZone,
  listZone,
  LOCAL_ZONES,
  normalizeZonePath,
  parseZone,
  readZoneText,
  zoneDownloadUrl,
  zoneFileUrl,
  ZONE_ROOT_SEGMENT,
} from "./files"
import { setToken } from "./token"

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init })
}

function lastCall(fn: ReturnType<typeof vi.fn>) {
  const [url, init] = fn.mock.calls.at(-1) as [string, RequestInit]
  return { url, init, headers: new Headers(init?.headers) }
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
})
afterEach(() => vi.unstubAllGlobals())

describe("zone 驗證", () => {
  it("只認得後端 `StorageZone` 的四個本機區域，nas 與亂填的都不算", () => {
    expect([...LOCAL_ZONES]).toEqual(["ctos", "shared", "temp", "local"])
    expect(isLocalZone("temp")).toBe(true)
    expect(isLocalZone("nas")).toBe(false)
    expect(isLocalZone("bogus")).toBe(false)
    expect(isLocalZone(null)).toBe(false)
    // 網址上的 `?zone=`：認得的才算數，其餘一律當 NAS
    expect(parseZone("local")).toBe("local")
    expect(parseZone("nas")).toBe("nas")
    expect(parseZone("../etc")).toBe("nas")
    expect(parseZone(null)).toBe("nas")
  })

  it("路徑正規化去掉多餘斜線與單點段", () => {
    expect(normalizeZonePath(null)).toBe("")
    expect(normalizeZonePath("/")).toBe("")
    expect(normalizeZonePath("/a//b/")).toBe("a/b")
    expect(normalizeZonePath("./a/./b")).toBe("a/b")
  })
})

describe("listZone", () => {
  it("根目錄送 %2F（空路徑後端回 400），子目錄逐段編碼，token 走 header", async () => {
    const body = {
      success: true,
      zone: "temp",
      path: "/",
      dirs: ["甲一資料夾"],
      files: [{ name: "說明 一.txt", size: 12, modified_at: "2026-09-12T10:00:00" }],
    }
    const fn = vi.fn(async () => jsonResponse(body))
    vi.stubGlobal("fetch", fn)

    expect(await listZone("temp", "/")).toEqual(body)
    const root = lastCall(fn)
    expect(root.url).toBe(`${API_BASE}/api/files/temp/${ZONE_ROOT_SEGMENT}/list`)
    expect(root.headers.get("Authorization")).toBe("Bearer SESSION")

    await listZone("shared", "/甲一資料夾/說明 一")
    expect(lastCall(fn).url).toBe(`${API_BASE}/api/files/shared/%E7%94%B2%E4%B8%80%E8%B3%87%E6%96%99%E5%A4%BE/%E8%AA%AA%E6%98%8E%20%E4%B8%80/list`)
  })

  it("`..` 不會送出去（後端 `_check_path_traversal` 一律 400）", async () => {
    const fn = vi.fn(async () => jsonResponse({ success: true, zone: "temp", path: "a", dirs: [], files: [] }))
    vi.stubGlobal("fetch", fn)
    await listZone("temp", "/a/../b")
    expect(lastCall(fn).url).toBe(`${API_BASE}/api/files/temp/a/b/list`)
  })

  it("400 與 404 的 detail 原樣丟出", async () => {
    const fn = vi.fn(async () => jsonResponse({ detail: "目錄不存在：nope" }, { status: 404 }))
    vi.stubGlobal("fetch", fn)
    await expect(listZone("temp", "/nope")).rejects.toMatchObject({ status: 404, detail: "目錄不存在：nope" })
  })
})

describe("zoneFileUrl／zoneDownloadUrl", () => {
  it("設不了 header 的地方帶 ?token=", () => {
    expect(zoneFileUrl("local", "/knowledge/assets/a b.png")).toBe(
      `${API_BASE}/api/files/local/knowledge/assets/a%20b.png?token=SESSION`,
    )
    expect(zoneDownloadUrl("ctos", "/linebot/x.pdf")).toBe(`${API_BASE}/api/files/ctos/linebot/x.pdf/download?token=SESSION`)
    // 根目錄不是檔案，但路徑段的規則一致
    expect(zoneFileUrl("temp", "/")).toBe(`${API_BASE}/api/files/temp/${ZONE_ROOT_SEGMENT}?token=SESSION`)
  })

  it("沒登入就不接 token", () => {
    localStorage.removeItem("ctos-web.token")
    expect(zoneFileUrl("temp", "/a.png")).toBe(`${API_BASE}/api/files/temp/a.png`)
    expect(zoneDownloadUrl("temp", "/a.png")).toBe(`${API_BASE}/api/files/temp/a.png/download`)
  })
})

describe("readZoneText", () => {
  it("走 header 取內容，token 不進網址", async () => {
    const fn = vi.fn(async () => new Response("杜撰的內容", { status: 200, headers: { "Content-Type": "text/plain" } }))
    vi.stubGlobal("fetch", fn)
    expect(await readZoneText("temp", "/note.txt")).toBe("杜撰的內容")
    const { url, headers } = lastCall(fn)
    expect(url).toBe(`${API_BASE}/api/files/temp/note.txt`)
    expect(headers.get("Authorization")).toBe("Bearer SESSION")
  })

  it("失敗時丟出後端的 detail", async () => {
    const fn = vi.fn(async () => jsonResponse({ detail: "無權限讀取此檔案" }, { status: 403 }))
    vi.stubGlobal("fetch", fn)
    await expect(readZoneText("ctos", "/x.txt")).rejects.toMatchObject({ status: 403, detail: "無權限讀取此檔案" })
  })
})
