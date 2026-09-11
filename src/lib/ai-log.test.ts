/// <reference types="node" />
process.env.TZ = "Asia/Taipei"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import type { ParsedResponse, ToolCallEntry } from "./ai-log"
import { buildLogQuery, contextLabel, getLogStats, listLogs, toDayEnd, toDayStart, toolDisplayName, toolDurationMs, usedToolsFrom } from "./ai-log"

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })
})
afterEach(() => vi.unstubAllGlobals())

describe("buildLogQuery", () => {
  it("maps ui filters to api params and skips empties", () => {
    expect(buildLogQuery({ agent: "a1", context: "linebot-group", success: "false", from: "2026-09-01", to: "2026-09-10", page: 2 }))
      .toBe("?agent_id=a1&context_type=linebot-group&success=false&start_date=2026-08-31T16%3A00%3A00.000Z&end_date=2026-09-10T15%3A59%3A59.999Z&page=2&page_size=50")
    expect(buildLogQuery({})).toBe("?page=1&page_size=50")
    expect(buildLogQuery({ success: "" })).toBe("?page=1&page_size=50")
  })
})

// TZ 固定為 Asia/Taipei（見檔案最上方），local day 00:00/23:59:59.999 轉成 UTC 瞬間應相差 8 小時。
it("day boundaries", () => {
  const start = toDayStart("2026-09-01")
  const end = toDayEnd("2026-09-01")
  expect(start.endsWith("Z")).toBe(true)
  expect(end.endsWith("Z")).toBe(true)
  expect(new Date(start).getTime()).toBe(new Date("2026-09-01T00:00:00").getTime())
  expect(new Date(end).getTime()).toBe(new Date("2026-09-01T23:59:59.999").getTime())
})

it("context labels", () => {
  expect(contextLabel("linebot-group")).toBe("Line 群組")
  expect(contextLabel("weird")).toBe("weird")
  expect(contextLabel(null)).toBe("—")
})

it("listLogs and getLogStats hit the right urls", async () => {
  const fn = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0, page: 1, page_size: 50 }), { status: 200 }))
  vi.stubGlobal("fetch", fn)
  await listLogs({ context: "test" })
  expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(`${API_BASE}/api/ai/logs?context_type=test&page=1&page_size=50`)
  await getLogStats({ agent: "a1" })
  expect((fn.mock.calls[1] as unknown as [string])[0]).toBe(`${API_BASE}/api/ai/logs/stats?agent_id=a1`)
})

describe("toolDisplayName", () => {
  it("一般工具直接顯示名稱", () => {
    const tc: ToolCallEntry = { id: "toolu_01", name: "ToolSearch", input: { query: "泵浦" }, output: "找到 2 筆" }
    expect(toolDisplayName(tc)).toBe("ToolSearch")
  })

  it("run_skill_script 帶 skill 與 script 顯示 skill/script", () => {
    const tc: ToolCallEntry = { id: "toolu_02", name: "run_skill_script", input: { skill: "base", script: "list_files" }, output: null }
    expect(toolDisplayName(tc)).toBe("run_skill_script(base/list_files)")
  })

  it("run_skill_script 只有 skill 沒有 script 顯示 skill", () => {
    const tc: ToolCallEntry = { id: "toolu_03", name: "run_skill_script", input: { skill: "base" }, output: null }
    expect(toolDisplayName(tc)).toBe("run_skill_script(base)")
  })
})

describe("usedToolsFrom", () => {
  it("依序去重", () => {
    const parsed: ParsedResponse = {
      tool_calls: [
        { id: "1", name: "ToolSearch", input: {}, output: null },
        { id: "2", name: "run_skill_script", input: { skill: "base", script: "list_files" }, output: null },
        { id: "3", name: "ToolSearch", input: {}, output: null },
      ],
    }
    expect(usedToolsFrom(parsed)).toEqual(["ToolSearch", "run_skill_script(base/list_files)"])
  })

  it("null 或沒有 tool_calls 回空陣列", () => {
    expect(usedToolsFrom(null)).toEqual([])
    expect(usedToolsFrom({ source: "scheduler" })).toEqual([])
  })
})

describe("toolDurationMs", () => {
  it("tool_timings 與 tool_calls 同長時依索引取值", () => {
    const parsed: ParsedResponse = {
      tool_calls: [
        { id: "1", name: "ToolSearch", input: {}, output: null },
        { id: "2", name: "run_skill_script", input: {}, output: null },
      ],
      tool_timings: [
        { name: "ToolSearch", duration_ms: 24 },
        { name: "run_skill_script", duration_ms: 310 },
      ],
    }
    expect(toolDurationMs(parsed, 0)).toBe(24)
    expect(toolDurationMs(parsed, 1)).toBe(310)
  })

  it("長度不等時回 null", () => {
    const parsed: ParsedResponse = {
      tool_calls: [
        { id: "1", name: "ToolSearch", input: {}, output: null },
        { id: "2", name: "run_skill_script", input: {}, output: null },
      ],
      tool_timings: [{ name: "ToolSearch", duration_ms: 24 }],
    }
    expect(toolDurationMs(parsed, 0)).toBeNull()
  })

  it("沒有 tool_timings 時回 null", () => {
    const parsed: ParsedResponse = { tool_calls: [{ id: "1", name: "ToolSearch", input: {}, output: null }] }
    expect(toolDurationMs(parsed, 0)).toBeNull()
  })
})
