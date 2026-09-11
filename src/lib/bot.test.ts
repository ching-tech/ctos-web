import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, API_BASE } from "./api"
import {
  bindGroupProject,
  blockUser,
  listFiles,
  listGroups,
  listMessages,
  PLATFORM_LABEL,
  platformLabel,
  unbind,
  unbindGroupProject,
} from "./bot"
import { getToken, setToken } from "./token"

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
  it("帶 groupId 時附上 group_id，page_size 預設 50", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0, page: 1, page_size: 50 }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await listMessages({ page: 1, groupId: "grp-1" })
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(`${API_BASE}/api/bot/messages?group_id=grp-1&page=1&page_size=50`)
  })

  it("帶 userId 時附上 user_id", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0, page: 1, page_size: 50 }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await listMessages({ page: 3, userId: "usr-1", platform: "telegram" })
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(`${API_BASE}/api/bot/messages?user_id=usr-1&page=3&page_size=50&platform_type=telegram`)
  })

  it("帶 pageSize 時覆蓋預設 50（群組明細「最近訊息」用 20）", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0, page: 1, page_size: 20 }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await listMessages({ groupId: "g1", page: 1, pageSize: 20 })
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(`${API_BASE}/api/bot/messages?group_id=g1&page=1&page_size=20`)
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

  it("帶 groupId 時附上 group_id", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await listFiles({ page: 1, groupId: "grp-9" })
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(`${API_BASE}/api/bot/files?page=1&page_size=30&group_id=grp-9`)
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

describe("bindGroupProject", () => {
  it("POST /api/bot/groups/:id/bind-project body { project_id }", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await bindGroupProject("grp-1", "proj-1")
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/bot/groups/grp-1/bind-project`)
    expect(init.method).toBe("POST")
    expect(init.body).toBe(JSON.stringify({ project_id: "proj-1" }))
  })
})

describe("unbindGroupProject", () => {
  it("DELETE /api/bot/groups/:id/bind-project", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await unbindGroupProject("grp-1")
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/bot/groups/grp-1/bind-project`)
    expect(init.method).toBe("DELETE")
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

  it("401 時清掉 session 後才拋錯（比照 apiFetch）", async () => {
    setToken("T")
    const fn = vi.fn(async () => new Response(JSON.stringify({ detail: "未授權" }), { status: 401, headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fn)
    const { downloadFile } = await import("./bot")
    await expect(downloadFile("file-1")).rejects.toBeInstanceOf(ApiError)
    expect(getToken()).toBeNull()
  })
})
