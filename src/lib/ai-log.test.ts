import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import { buildLogQuery, contextLabel, getLogStats, listLogs, toDayEnd, toDayStart } from "./ai-log"

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })
})
afterEach(() => vi.unstubAllGlobals())

describe("buildLogQuery", () => {
  it("maps ui filters to api params and skips empties", () => {
    expect(buildLogQuery({ agent: "a1", context: "linebot-group", success: "false", from: "2026-09-01", to: "2026-09-10", page: 2 }))
      .toBe("?agent_id=a1&context_type=linebot-group&success=false&start_date=2026-09-01T00%3A00%3A00&end_date=2026-09-10T23%3A59%3A59&page=2&page_size=50")
    expect(buildLogQuery({})).toBe("?page=1&page_size=50")
    expect(buildLogQuery({ success: "" })).toBe("?page=1&page_size=50")
  })
})

it("day boundaries", () => {
  expect(toDayStart("2026-09-01")).toBe("2026-09-01T00:00:00")
  expect(toDayEnd("2026-09-01")).toBe("2026-09-01T23:59:59")
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
