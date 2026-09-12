import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import { getPreferences, isPreferenceTheme, updatePreferences } from "./preferences"
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

describe("getPreferences", () => {
  it("GETs /api/user/preferences", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ theme: "light" }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    expect((await getPreferences()).theme).toBe("light")
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/user/preferences`)
    expect(init.method ?? "GET").toBe("GET")
  })
})

describe("updatePreferences", () => {
  it("PUTs { theme } 到 /api/user/preferences", async () => {
    const fn = vi.fn(
      async () => new Response(JSON.stringify({ success: true, preferences: { theme: "light" } }), { status: 200 }),
    )
    vi.stubGlobal("fetch", fn)
    const res = await updatePreferences("light")
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/user/preferences`)
    expect(init.method).toBe("PUT")
    expect(JSON.parse(init.body as string)).toEqual({ theme: "light" })
    expect(res.preferences.theme).toBe("light")
  })

  it("後端拒絕的 400 detail 原樣往上丟", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "無效的主題值，必須為 'dark' 或 'light'" }), { status: 400 })),
    )
    await expect(updatePreferences("light")).rejects.toMatchObject({
      status: 400,
      detail: "無效的主題值，必須為 'dark' 或 'light'",
    })
  })
})

describe("isPreferenceTheme", () => {
  it("只有 dark 與 light 存得回後端", () => {
    expect(isPreferenceTheme("dark")).toBe(true)
    expect(isPreferenceTheme("light")).toBe(true)
    expect(isPreferenceTheme("system")).toBe(false)
  })
})
