import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { apiFetch, ApiError, API_BASE } from "./api"
import { clearSession, getToken, setToken } from "./token"

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }))
  vi.stubGlobal("fetch", fn)
  return fn
}

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe("apiFetch", () => {
  it("prefixes API_BASE and sends bearer token", async () => {
    setToken("t1")
    const fn = mockFetch(200, { ok: 1 })
    await apiFetch<{ ok: number }>("/api/user/me")
    const call = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(call[0]).toBe(`${API_BASE}/api/user/me`)
    expect(new Headers(call[1].headers).get("Authorization")).toBe("Bearer t1")
  })
  it("throws ApiError with detail on 409", async () => {
    mockFetch(409, { detail: "此 NAS 帳號已綁定其他使用者" })
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 409, detail: "此 NAS 帳號已綁定其他使用者" })
  })
  it("clears session on 401", async () => {
    setToken("t1")
    mockFetch(401, { detail: "no" })
    await expect(apiFetch("/x")).rejects.toBeInstanceOf(ApiError)
    expect(getToken()).toBeNull()
  })
  it("401 with keepSessionOn401 keeps the token", async () => {
    setToken("t1")
    mockFetch(401, { detail: "NAS 帳號或密碼錯誤" })
    await expect(apiFetch("/x", { keepSessionOn401: true })).rejects.toMatchObject({ status: 401 })
    expect(getToken()).toBe("t1")
  })
  it("returns undefined on 204", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })))
    expect(await apiFetch("/x")).toBeUndefined()
    clearSession()
  })
  it("does not set JSON content-type for FormData bodies", async () => {
    const fn = mockFetch(200, { ok: 1 })
    const fd = new FormData()
    fd.append("file", new Blob(["x"]), "a.txt")
    await apiFetch("/upload", { method: "POST", body: fd })
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(new Headers(init.headers).get("Content-Type")).toBeNull()
  })
})
