import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import {
  deleteBotSettings,
  getBotSettings,
  testBotConnection,
  updateBotSettings,
} from "./bot-settings"
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

const statusJson = {
  platform: "line",
  fields: {
    channel_secret: { has_value: true, masked_value: "abcd...wxyz", source: "database", updated_at: "2026-09-10T02:00:00" },
    channel_access_token: { has_value: false, masked_value: "", source: "none", updated_at: null },
  },
  proactive_push_enabled: false,
}

describe("getBotSettings", () => {
  it("GETs /api/admin/bot-settings/:platform", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify(statusJson), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    const result = await getBotSettings("line")
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/admin/bot-settings/line`)
    expect(init.method ?? "GET").toBe("GET")
    expect(result.fields.channel_secret?.source).toBe("database")
    expect(result.proactive_push_enabled).toBe(false)
  })
})

describe("updateBotSettings", () => {
  it("PUTs 到 /api/admin/bot-settings/:platform", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ success: true, message: "telegram 設定已更新" }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await updateBotSettings("telegram", { bot_token: "fake-token" })
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/admin/bot-settings/telegram`)
    expect(init.method).toBe("PUT")
    expect(JSON.parse(init.body as string)).toEqual({ bot_token: "fake-token" })
  })

  it("只送有值的欄位：空字串與 undefined 都不進 body，免得後端把值清掉或回 400", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ success: true, message: "line 設定已更新" }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await updateBotSettings("line", { channel_secret: "fake-secret", channel_access_token: "", bot_token: undefined })
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ channel_secret: "fake-secret" })
  })

  it("開關單獨送：false 也要送出，不能被當成沒填", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ success: true, message: "telegram 設定已更新" }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await updateBotSettings("telegram", { proactive_push_enabled: false })
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ proactive_push_enabled: false })
  })
})

describe("deleteBotSettings", () => {
  it("DELETEs /api/admin/bot-settings/:platform 並回傳刪除筆數", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ deleted: 2 }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    const result = await deleteBotSettings("line")
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/admin/bot-settings/line`)
    expect(init.method).toBe("DELETE")
    expect(result.deleted).toBe(2)
  })
})

describe("testBotConnection", () => {
  it("POSTs /api/admin/bot-settings/:platform/test，不帶 body（後端用存著的憑證）", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ success: false, message: "未設定 Bot Token" }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    const result = await testBotConnection("telegram")
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/admin/bot-settings/telegram/test`)
    expect(init.method).toBe("POST")
    expect(init.body).toBeUndefined()
    expect(result.message).toBe("未設定 Bot Token")
  })
})
