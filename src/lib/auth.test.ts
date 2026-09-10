import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { login, logout, bindNas } from "./auth"
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

it("login sends method and stores token on success", async () => {
  const fn = vi.fn(async () => new Response(JSON.stringify({ success: true, token: "abc", username: "u", error: null, role: "user", must_change_password: false }), { status: 200 }))
  vi.stubGlobal("fetch", fn)
  const res = await login("u", "p", "local")
  expect(res.success).toBe(true)
  expect(getToken()).toBe("abc")
  const call = fn.mock.calls[0] as unknown as [string, RequestInit]
  const body = JSON.parse(call[1].body as string)
  expect(body).toEqual({ username: "u", password: "p", method: "local" })
})

it("login failure returns response without throwing and stores nothing", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false, token: null, username: null, error: "帳號或密碼錯誤", role: null, must_change_password: false }), { status: 200 })))
  const res = await login("u", "bad", "nas")
  expect(res.success).toBe(false)
  expect(res.error).toBe("帳號或密碼錯誤")
  expect(getToken()).toBeNull()
})

it("logout clears session even if the request fails", async () => {
  setToken("abc")
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network") }))
  await logout()
  expect(getToken()).toBeNull()
})

it("bindNas posts credentials", async () => {
  setToken("abc")
  const fn = vi.fn(async () => new Response(JSON.stringify({ success: true, nas_username: "n" }), { status: 200 }))
  vi.stubGlobal("fetch", fn)
  expect((await bindNas("n", "pw")).nas_username).toBe("n")
  const call = fn.mock.calls[0] as unknown as [string, RequestInit]
  expect(call[0]).toMatch(/\/api\/user\/me\/nas-binding$/)
  expect(call[1].method).toBe("POST")
})
