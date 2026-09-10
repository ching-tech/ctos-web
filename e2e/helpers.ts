import type { Page } from "@playwright/test"

export const API = "https://ching-tech.ddns.net/ctos"

export const userFixture = {
  id: 2, username: "yazelin", display_name: "亞澤", is_admin: false, role: "user",
  account_role: "user", auth_type: "session", has_password: true, nas_username: "yazelin", permissions: {},
}
export const adminFixture = { ...userFixture, id: 1, username: "admin", display_name: "管理員", is_admin: true, role: "admin", account_role: "admin" }

export async function mockApi(page: Page, opts: { user?: typeof userFixture | null; loginOk?: boolean } = {}) {
  const user = opts.user === undefined ? { ...userFixture } : opts.user
  const loginOk = opts.loginOk ?? true
  await page.route(`${API}/api/auth/login`, async (route) => {
    const body = route.request().postDataJSON() as { username: string; password: string; method: string }
    await route.fulfill({ json: loginOk
      ? { success: true, token: "tok-" + body.method, username: body.username, error: null, role: "user", must_change_password: false }
      : { success: false, token: null, username: null, error: "帳號或密碼錯誤", role: null, must_change_password: false } })
  })
  await page.route(`${API}/api/auth/logout`, (route) => route.fulfill({ json: { success: true } }))
  await page.route(`${API}/api/user/me/nas-binding`, async (route) => {
    const method = route.request().method()
    if (method === "DELETE") { if (user) user.nas_username = null; return route.fulfill({ json: { success: true, nas_username: null } }) }
    const body = route.request().postDataJSON() as { nas_username: string; password: string }
    if (body.password === "wrong") return route.fulfill({ status: 401, json: { detail: "NAS 帳號或密碼錯誤" } })
    if (body.nas_username === "taken") return route.fulfill({ status: 409, json: { detail: "此 NAS 帳號已綁定其他使用者" } })
    if (user) user.nas_username = body.nas_username
    return route.fulfill({ json: { success: true, nas_username: body.nas_username } })
  })
  await page.route(`${API}/api/user/me`, (route) => {
    const auth = route.request().headers()["authorization"]
    if (!auth || !user) return route.fulfill({ status: 401, json: { detail: "未授權" } })
    return route.fulfill({ json: user })
  })
}

export async function seedToken(page: Page, token = "tok-seeded") {
  await page.addInitScript((t) => localStorage.setItem("ctos-web.token", t), token)
}

export interface KbAttachmentFixture {
  type: string
  path: string
  size: string | null
  description: string | null
}

export interface KbFixture {
  id: string
  title: string
  type: string
  category: string
  scope: "global" | "personal" | "project"
  owner: string | null
  project_id: string | null
  is_public: boolean
  tags: { projects: string[]; roles: string[]; topics: string[]; level: string | null }
  author: string
  updated_at: string
  created_at: string
  source: { project: string | null; path: string | null; commit: string | null }
  related: string[]
  content: string
  attachments: KbAttachmentFixture[]
}

export const kbFixtures: KbFixture[] = [
  {
    id: "kb-001",
    title: "泵浦保養 SOP",
    type: "knowledge",
    category: "technical",
    scope: "global",
    owner: "yazelin",
    project_id: null,
    is_public: true,
    tags: { projects: [], roles: [], topics: [], level: null },
    author: "yazelin",
    updated_at: "2026-09-01",
    created_at: "2026-09-01",
    source: { project: null, path: null, commit: null },
    related: [],
    content: "# 保養步驟\n\n1. 停機斷電\n2. 檢查油封與軸承\n\n![圖](../assets/images/kb-001-a.png)\n",
    attachments: [
      { type: "document", path: "nas://knowledge/attachments/kb-001/manual.pdf", size: "2 MB", description: null },
    ],
  },
  {
    id: "kb-002",
    title: "客戶報價流程",
    type: "reference",
    category: "business",
    scope: "personal",
    owner: "yazelin",
    project_id: null,
    is_public: false,
    tags: { projects: [], roles: [], topics: [], level: null },
    author: "yazelin",
    updated_at: "2026-09-02",
    created_at: "2026-09-02",
    source: { project: null, path: null, commit: null },
    related: [],
    content: "# 報價流程\n\n1. 確認客戶需求\n2. 估算成本\n3. 送出報價單\n",
    attachments: [],
  },
  {
    id: "kb-003",
    title: "案場巡檢清單",
    type: "operations",
    category: "management",
    scope: "project",
    owner: "yazelin",
    project_id: "proj-1",
    is_public: false,
    tags: { projects: [], roles: [], topics: [], level: null },
    author: "yazelin",
    updated_at: "2026-09-03",
    created_at: "2026-09-03",
    source: { project: "proj-1", path: null, commit: null },
    related: [],
    content: "# 巡檢項目\n\n1. 設備運轉狀態\n2. 安全防護\n",
    attachments: [],
  },
]

export interface KbTagsOverride {
  projects?: string[]
  types?: string[]
  categories?: string[]
  roles?: string[]
  levels?: string[]
  topics?: string[]
}

export async function mockKb(page: Page, opts: { items?: KbFixture[]; tags?: KbTagsOverride } = {}) {
  const items: KbFixture[] = (opts.items ?? kbFixtures).map((i) => ({ ...i }))
  const base = new URL(API)
  const prefix = base.pathname.replace(/\/$/, "")
  const sameOrigin = (url: URL) => url.origin === base.origin

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/knowledge/tags`,
    async (route) => {
      await route.fulfill({
        json: {
          projects: opts.tags?.projects ?? [],
          types: opts.tags?.types ?? Array.from(new Set(items.map((i) => i.type))),
          categories: opts.tags?.categories ?? Array.from(new Set(items.map((i) => i.category))),
          roles: opts.tags?.roles ?? [],
          levels: opts.tags?.levels ?? [],
          topics: opts.tags?.topics ?? [],
        },
      })
    },
  )

  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/knowledge/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const rest = url.pathname.slice(detailPrefix.length)
      return rest.length > 0 && !rest.includes("/") && rest !== "tags"
    },
    async (route) => {
      const id = new URL(route.request().url()).pathname.split("/").pop()!
      const idx = items.findIndex((i) => i.id === id)
      if (idx === -1) return route.fulfill({ status: 404, json: { detail: "找不到" } })
      if (route.request().method() === "DELETE") {
        items.splice(idx, 1)
        return route.fulfill({ json: { success: true } })
      }
      return route.fulfill({ json: items[idx] })
    },
  )

  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/knowledge/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const parts = url.pathname.slice(detailPrefix.length).split("/")
      return parts.length === 2 && parts[1] === "attachments"
    },
    async (route) => {
      const id = new URL(route.request().url()).pathname.split("/").slice(-2)[0]
      const item = items.find((i) => i.id === id)
      if (!item) return route.fulfill({ status: 404, json: { detail: "找不到" } })
      // 從 multipart body 抓 Content-Disposition 的 filename
      const body = route.request().postData() ?? ""
      const match = body.match(/filename="([^"]*)"/)
      const filename = match?.[1] || "file"
      const attachment = { type: "file", path: `nas://knowledge/attachments/${id}/${filename}`, size: "1 KB", description: null }
      item.attachments.push(attachment)
      return route.fulfill({ json: attachment })
    },
  )

  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/knowledge/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const parts = url.pathname.slice(detailPrefix.length).split("/")
      return parts.length === 3 && parts[1] === "attachments"
    },
    async (route) => {
      const segs = new URL(route.request().url()).pathname.split("/")
      const idx = Number(segs[segs.length - 1])
      const id = segs[segs.length - 3]
      const item = items.find((i) => i.id === id)
      if (!item) return route.fulfill({ status: 404, json: { detail: "找不到" } })
      item.attachments.splice(idx, 1)
      return route.fulfill({ json: { success: true } })
    },
  )

  await page.route(`${API}/api/knowledge/attachments/**`, async (route) => {
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"),
    })
  })

  await page.route(`${API}/api/knowledge/assets/**`, async (route) => {
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"),
    })
  })

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/knowledge`,
    async (route) => {
      const reqUrl = new URL(route.request().url())
      const q = reqUrl.searchParams.get("q") ?? ""
      const scope = reqUrl.searchParams.get("scope") ?? ""
      const type = reqUrl.searchParams.get("type") ?? ""
      const category = reqUrl.searchParams.get("category") ?? ""
      let filtered = items
      if (q) filtered = filtered.filter((i) => i.title.includes(q))
      if (scope) filtered = filtered.filter((i) => i.scope === scope)
      if (type) filtered = filtered.filter((i) => i.type === type)
      if (category) filtered = filtered.filter((i) => i.category === category)
      const result = filtered.map((i) => ({
        id: i.id,
        title: i.title,
        type: i.type,
        category: i.category,
        scope: i.scope,
        owner: i.owner,
        project_id: i.project_id,
        is_public: i.is_public,
        tags: i.tags,
        author: i.author,
        updated_at: i.updated_at,
        snippet: q ? `…含 ${q} 的片段…` : null,
      }))
      await route.fulfill({ json: { items: result, total: result.length, query: q || null } })
    },
  )

  return { items }
}
