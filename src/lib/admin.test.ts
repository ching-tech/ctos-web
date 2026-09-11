import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import { getDefaultPermissions, listUsers, updateUserPermissions } from "./admin"
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
