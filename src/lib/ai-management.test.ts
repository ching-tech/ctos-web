import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import {
  createAgent,
  createPrompt,
  deleteAgent,
  deletePrompt,
  formatJsonObject,
  getAgent,
  getAgentByName,
  getPrompt,
  getProviderStatus,
  isBotPrompt,
  listAgents,
  listPrompts,
  parseJsonObject,
  testAgent,
  updateAgent,
  updatePrompt,
} from "./ai-management"

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})
afterEach(() => vi.unstubAllGlobals())

const promptJson = {
  id: "pr-1",
  name: "web-chat-default",
  display_name: "預設對話助手",
  category: "system",
  content: "你是擎添工業的助理。",
  description: "網頁對話用",
  variables: { user_name: "使用者名稱" },
  created_at: "2026-09-01T09:00:00",
  updated_at: "2026-09-02T09:00:00",
}

const agentJson = {
  id: "ag-1",
  name: "web-chat",
  display_name: "網頁對話",
  description: "網頁端的通用助理",
  model: "claude-sonnet",
  system_prompt_id: "pr-1",
  system_prompt: promptJson,
  is_active: true,
  tools: ["WebSearch"],
  settings: { temperature: 0.2 },
  created_at: "2026-09-01T09:00:00",
  updated_at: "2026-09-02T09:00:00",
}

function stubFetch(json: unknown, status = 200) {
  const fn = vi.fn(async () => new Response(JSON.stringify(json), { status }))
  vi.stubGlobal("fetch", fn)
  return fn
}

function callOf(fn: ReturnType<typeof stubFetch>, i = 0): [string, RequestInit] {
  return fn.mock.calls[i] as unknown as [string, RequestInit]
}

describe("listPrompts", () => {
  it("沒有分類時不帶 query", async () => {
    const fn = stubFetch({ items: [promptJson], total: 1 })
    const res = await listPrompts()
    expect(callOf(fn)[0]).toBe(`${API_BASE}/api/ai/prompts`)
    expect(res.total).toBe(1)
    expect(res.items[0].name).toBe("web-chat-default")
  })

  it("有分類時帶 category", async () => {
    const fn = stubFetch({ items: [], total: 0 })
    await listPrompts("linebot")
    expect(callOf(fn)[0]).toBe(`${API_BASE}/api/ai/prompts?category=linebot`)
  })
})

describe("getPrompt", () => {
  it("打 GET /api/ai/prompts/{id}", async () => {
    const fn = stubFetch(promptJson)
    const res = await getPrompt("pr-1")
    expect(callOf(fn)[0]).toBe(`${API_BASE}/api/ai/prompts/pr-1`)
    expect(res.content).toBe("你是擎添工業的助理。")
    expect(res.variables).toEqual({ user_name: "使用者名稱" })
  })

  it("404 會丟 ApiError，detail 原樣帶出來", async () => {
    stubFetch({ detail: "Prompt 不存在" }, 404)
    await expect(getPrompt("nope")).rejects.toMatchObject({ status: 404, detail: "Prompt 不存在" })
  })
})

describe("createPrompt", () => {
  it("POST，body 就是傳進去的欄位", async () => {
    const fn = stubFetch(promptJson)
    await createPrompt({ name: "demo", content: "內容", category: "task" })
    const [url, init] = callOf(fn)
    expect(url).toBe(`${API_BASE}/api/ai/prompts`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({ name: "demo", content: "內容", category: "task" })
  })
})

describe("updatePrompt", () => {
  it("PUT，只送有給的欄位", async () => {
    const fn = stubFetch(promptJson)
    await updatePrompt("pr-1", { content: "換過的內容" })
    const [url, init] = callOf(fn)
    expect(url).toBe(`${API_BASE}/api/ai/prompts/pr-1`)
    expect(init.method).toBe("PUT")
    expect(JSON.parse(init.body as string)).toEqual({ content: "換過的內容" })
  })
})

describe("deletePrompt", () => {
  it("DELETE，後端回 {success:true} 也不當成回傳值", async () => {
    const fn = stubFetch({ success: true })
    await expect(deletePrompt("pr-1")).resolves.toBeUndefined()
    const [url, init] = callOf(fn)
    expect(url).toBe(`${API_BASE}/api/ai/prompts/pr-1`)
    expect(init.method).toBe("DELETE")
  })

  it("被 agent 引用時 400 的 detail 帶得出來", async () => {
    stubFetch({ detail: "此 Prompt 被 1 個 Agent 使用中" }, 400)
    await expect(deletePrompt("pr-1")).rejects.toMatchObject({ status: 400, detail: "此 Prompt 被 1 個 Agent 使用中" })
  })
})

describe("listAgents", () => {
  it("打 GET /api/ai/agents", async () => {
    const fn = stubFetch({ items: [{ id: "ag-1", name: "web-chat", display_name: null, model: "claude-sonnet", is_active: true, tools: null, updated_at: "2026-09-02" }], total: 1 })
    const res = await listAgents()
    expect(callOf(fn)[0]).toBe(`${API_BASE}/api/ai/agents`)
    expect(res.items[0].is_active).toBe(true)
  })
})

describe("getAgent", () => {
  it("明細帶回整包 system_prompt 物件", async () => {
    const fn = stubFetch(agentJson)
    const res = await getAgent("ag-1")
    expect(callOf(fn)[0]).toBe(`${API_BASE}/api/ai/agents/ag-1`)
    expect(res.system_prompt?.name).toBe("web-chat-default")
    expect(res.settings).toEqual({ temperature: 0.2 })
  })
})

describe("getAgentByName", () => {
  it("名稱會 encode", async () => {
    const fn = stubFetch(agentJson)
    await getAgentByName("linebot-personal")
    expect(callOf(fn)[0]).toBe(`${API_BASE}/api/ai/agents/by-name/linebot-personal`)
  })
})

describe("createAgent", () => {
  it("POST /api/ai/agents", async () => {
    const fn = stubFetch(agentJson)
    await createAgent({ name: "demo", model: "claude-sonnet", is_active: true, system_prompt_id: "pr-1" })
    const [url, init] = callOf(fn)
    expect(url).toBe(`${API_BASE}/api/ai/agents`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({ name: "demo", model: "claude-sonnet", is_active: true, system_prompt_id: "pr-1" })
  })
})

describe("updateAgent", () => {
  it("PUT，只送變動欄位（停用只送 is_active）", async () => {
    const fn = stubFetch(agentJson)
    await updateAgent("ag-1", { is_active: false })
    const [url, init] = callOf(fn)
    expect(url).toBe(`${API_BASE}/api/ai/agents/ag-1`)
    expect(init.method).toBe("PUT")
    expect(JSON.parse(init.body as string)).toEqual({ is_active: false })
  })
})

describe("deleteAgent", () => {
  it("DELETE /api/ai/agents/{id}", async () => {
    const fn = stubFetch({ success: true })
    await deleteAgent("ag-1")
    const [url, init] = callOf(fn)
    expect(url).toBe(`${API_BASE}/api/ai/agents/ag-1`)
    expect(init.method).toBe("DELETE")
  })
})

describe("testAgent", () => {
  it("POST /api/ai/test，帶 agent_id 與 message", async () => {
    const fn = stubFetch({ success: true, response: "2", error: null, duration_ms: 1200, log_id: "log-1" })
    const res = await testAgent({ agent_id: "ag-1", message: "用一句話回答 1+1" })
    const [url, init] = callOf(fn)
    expect(url).toBe(`${API_BASE}/api/ai/test`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({ agent_id: "ag-1", message: "用一句話回答 1+1" })
    expect(res.log_id).toBe("log-1")
  })

  it("失敗是 200 配 success:false，不是 HTTP 錯誤", async () => {
    stubFetch({ success: false, response: null, error: "Agent 'demo' 已停用", duration_ms: null, log_id: null })
    const res = await testAgent({ agent_id: "ag-1", message: "嗨" })
    expect(res.success).toBe(false)
    expect(res.error).toBe("Agent 'demo' 已停用")
  })
})

describe("getProviderStatus", () => {
  it("打 GET /api/ai/providers/status", async () => {
    const fn = stubFetch({
      mode: "auto",
      providers: { claude: { ready: true }, codex: { ready: false, adapter_binary: true, codex_binary: false, circuit: { state: "closed", consecutive_failures: 0 } } },
      usage: { state: "fresh", utilization: 0.42, five_hour: 0.1, seven_day: 0.42, fetched_at: "2026-09-12T01:00:00+00:00", last_attempt_at: null, last_error: null, consecutive_failures: 0 },
    })
    const res = await getProviderStatus()
    expect(callOf(fn)[0]).toBe(`${API_BASE}/api/ai/providers/status`)
    expect(res.providers.codex.circuit?.state).toBe("closed")
    expect(res.usage.utilization).toBe(0.42)
  })

  it("非管理員拿到 403", async () => {
    stubFetch({ detail: "需要管理員權限" }, 403)
    await expect(getProviderStatus()).rejects.toMatchObject({ status: 403 })
  })
})

describe("parseJsonObject", () => {
  it("空字串＝null", () => {
    expect(parseJsonObject("  ")).toEqual({ ok: true, value: null })
  })

  it("物件解得出來", () => {
    expect(parseJsonObject('{"a": 1}')).toEqual({ ok: true, value: { a: 1 } })
  })

  it("壞掉的 JSON 擋下來", () => {
    expect(parseJsonObject("{")).toEqual({ ok: false, error: "JSON 格式不正確" })
  })

  it("陣列與純量擋下來（後端要 dict）", () => {
    expect(parseJsonObject("[1,2]").ok).toBe(false)
    expect(parseJsonObject('"x"').ok).toBe(false)
  })
})

describe("formatJsonObject", () => {
  it("null 給空字串", () => {
    expect(formatJsonObject(null)).toBe("")
  })

  it("物件排版成兩格縮排", () => {
    expect(formatJsonObject({ a: 1 })).toBe('{\n  "a": 1\n}')
  })
})

describe("isBotPrompt", () => {
  it("認得兩支 bot prompt", () => {
    expect(isBotPrompt("linebot-personal")).toBe(true)
    expect(isBotPrompt("linebot-group")).toBe(true)
    expect(isBotPrompt("web-chat-default")).toBe(false)
  })
})
