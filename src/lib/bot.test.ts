import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import { blockUser, listFiles, listGroups, listMessages, PLATFORM_LABEL, platformLabel, unbind } from "./bot"
import { setToken } from "./token"

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe("listGroups", () => {
  it("page 2 → limit=20&offset=20，platform 空值略過", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await listGroups({ page: 2 })
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(`${API_BASE}/api/bot/groups?limit=20&offset=20`)
  })

  it("帶 platform 時附上 platform_type", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await listGroups({ page: 1, platform: "line" })
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(`${API_BASE}/api/bot/groups?limit=20&offset=0&platform_type=line`)
  })
})

describe("listMessages", () => {
  it("帶 groupId 時附上 group_id，page_size 固定 50", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0, page: 1, page_size: 50 }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await listMessages({ page: 1, groupId: "grp-1" })
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(`${API_BASE}/api/bot/messages?page=1&page_size=50&group_id=grp-1`)
  })

  it("帶 userId 時附上 user_id", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0, page: 1, page_size: 50 }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await listMessages({ page: 3, userId: "usr-1", platform: "telegram" })
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(`${API_BASE}/api/bot/messages?page=3&page_size=50&platform_type=telegram&user_id=usr-1`)
  })
})

describe("listFiles", () => {
  it("page 與 fileType 組出 query，page_size 固定 30", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await listFiles({ page: 2, fileType: "image" })
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(`${API_BASE}/api/bot/files?page=2&page_size=30&file_type=image`)
  })

  it("platform 空值略過", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await listFiles({ page: 1, platform: "" })
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(`${API_BASE}/api/bot/files?page=1&page_size=30`)
  })
})

describe("blockUser", () => {
  it("PATCH /api/bot/users/:id/block body { reason }", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await blockUser("usr-3", "洗版")
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/bot/users/usr-3/block`)
    expect(init.method).toBe("PATCH")
    expect(init.body).toBe(JSON.stringify({ reason: "洗版" }))
  })

  it("reason 為 null 時也照樣送出", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await blockUser("usr-4", null)
    const init = (fn.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(init.body).toBe(JSON.stringify({ reason: null }))
  })
})

describe("unbind", () => {
  it("DELETE /api/bot/binding?platform_type=…", async () => {
    const fn = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fn)
    await unbind("telegram")
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/bot/binding?platform_type=telegram`)
    expect(init.method).toBe("DELETE")
  })
})

it("platformLabel 對照字典", () => {
  expect(PLATFORM_LABEL.line).toBe("Line")
  expect(PLATFORM_LABEL.telegram).toBe("Telegram")
  expect(platformLabel("line")).toBe("Line")
  expect(platformLabel("telegram")).toBe("Telegram")
})

describe("downloadFile", () => {
  it("帶 Authorization header 取回 Blob，不經過 apiFetch 的 JSON 解析", async () => {
    setToken("T")
    const fn = vi.fn(async () => new Response(new Blob(["abc"]), { status: 200, headers: { "content-type": "application/octet-stream" } }))
    vi.stubGlobal("fetch", fn)
    const { downloadFile } = await import("./bot")
    const blob = await downloadFile("file-1")
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/bot/files/file-1/download`)
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer T")
    expect(blob).toBeInstanceOf(Blob)
  })
})
