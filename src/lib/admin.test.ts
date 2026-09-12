import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import {
  clearUserPassword,
  createUser,
  deleteUser,
  getDefaultPermissions,
  listUsers,
  resetUserPassword,
  updateUserInfo,
  updateUserPermissions,
  updateUserStatus,
} from "./admin"
import { setToken } from "./token"

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  setToken("T")
})
afterEach(() => vi.unstubAllGlobals())

describe("listUsers", () => {
  it("GETs /api/admin/users", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ users: [] }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await listUsers()
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/admin/users`)
    expect(init.method ?? "GET").toBe("GET")
  })
})

describe("getDefaultPermissions", () => {
  it("GETs /api/admin/default-permissions", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ apps: {}, knowledge: {}, app_names: {} }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await getDefaultPermissions()
    const [url] = fn.mock.calls[0] as unknown as [string]
    expect(url).toBe(`${API_BASE}/api/admin/default-permissions`)
  })
})

describe("updateUserPermissions", () => {
  it("PATCHes only the given body to /api/admin/users/:id/permissions", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ success: true, permissions: { apps: { "ai-log": true }, knowledge: {} } }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await updateUserPermissions(2, { apps: { "ai-log": true } })
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/admin/users/2/permissions`)
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body as string)).toEqual({ apps: { "ai-log": true } })
  })
})

/** 後端這幾支回的都是 `UserOperationResponse`（models/user.py 102–107）。 */
function okResponse(json: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(json), { status: 200 }))
}

describe("createUser", () => {
  it("POSTs the whole form to /api/admin/users", async () => {
    const fn = okResponse({ success: true, id: 7, username: "dingyi", display_name: "丁一", role: "user", error: null })
    vi.stubGlobal("fetch", fn)
    const res = await createUser({ username: "dingyi", password: "pw12345678", display_name: "丁一", role: "user" })
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/admin/users`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({
      username: "dingyi",
      password: "pw12345678",
      display_name: "丁一",
      role: "user",
    })
    expect(res.id).toBe(7)
  })
})

describe("updateUserInfo", () => {
  it("PATCHes only the given fields to /api/admin/users/:id", async () => {
    const fn = okResponse({ success: true, message: "使用者資訊已更新", error: null })
    vi.stubGlobal("fetch", fn)
    await updateUserInfo(3, { display_name: "丙三", role: "admin" })
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/admin/users/3`)
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body as string)).toEqual({ display_name: "丙三", role: "admin" })
  })
})

describe("updateUserStatus", () => {
  it("PATCHes { is_active } to /api/admin/users/:id/status", async () => {
    const fn = okResponse({ success: true, message: "帳號已停用", error: null })
    vi.stubGlobal("fetch", fn)
    await updateUserStatus(3, false)
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/admin/users/3/status`)
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body as string)).toEqual({ is_active: false })
  })
})

describe("resetUserPassword", () => {
  it("POSTs { new_password } to /api/admin/users/:id/reset-password", async () => {
    const fn = okResponse({ success: true, message: "密碼已重設", error: null })
    vi.stubGlobal("fetch", fn)
    await resetUserPassword(3, "pw12345678")
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/admin/users/3/reset-password`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({ new_password: "pw12345678" })
  })
})

describe("clearUserPassword", () => {
  it("POSTs with no body to /api/admin/users/:id/clear-password", async () => {
    const fn = okResponse({ success: true, message: "密碼已清除", error: null })
    vi.stubGlobal("fetch", fn)
    await clearUserPassword(3)
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/admin/users/3/clear-password`)
    expect(init.method).toBe("POST")
    expect(init.body).toBeUndefined()
  })
})

describe("deleteUser", () => {
  it("DELETEs /api/admin/users/:id", async () => {
    const fn = okResponse({ success: true, message: "使用者已永久刪除", error: null })
    vi.stubGlobal("fetch", fn)
    await deleteUser(3)
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/admin/users/3`)
    expect(init.method).toBe("DELETE")
  })
})
