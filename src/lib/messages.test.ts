/// <reference types="node" />
process.env.TZ = "Asia/Taipei"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import {
  buildMessageQuery,
  getMessage,
  getUnreadCount,
  listMessages,
  markRead,
  severityLabel,
  sourceLabel,
} from "./messages"

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})
afterEach(() => vi.unstubAllGlobals())

function stubFetch(json: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(json), { status: 200 }))
  vi.stubGlobal("fetch", fn)
  return fn
}

describe("buildMessageQuery", () => {
  it("陣列參數同名重複帶，不串成逗號", () => {
    const qs = buildMessageQuery({ severity: ["warning", "error"], source: ["system", "security"] })
    const params = new URLSearchParams(qs.slice(1))
    expect(params.getAll("severity")).toEqual(["warning", "error"])
    expect(params.getAll("source")).toEqual(["system", "security"])
    expect(qs).toBe("?severity=warning&severity=error&source=system&source=security&page=1&limit=20")
  })

  it("空篩選只帶分頁", () => {
    expect(buildMessageQuery({})).toBe("?page=1&limit=20")
  })

  it("is_read=false 不能被 falsy 判斷吃掉", () => {
    expect(buildMessageQuery({ isRead: false })).toBe("?is_read=false&page=1&limit=20")
    expect(buildMessageQuery({ isRead: true })).toBe("?is_read=true&page=1&limit=20")
  })

  // TZ 固定為 Asia/Taipei（見檔案最上方），本地日界轉 UTC 應相差 8 小時。
  it("日期區間轉成本地日的起訖時刻", () => {
    const params = new URLSearchParams(buildMessageQuery({ from: "2026-09-01", to: "2026-09-10" }).slice(1))
    expect(params.get("start_date")).toBe("2026-08-31T16:00:00.000Z")
    expect(params.get("end_date")).toBe("2026-09-10T15:59:59.999Z")
  })

  it("搜尋與頁碼", () => {
    expect(buildMessageQuery({ search: "登入", page: 3 })).toBe("?search=%E7%99%BB%E5%85%A5&page=3&limit=20")
  })

  it("依使用者篩選帶 user_id", () => {
    expect(buildMessageQuery({ userId: 3 })).toBe("?user_id=3&page=1&limit=20")
  })
})

it("listMessages 打對網址", async () => {
  const fn = stubFetch({ items: [], total: 0, page: 1, limit: 20, total_pages: 1 })
  await listMessages({ severity: ["error"], isRead: false })
  expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(
    `${API_BASE}/api/messages?severity=error&is_read=false&page=1&limit=20`,
  )
})

it("getMessage 打對網址", async () => {
  const fn = stubFetch({ id: 7, title: "t" })
  await getMessage(7)
  expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(`${API_BASE}/api/messages/7`)
})

it("getUnreadCount 打對網址", async () => {
  const fn = stubFetch({ count: 5 })
  const res = await getUnreadCount()
  expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(`${API_BASE}/api/messages/unread-count`)
  expect(res.count).toBe(5)
})

describe("markRead", () => {
  it("帶 ids 用 POST 送 JSON", async () => {
    const fn = stubFetch({ marked_count: 2 })
    const res = await markRead({ ids: [1, 2] })
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/messages/mark-read`)
    expect(init.method).toBe("POST")
    expect(init.body).toBe('{"ids":[1,2]}')
    expect(res.marked_count).toBe(2)
  })

  it("all=true", async () => {
    const fn = stubFetch({ marked_count: 9 })
    await markRead({ all: true })
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.body).toBe('{"all":true}')
  })

  it("帶 userId 時 user_id 是查詢字串，不進請求體（api/messages.py 88–89）", async () => {
    const fn = stubFetch({ marked_count: 5 })
    await markRead({ all: true }, 3)
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/messages/mark-read?user_id=3`)
    expect(init.body).toBe('{"all":true}')
  })
})

it("標籤對照", () => {
  expect(severityLabel("critical")).toBe("嚴重")
  expect(sourceLabel("security")).toBe("安全")
  // 後端若新增值，直接顯示原字串而不是空白
  expect(severityLabel("fatal")).toBe("fatal")
  expect(sourceLabel("scheduler")).toBe("scheduler")
})
