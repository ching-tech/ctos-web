import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import { attachmentUrl, label, listKnowledge, rewriteImageSrc, SCOPE_LABEL } from "./kb"
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
