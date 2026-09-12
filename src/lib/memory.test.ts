import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import { createMemory, deleteMemory, listMemories, updateMemory } from "./memory"

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})
afterEach(() => vi.unstubAllGlobals())

const memoryJson = {
  id: "mem-1",
  title: "出貨前先報數量",
  content: "報數量再出貨。",
  is_active: true,
  created_at: "2026-09-01T09:00:00",
  updated_at: "2026-09-01T09:00:00",
  created_by: null,
  created_by_name: null,
}

function stubFetch(json: unknown, status = 200) {
  const fn = vi.fn(async () => new Response(JSON.stringify(json), { status }))
  vi.stubGlobal("fetch", fn)
  return fn
}

function callOf(fn: ReturnType<typeof stubFetch>, i = 0): [string, RequestInit] {
  return fn.mock.calls[i] as unknown as [string, RequestInit]
}

describe("listMemories", () => {
  it("群組打 GET /api/bot/groups/{id}/memories", async () => {
    const fn = stubFetch({ items: [memoryJson], total: 1 })
    const res = await listMemories("group", "grp-1")
    expect(callOf(fn)[0]).toBe(`${API_BASE}/api/bot/groups/grp-1/memories`)
    expect(res.total).toBe(1)
    expect(res.items[0].id).toBe("mem-1")
  })

  it("個人打 GET /api/bot/users/{id}/memories", async () => {
    const fn = stubFetch({ items: [], total: 0 })
    await listMemories("user", "usr-1")
    expect(callOf(fn)[0]).toBe(`${API_BASE}/api/bot/users/usr-1/memories`)
  })
})

describe("createMemory", () => {
  it("群組打 POST，body 只有 title 與 content", async () => {
    const fn = stubFetch(memoryJson, 200)
    await createMemory("group", "grp-1", { title: "出貨前先報數量", content: "報數量再出貨。" })
    const [url, init] = callOf(fn)
    expect(url).toBe(`${API_BASE}/api/bot/groups/grp-1/memories`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({ title: "出貨前先報數量", content: "報數量再出貨。" })
  })

  it("個人打 POST /api/bot/users/{id}/memories", async () => {
    const fn = stubFetch(memoryJson, 200)
    await createMemory("user", "usr-1", { title: "稱呼", content: "叫我小明就好。" })
    const [url, init] = callOf(fn)
    expect(url).toBe(`${API_BASE}/api/bot/users/usr-1/memories`)
    expect(init.method).toBe("POST")
  })
})

describe("updateMemory", () => {
  it("PUT /api/bot/memories/{id}，只送有改的欄位", async () => {
    const fn = stubFetch({ ...memoryJson, is_active: false })
    await updateMemory("mem-1", { is_active: false })
    const [url, init] = callOf(fn)
    expect(url).toBe(`${API_BASE}/api/bot/memories/mem-1`)
    expect(init.method).toBe("PUT")
    expect(JSON.parse(init.body as string)).toEqual({ is_active: false })
  })
})

describe("deleteMemory", () => {
  it("DELETE /api/bot/memories/{id}；404 的 detail 原樣丟出來", async () => {
    const fn = stubFetch({ status: "ok", message: "記憶已刪除" })
    await deleteMemory("mem-1")
    const [url, init] = callOf(fn)
    expect(url).toBe(`${API_BASE}/api/bot/memories/mem-1`)
    expect(init.method).toBe("DELETE")

    stubFetch({ detail: "Memory not found" }, 404)
    await expect(deleteMemory("mem-x")).rejects.toMatchObject({ status: 404, detail: "Memory not found" })
  })
})
