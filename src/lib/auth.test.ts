import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { changePassword, login, logout, bindNas } from "./auth"
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

it("bindNas 401（NAS 密碼錯誤）不清掉平台 token", async () => {
  setToken("abc")
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "NAS 帳號或密碼錯誤" }), { status: 401 })))
  await expect(bindNas("n", "wrong")).rejects.toMatchObject({ status: 401 })
  expect(getToken()).toBe("abc")
})

it("changePassword 把兩個欄位原樣 POST 到 /api/auth/change-password", async () => {
  setToken("abc")
  const fn = vi.fn(async () => new Response(JSON.stringify({ success: true, error: null }), { status: 200 }))
  vi.stubGlobal("fetch", fn)
  const res = await changePassword({ current_password: "old12345", new_password: "new12345" })
  expect(res.success).toBe(true)
  const call = fn.mock.calls[0] as unknown as [string, RequestInit]
  expect(call[0]).toMatch(/\/api\/auth\/change-password$/)
  expect(call[1].method).toBe("POST")
  expect(JSON.parse(call[1].body as string)).toEqual({ current_password: "old12345", new_password: "new12345" })
})

it("changePassword 首次設定密碼可以不帶 current_password", async () => {
  setToken("abc")
  const fn = vi.fn(async () => new Response(JSON.stringify({ success: true, error: null }), { status: 200 }))
  vi.stubGlobal("fetch", fn)
  await changePassword({ new_password: "new12345" })
  const call = fn.mock.calls[0] as unknown as [string, RequestInit]
  expect(JSON.parse(call[1].body as string)).toEqual({ new_password: "new12345" })
})

it("changePassword 失敗是 200 加 success:false，不會 throw", async () => {
  setToken("abc")
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false, error: "目前密碼錯誤" }), { status: 200 })))
  const res = await changePassword({ current_password: "wrong", new_password: "new12345" })
  expect(res.success).toBe(false)
  expect(res.error).toBe("目前密碼錯誤")
  expect(getToken()).toBe("abc")
})
