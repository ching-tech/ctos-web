/// <reference types="node" />
process.env.TZ = "Asia/Taipei"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import { chatQueryOptions, chatTimeLabel, createChat, deleteChat, isForChat, listChats, toolCallsOf, updateChat, visibleMessages } from "./assistant"
import type { ChatMessage } from "./assistant"
import { socketTarget } from "./socket"

beforeEach(() => {
  const store = new Map<string, string>([["ctos-web.token", "tok-1"]])
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})
afterEach(() => vi.unstubAllGlobals())

function stubFetch(json: unknown) {
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(json), { status: 200, headers: { "Content-Type": "application/json" } }),
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("REST 客戶端", () => {
  it("打的是 /api/ai/chats，帶 Bearer token", async () => {
    const fetchMock = stubFetch([])
    await listChats()
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/api/ai/chats`)
    const init = fetchMock.mock.calls[0][1]!
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-1")
  })

  it("建立對話用 POST，body 是後端 ChatCreate 的欄位", async () => {
    const fetchMock = stubFetch({})
    await createChat({ title: "新對話", model: "claude-sonnet", prompt_name: "personal-assistant" })
    const init = fetchMock.mock.calls[0][1]!
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({ title: "新對話", model: "claude-sonnet", prompt_name: "personal-assistant" })
  })

  it("改標題用 PATCH、刪除用 DELETE", async () => {
    const fetchMock = stubFetch({})
    await updateChat("c-1", { title: "出貨追蹤" })
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/api/ai/chats/c-1`)
    expect((fetchMock.mock.calls[0][1]!).method).toBe("PATCH")

    await deleteChat("c-1")
    expect(fetchMock.mock.calls[1][1]!.method).toBe("DELETE")
  })
})

describe("chatQueryOptions", () => {
  // 送出後使用者那則是樂觀塞進快取的，後端要等 AI 跑完才寫進 DB；
  // 這段期間視窗重新取得焦點若重抓，剛打的字會被洗掉。
  it("關掉視窗聚焦重抓", () => {
    expect(chatQueryOptions("c-1").refetchOnWindowFocus).toBe(false)
  })

  it("沒有選對話時不發請求", () => {
    expect(chatQueryOptions(null).enabled).toBe(false)
    expect(chatQueryOptions("c-1").enabled).toBe(true)
  })
})

describe("socketTarget", () => {
  it("把 base 的路徑前綴接到 /socket.io/ 前面", () => {
    expect(socketTarget("https://ching-tech.ddns.net/ctos")).toEqual({
      origin: "https://ching-tech.ddns.net",
      path: "/ctos/socket.io/",
    })
  })

  it("base 沒有前綴時就是根目錄的 /socket.io/", () => {
    expect(socketTarget("http://127.0.0.1:8088")).toEqual({ origin: "http://127.0.0.1:8088", path: "/socket.io/" })
  })
})

describe("事件處理", () => {
  it("只收目前這串對話的事件", () => {
    expect(isForChat({ chatId: "a" }, "a")).toBe(true)
    expect(isForChat({ chatId: "b" }, "a")).toBe(false)
    expect(isForChat(undefined, "a")).toBe(false)
    expect(isForChat({ chatId: "a" }, null)).toBe(false)
  })

  it("tool_calls 與 toolCalls 都收，空的回 undefined", () => {
    const call = { id: "t1", name: "search_knowledge", input: {}, output: null }
    expect(toolCallsOf({ tool_calls: [call] })).toEqual([call])
    expect(toolCallsOf({ toolCalls: [call] })).toEqual([call])
    expect(toolCallsOf({ tool_calls: [] })).toBeUndefined()
    expect(toolCallsOf({})).toBeUndefined()
  })
})

describe("visibleMessages", () => {
  it("留下使用者與助手訊息，system 只留壓縮摘要", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "[對話摘要]\n前面聊了出貨", timestamp: 1, is_summary: true },
      { role: "system", content: "內部指令", timestamp: 2 },
      { role: "user", content: "嗨", timestamp: 3 },
      { role: "assistant", content: "你好", timestamp: 4 },
    ]
    expect(visibleMessages(messages).map((m) => m.content)).toEqual(["[對話摘要]\n前面聊了出貨", "嗨", "你好"])
  })
})

describe("chatTimeLabel", () => {
  const now = new Date("2026-09-12T10:00:00+08:00")

  it("今天顯示時分，其他天顯示月日", () => {
    expect(chatTimeLabel("2026-09-12T01:30:00Z", now)).toBe("09:30")
    expect(chatTimeLabel("2026-09-09T01:00:00Z", now)).toBe("09/09")
  })

  it("時間壞掉時給空字串，不要炸掉清單", () => {
    expect(chatTimeLabel("not-a-date", now)).toBe("")
  })
})
