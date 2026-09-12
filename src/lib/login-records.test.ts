/// <reference types="node" />
process.env.TZ = "Asia/Taipei"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import {
  buildLoginRecordQuery,
  deviceTypeLabel,
  geoLabel,
  getLoginRecord,
  getLoginStats,
  getRecentLogins,
  listLoginRecords,
  successRate,
} from "./login-records"

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

function calledUrl(fn: ReturnType<typeof stubFetch>): string {
  return (fn.mock.calls[0] as unknown as [string])[0]
}

describe("buildLoginRecordQuery", () => {
  it("空篩選只帶分頁", () => {
    expect(buildLoginRecordQuery({})).toBe("?page=1&limit=20")
  })

  it("success=false 不能被 falsy 判斷吃掉", () => {
    expect(buildLoginRecordQuery({ success: false })).toBe("?success=false&page=1&limit=20")
    expect(buildLoginRecordQuery({ success: true })).toBe("?success=true&page=1&limit=20")
  })

  it("使用者名稱、IP 與裝置指紋照後端的參數名帶", () => {
    const params = new URLSearchParams(
      buildLoginRecordQuery({ username: "yazelin", ip: "192.0.2.10", fingerprint: "fp-abc" }).slice(1),
    )
    expect(params.get("username")).toBe("yazelin")
    expect(params.get("ip_address")).toBe("192.0.2.10")
    expect(params.get("device_fingerprint")).toBe("fp-abc")
  })

  // TZ 固定為 Asia/Taipei（見檔案最上方），本地日界轉 UTC 應相差 8 小時。
  it("日期區間轉成本地日的起訖時刻", () => {
    const params = new URLSearchParams(buildLoginRecordQuery({ from: "2026-09-01", to: "2026-09-10" }).slice(1))
    expect(params.get("start_date")).toBe("2026-08-31T16:00:00.000Z")
    expect(params.get("end_date")).toBe("2026-09-10T15:59:59.999Z")
  })

  it("頁碼與每頁筆數", () => {
    expect(buildLoginRecordQuery({ page: 3 }, 50)).toBe("?page=3&limit=50")
  })
})

it("listLoginRecords 打對網址", async () => {
  const fn = stubFetch({ items: [], total: 0, page: 1, limit: 20, total_pages: 1 })
  await listLoginRecords({ success: false, ip: "198.51.100.7" })
  expect(calledUrl(fn)).toBe(`${API_BASE}/api/login-records?success=false&ip_address=198.51.100.7&page=1&limit=20`)
})

it("getRecentLogins 打對網址", async () => {
  const fn = stubFetch({ items: [] })
  await getRecentLogins({ limit: 5 })
  expect(calledUrl(fn)).toBe(`${API_BASE}/api/login-records/recent?limit=5`)
})

it("getRecentLogins 沒參數時不帶問號", async () => {
  const fn = stubFetch({ items: [] })
  await getRecentLogins()
  expect(calledUrl(fn)).toBe(`${API_BASE}/api/login-records/recent`)
})

it("getLoginStats 一律帶 days", async () => {
  const fn = stubFetch({ total: 0, success_count: null, failure_count: null, unique_ips: 0, unique_devices: 0, days: 30 })
  await getLoginStats()
  expect(calledUrl(fn)).toBe(`${API_BASE}/api/login-records/stats?days=30`)
  const fn7 = stubFetch({ total: 1, success_count: 1, failure_count: 0, unique_ips: 1, unique_devices: 1, days: 7 })
  await getLoginStats({ days: 7 })
  expect(calledUrl(fn7)).toBe(`${API_BASE}/api/login-records/stats?days=7`)
})

it("getLoginRecord 打對網址", async () => {
  const fn = stubFetch({ id: 9 })
  await getLoginRecord(9)
  expect(calledUrl(fn)).toBe(`${API_BASE}/api/login-records/9`)
})

describe("顯示用的小工具", () => {
  it("裝置類型對照，認不得的原樣顯示", () => {
    expect(deviceTypeLabel("desktop")).toBe("桌機")
    expect(deviceTypeLabel("unknown")).toBe("未知")
    expect(deviceTypeLabel("watch")).toBe("watch")
    expect(deviceTypeLabel(null)).toBe("—")
  })

  it("地點只有一半也顯示", () => {
    expect(geoLabel({ geo_country: "臺灣", geo_city: "桃園" })).toBe("臺灣／桃園")
    expect(geoLabel({ geo_country: "臺灣", geo_city: null })).toBe("臺灣")
    expect(geoLabel({ geo_country: null, geo_city: null })).toBe("—")
  })

  it("成功率：SUM 回 null 當 0，total 為 0 時不算", () => {
    expect(successRate({ total: 4, success_count: 3, failure_count: 1, unique_ips: 2, unique_devices: 2, days: 30 })).toBe(75)
    expect(successRate({ total: 2, success_count: null, failure_count: 2, unique_ips: 1, unique_devices: 1, days: 30 })).toBe(0)
    expect(successRate({ total: 0, success_count: null, failure_count: null, unique_ips: 0, unique_devices: 0, days: 30 })).toBeNull()
    expect(successRate(undefined)).toBeNull()
  })
})
