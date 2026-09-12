import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import { createApiToken, listApiTokens, revokeApiToken, scopeLabel } from "./api-tokens"
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

function okResponse(json: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(json), { status }))
}

describe("listApiTokens", () => {
  it("GETs /api/auth/tokens", async () => {
    const fn = okResponse({ success: true, tokens: [] })
    vi.stubGlobal("fetch", fn)
    await listApiTokens()
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/auth/tokens`)
    expect(init.method ?? "GET").toBe("GET")
  })
})

describe("createApiToken", () => {
  it("POSTs 四個欄位到 /api/auth/tokens，201 也算成功", async () => {
    const fn = okResponse(
      {
        success: true,
        token: "ctos_pat_abc",
        info: {
          id: 1,
          name: "筆電 CLI",
          scopes: ["knowledge-base"],
          read_only: true,
          expires_at: "2027-03-11T00:00:00Z",
          last_used_at: null,
          created_at: "2026-09-12T00:00:00Z",
        },
      },
      201,
    )
    vi.stubGlobal("fetch", fn)
    const res = await createApiToken({
      name: "筆電 CLI",
      scopes: ["knowledge-base"],
      expires_days: 180,
      read_only: true,
    })
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/auth/tokens`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({
      name: "筆電 CLI",
      scopes: ["knowledge-base"],
      expires_days: 180,
      read_only: true,
    })
    expect(res.token).toBe("ctos_pat_abc")
  })

  it("expires_days 為 null 代表永不過期，要原樣送出去", async () => {
    const fn = okResponse({ success: true, token: "ctos_pat_x", info: {} }, 201)
    vi.stubGlobal("fetch", fn)
    await createApiToken({ name: "常駐", scopes: [], expires_days: null, read_only: false })
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      name: "常駐",
      scopes: [],
      expires_days: null,
      read_only: false,
    })
  })
})

describe("revokeApiToken", () => {
  it("DELETEs /api/auth/tokens/:id", async () => {
    const fn = okResponse({ success: true })
    vi.stubGlobal("fetch", fn)
    await revokeApiToken(7)
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/auth/tokens/7`)
    expect(init.method).toBe("DELETE")
  })
})

describe("scopeLabel", () => {
  it("對得到的 app id 顯示側邊欄的名稱", () => {
    expect(scopeLabel("knowledge-base")).toBe("知識庫")
    expect(scopeLabel("ai-assistant")).toBe("AI 助手")
  })

  it("對不到的顯示原本的 id", () => {
    expect(scopeLabel("settings")).toBe("settings")
  })
})
