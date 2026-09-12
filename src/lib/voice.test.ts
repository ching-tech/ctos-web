import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE, ApiError } from "./api"
import {
  deleteVoiceSettings,
  getVoiceScopes,
  getVoiceSettings,
  getVoices,
  previewVoice,
  saveVoiceSettings,
} from "./voice"
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

describe("getVoices", () => {
  it("不帶引擎時不帶 query，回傳含 config_schema 與 available_engines", async () => {
    const fn = okResponse({
      engine: "edge",
      voices: [{ id: "zh-TW-HsiaoChenNeural", name: "曉臻", gender: "female", language: "zh-TW" }],
      config_schema: { voice: { type: "select", label: "語音角色", required: true } },
      available_engines: ["edge", "gemini"],
    })
    vi.stubGlobal("fetch", fn)
    const res = await getVoices()
    const [url] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/voice/voices`)
    expect(res.available_engines).toEqual(["edge", "gemini"])
    expect(res.config_schema.voice.type).toBe("select")
    expect(res.voices[0].gender).toBe("female")
  })

  it("帶引擎時 encode 進 query", async () => {
    const fn = okResponse({ engine: "gemini", voices: [], config_schema: {}, available_engines: [] })
    vi.stubGlobal("fetch", fn)
    await getVoices("gemini")
    const [url] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/voice/voices?engine=gemini`)
  })
})

describe("getVoiceScopes", () => {
  it("照收 is_admin、groups 與 agents", async () => {
    const fn = okResponse({
      is_admin: true,
      groups: [{ id: "g-1", name: "甲一機電群", platform: "line" }],
      agents: [{ id: "a-1", name: "小助手" }],
    })
    vi.stubGlobal("fetch", fn)
    const res = await getVoiceScopes()
    const [url] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/voice/scopes`)
    expect(res.is_admin).toBe(true)
    expect(res.groups[0].platform).toBe("line")
    expect(res.agents[0].id).toBe("a-1")
  })
})

describe("getVoiceSettings", () => {
  it("user scope 不帶 scope_id；current 沒設定時是 null", async () => {
    const fn = okResponse({
      scope: "user",
      current: null,
      effective: { tts_engine: "edge", tts_params: { voice: "zh-TW-HsiaoChenNeural" } },
    })
    vi.stubGlobal("fetch", fn)
    const res = await getVoiceSettings()
    const [url] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/voice/settings?scope=user`)
    expect(res.current).toBeNull()
    expect(res.effective.tts_params).toEqual({ voice: "zh-TW-HsiaoChenNeural" })
  })

  it("group scope 帶 scope_id", async () => {
    const fn = okResponse({ scope: "group", current: null, effective: { tts_engine: "edge", tts_params: {} } })
    vi.stubGlobal("fetch", fn)
    await getVoiceSettings("group", "g-1")
    const [url] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/voice/settings?scope=group&scope_id=g-1`)
  })
})

describe("saveVoiceSettings", () => {
  it("PUT 的 body 是後端的 snake_case 四欄", async () => {
    const fn = okResponse({ ok: true })
    vi.stubGlobal("fetch", fn)
    await saveVoiceSettings({
      scope: "user",
      ttsEngine: "edge",
      ttsParams: { voice: "zh-TW-YunJheNeural" },
    })
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/voice/settings`)
    expect(init.method).toBe("PUT")
    expect(JSON.parse(init.body as string)).toEqual({
      scope: "user",
      scope_id: null,
      tts_engine: "edge",
      tts_params: { voice: "zh-TW-YunJheNeural" },
    })
  })

  it("非管理員改群組時把 403 的 detail 原樣丟出來", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ detail: "只有管理員可修改群組語音設定" }), { status: 403 }),
    ))
    await expect(
      saveVoiceSettings({ scope: "group", scopeId: "g-1", ttsEngine: "edge", ttsParams: {} }),
    ).rejects.toMatchObject({ status: 403, detail: "只有管理員可修改群組語音設定" })
  })
})

describe("deleteVoiceSettings", () => {
  it("DELETE 帶 body，scope_id 沒有就送 null", async () => {
    const fn = okResponse({ ok: true })
    vi.stubGlobal("fetch", fn)
    await deleteVoiceSettings()
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/voice/settings`)
    expect(init.method).toBe("DELETE")
    expect(JSON.parse(init.body as string)).toEqual({ scope: "user", scope_id: null })
  })
})

describe("previewVoice", () => {
  it("回的是音訊 Blob，不經過 JSON 解析", async () => {
    const fn = vi.fn(async () =>
      new Response(new Blob(["ID3"]), { status: 200, headers: { "content-type": "audio/mp4" } }),
    )
    vi.stubGlobal("fetch", fn)
    const blob = await previewVoice({ engine: "edge", params: { voice: "zh-TW-HsiaoChenNeural" }, text: "你好" })
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/voice/preview`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({
      engine: "edge",
      params: { voice: "zh-TW-HsiaoChenNeural" },
      text: "你好",
    })
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer T")
    expect(blob).toBeInstanceOf(Blob)
  })

  it("429 冷卻與 503 未安裝的 detail 都原樣丟出來", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ detail: "試聽冷卻中，請稍後再試" }), { status: 429 }),
    ))
    await expect(previewVoice({ engine: "edge", params: {}, text: "你好" })).rejects.toMatchObject({
      status: 429,
      detail: "試聽冷卻中，請稍後再試",
    })

    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ detail: "語音功能未安裝" }), { status: 503 }),
    ))
    const err = await previewVoice({ engine: "edge", params: {}, text: "你好" }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(503)
  })
})
