import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import {
  listShareLinks,
  revokeShareLink,
  shareKeys,
  shareLinkTitle,
  shareResourceHref,
  shareResourceTypeLabel,
} from "./share"
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

describe("listShareLinks", () => {
  it("預設帶 view=mine", async () => {
    const fn = okResponse({ links: [], is_admin: false })
    vi.stubGlobal("fetch", fn)
    await listShareLinks()
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/share?view=mine`)
    expect(init.method ?? "GET").toBe("GET")
  })

  it("view=all 原樣送出，回傳的 is_admin 與 links 照收", async () => {
    const fn = okResponse({
      links: [
        {
          token: "abc", url: "/s/abc", full_url: "https://example.invalid/s/abc",
          resource_type: "knowledge", resource_id: "kb-001", resource_title: "電控盤標準接線",
          expires_at: null, access_count: 3, created_at: "2026-09-01T02:00:00Z",
          created_by: "someone", is_expired: false, has_password: false,
        },
      ],
      is_admin: true,
    })
    vi.stubGlobal("fetch", fn)
    const res = await listShareLinks("all")
    const [url] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/share?view=all`)
    expect(res.is_admin).toBe(true)
    expect(res.links[0].created_by).toBe("someone")
    expect(res.links[0].expires_at).toBeNull()
  })
})

describe("revokeShareLink", () => {
  it("DELETE /api/share/:token，204 沒有 body 也不會炸", async () => {
    const fn = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fn)
    await expect(revokeShareLink("abc")).resolves.toBeUndefined()
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/share/abc`)
    expect(init.method).toBe("DELETE")
  })

  it("token 進網址前先 encode", async () => {
    const fn = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fn)
    await revokeShareLink("a/b c")
    const [url] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/share/a%2Fb%20c`)
  })

  it("403 丟出後端的 detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "您沒有權限撤銷此連結" }), { status: 403 })),
    )
    await expect(revokeShareLink("abc")).rejects.toThrow("您沒有權限撤銷此連結")
  })
})

describe("shareResourceTypeLabel", () => {
  it("五種資源類型都有中文", () => {
    expect(shareResourceTypeLabel("knowledge")).toBe("知識庫")
    expect(shareResourceTypeLabel("project")).toBe("專案")
    expect(shareResourceTypeLabel("nas_file")).toBe("檔案")
    expect(shareResourceTypeLabel("project_attachment")).toBe("專案附件")
    expect(shareResourceTypeLabel("content")).toBe("內容")
  })

  it("對不到的顯示原本的值", () => {
    expect(shareResourceTypeLabel("something_new")).toBe("something_new")
  })
})

describe("shareResourceHref", () => {
  it("knowledge 連知識庫、project 連專案", () => {
    expect(shareResourceHref({ resource_type: "knowledge", resource_id: "kb-001" })).toBe("/kb/kb-001")
    expect(shareResourceHref({ resource_type: "project", resource_id: "7" })).toBe("/projects/7")
  })

  it("沒有落點的類型不給連結", () => {
    expect(shareResourceHref({ resource_type: "nas_file", resource_id: "/mnt/nas/projects/a.pdf" })).toBeNull()
    expect(shareResourceHref({ resource_type: "content", resource_id: "" })).toBeNull()
    expect(shareResourceHref({ resource_type: "project_attachment", resource_id: "att-1" })).toBeNull()
  })
})

describe("shareLinkTitle", () => {
  it("nas_file 顯示路徑，不是後端只給檔名的 resource_title", () => {
    expect(
      shareLinkTitle({ resource_type: "nas_file", resource_id: "/mnt/nas/projects/圖面.pdf", resource_title: "圖面.pdf" }),
    ).toBe("/mnt/nas/projects/圖面.pdf")
  })

  it("其他類型用 resource_title", () => {
    expect(shareLinkTitle({ resource_type: "knowledge", resource_id: "kb-001", resource_title: "電控盤標準接線" })).toBe(
      "電控盤標準接線",
    )
    expect(shareLinkTitle({ resource_type: "content", resource_id: "", resource_title: "分享內容" })).toBe("分享內容")
  })
})

describe("shareKeys", () => {
  it("兩種檢視各自一把 query key", () => {
    expect(shareKeys.list("mine")).not.toEqual(shareKeys.list("all"))
  })
})
