import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import { attachmentUrl, getVersion, label, listKnowledge, rebuildIndex, rewriteImageSrc, SCOPE_LABEL, updateKnowledge } from "./kb"
import { setToken } from "./token"

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe("attachmentUrl", () => {
  it("maps nas:// and local:// and relative paths, appending token", () => {
    setToken("T")
    expect(attachmentUrl("nas://knowledge/attachments/kb-001/f.bin")).toBe(`${API_BASE}/api/knowledge/attachments/kb-001/f.bin?token=T`)
    expect(attachmentUrl("local://knowledge/assets/images/kb-001-x.png")).toBe(`${API_BASE}/api/knowledge/assets/images/kb-001-x.png?token=T`)
    expect(attachmentUrl("../assets/images/kb-001-x.png")).toBe(`${API_BASE}/api/knowledge/assets/images/kb-001-x.png?token=T`)
  })
  it("omits token when not logged in", () => {
    expect(attachmentUrl("nas://knowledge/attachments/a/b")).toBe(`${API_BASE}/api/knowledge/attachments/a/b`)
  })
  it("encodes each path segment, including spaces and #", () => {
    setToken("T")
    expect(attachmentUrl("nas://knowledge/attachments/kb-001/a b#1.pdf")).toBe(
      `${API_BASE}/api/knowledge/attachments/kb-001/a%20b%231.pdf?token=T`,
    )
  })
})

describe("rewriteImageSrc", () => {
  it("leaves absolute urls alone and rewrites relative ones", () => {
    setToken("T")
    expect(rewriteImageSrc("https://example.com/a.png")).toBe("https://example.com/a.png")
    expect(rewriteImageSrc("../assets/images/kb-002-b.png")).toBe(`${API_BASE}/api/knowledge/assets/images/kb-002-b.png?token=T`)
  })
})

describe("listKnowledge", () => {
  it("sends only non-empty filters", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0, query: null }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await listKnowledge({ q: "泵", scope: "", type: "knowledge" })
    const url = (fn.mock.calls[0] as unknown as [string])[0]
    expect(url).toBe(`${API_BASE}/api/knowledge?q=%E6%B3%B5&type=knowledge`)
  })
})

it("label falls back to key", () => {
  expect(label(SCOPE_LABEL, "global")).toBe("全域")
  expect(label(SCOPE_LABEL, "weird")).toBe("weird")
})

describe("updateKnowledge", () => {
  it("PUTs changed fields to /api/knowledge/:id", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await updateKnowledge("kb-001", { title: "x" })
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/knowledge/kb-001`)
    expect(init.method).toBe("PUT")
    expect(init.body).toBe(JSON.stringify({ title: "x" }))
  })
})

describe("getVersion", () => {
  it("hits /api/knowledge/:id/version/:commit (singular)", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ id: "kb-001", commit: "abc1234", content: "" }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    await getVersion("kb-001", "abc1234")
    const url = (fn.mock.calls[0] as unknown as [string])[0]
    expect(url).toBe(`${API_BASE}/api/knowledge/kb-001/version/abc1234`)
  })
})

describe("rebuildIndex", () => {
  it("POSTs to /api/knowledge/rebuild-index and returns the stats dict", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ total: 12, errors: ["kb-099.md: 缺少 id"], next_id: 13 }), { status: 200 }))
    vi.stubGlobal("fetch", fn)
    const result = await rebuildIndex()
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/knowledge/rebuild-index`)
    expect(init.method).toBe("POST")
    expect(result).toEqual({ total: 12, errors: ["kb-099.md: 缺少 id"], next_id: 13 })
  })
})
