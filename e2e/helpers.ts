import type { Page } from "@playwright/test"

export const API = "https://ching-tech.ddns.net/ctos"

// 1×1 透明 PNG，供圖片預覽 e2e 用（檔案下載 mock 回傳給 image 類型的檔案）。
export const ONE_PX_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
)

export const userFixture = {
  id: 2, username: "yazelin", display_name: "亞澤", is_admin: false, role: "user",
  account_role: "user", auth_type: "session", has_password: true, nas_username: "yazelin",
  permissions: {
    apps: { "knowledge-base": true, "ai-log": false, linebot: true, settings: true, "project-management": true, "ai-assistant": true, "vendor-management": true, "inventory-management": true, "file-manager": true, "memory-manager": true },
    knowledge: { global_write: false, global_delete: false },
  },
}
export const adminFixture = {
  ...userFixture, id: 1, username: "admin", display_name: "管理員", is_admin: true, role: "admin", account_role: "admin",
  permissions: {
    apps: { "knowledge-base": true, "ai-log": true, linebot: true, settings: true, "project-management": true, "ai-assistant": true, "vendor-management": true, "inventory-management": true, "file-manager": true, "memory-manager": true },
    knowledge: { global_write: true, global_delete: true },
  },
}

/** `ApiTokenInfo`（ching-tech-os models/auth.py 87–97）。 */
export interface ApiTokenFixture {
  id: number
  name: string
  scopes: string[]
  read_only: boolean
  expires_at: string | null
  last_used_at: string | null
  created_at: string
}

export const apiTokenFixtures: ApiTokenFixture[] = [
  {
    id: 1, name: "筆電 CLI", scopes: ["knowledge-base"], read_only: true,
    expires_at: "2027-03-11T00:00:00Z", last_used_at: "2026-09-10T08:30:00Z", created_at: "2026-09-01T02:00:00Z",
  },
  {
    id: 2, name: "夜間備份", scopes: [], read_only: false,
    expires_at: null, last_used_at: null, created_at: "2026-08-20T02:00:00Z",
  },
]

/** 建立時回傳一次的原始 token（services/api_token.py 25、36–38）。 */
export const CREATED_PAT = "ctos_pat_ZmFrZS10b2tlbi1mb3ItZTJlLW9ubHk"

export async function mockApi(
  page: Page,
  opts: {
    user?: typeof userFixture | null
    loginOk?: boolean
    apiTokens?: ApiTokenFixture[]
    /** 以 PAT 換發／撤銷 token 時後端回 403（api/auth.py 486–490、532–536）。 */
    patSession?: boolean
    /** 第一次 DELETE 回 500，之後照常成功；用來驗錯誤訊息會不會被下一次成功清掉。 */
    failRevokeOnce?: boolean
    /** 目前密碼「正確」的那一組；填別的會拿到後端的 `success:false` 與 error（api/auth.py 596–601）。 */
    currentPassword?: string
    /**
     * `GET /api/user/preferences` 回的主題（api/user.py 247–259），預設 "dark"。
     * 刻意允許 dark／light 以外的字串，用來模擬 ching-tech-os #240 把 preferences 寫壞之後
     * 讀回來的值前端認不得的情況。
     */
    theme?: string
    /** PUT 一律回 400，模擬後端拒絕（api/user.py 277–281）。 */
    themeUpdateFails?: boolean
    /**
     * header 鈴鐺的未讀數（`GET /api/messages/unread-count`，api/messages.py 68–83）。
     * 這支端點每一頁都會打，所以放進共用 mock；要測訊息中心本身請改用 `mockMessages`，
     * 它註冊得比較晚會蓋過這裡（Playwright 由後註冊的 handler 先比對）。
     */
    unreadCount?: number
  } = {},
) {
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
  const apiTokens = opts.apiTokens ?? apiTokenFixtures.map((t) => ({ ...t }))
  let nextTokenId = 100
  await page.route(`${API}/api/auth/tokens`, async (route) => {
    if (route.request().method() === "POST") {
      if (opts.patSession) {
        return route.fulfill({
          status: 403,
          json: { detail: "不可使用 API token 換發新 token，請以帳號密碼登入後再操作" },
        })
      }
      const body = route.request().postDataJSON() as {
        name: string; scopes: string[]; expires_days: number | null; read_only: boolean
      }
      const info: ApiTokenFixture = {
        id: nextTokenId++,
        name: body.name,
        scopes: body.scopes,
        read_only: body.read_only,
        expires_at: body.expires_days === null ? null : "2027-03-11T00:00:00Z",
        last_used_at: null,
        created_at: "2026-09-12T02:00:00Z",
      }
      apiTokens.unshift(info)
      return route.fulfill({ status: 201, json: { success: true, token: CREATED_PAT, info } })
    }
    return route.fulfill({ json: { success: true, tokens: apiTokens } })
  })
  let revokeFailuresLeft = opts.failRevokeOnce ? 1 : 0
  await page.route(`${API}/api/auth/tokens/*`, async (route) => {
    if (revokeFailuresLeft > 0) {
      revokeFailuresLeft -= 1
      return route.fulfill({ status: 500, json: { detail: "資料庫暫時連不上" } })
    }
    if (opts.patSession) {
      return route.fulfill({
        status: 403,
        json: { detail: "不可使用 API token 撤銷 token，請以帳號密碼登入後再操作" },
      })
    }
    const id = Number(new URL(route.request().url()).pathname.split("/").pop())
    const index = apiTokens.findIndex((t) => t.id === id)
    if (index === -1) return route.fulfill({ status: 404, json: { detail: "token 不存在" } })
    apiTokens.splice(index, 1)
    return route.fulfill({ json: { success: true } })
  })
  // `POST /api/auth/change-password`（api/auth.py 566–631）：失敗也是 200，只有 body 不一樣。
  const currentPassword = opts.currentPassword ?? "old12345"
  await page.route(`${API}/api/auth/change-password`, async (route) => {
    const body = route.request().postDataJSON() as { current_password?: string; new_password: string }
    const hasPassword = Boolean(user?.has_password)
    if (hasPassword && !body.current_password) {
      return route.fulfill({ json: { success: false, error: "請輸入目前密碼" } })
    }
    if (hasPassword && body.current_password !== currentPassword) {
      return route.fulfill({ json: { success: false, error: "目前密碼錯誤" } })
    }
    if (body.new_password.length < 8) {
      return route.fulfill({ json: { success: false, error: "密碼需至少 8 個字元" } })
    }
    if (user) user.has_password = true
    return route.fulfill({ json: { success: true, error: null } })
  })
  // 偏好設定（api/user.py 247–293）。每一頁登入後都會 GET 一次，所以放在共用 mock 裡。
  let theme: string = opts.theme ?? "dark"
  await page.route(`${API}/api/user/preferences`, async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { theme?: string }
      if (opts.themeUpdateFails || (body.theme !== "dark" && body.theme !== "light")) {
        return route.fulfill({ status: 400, json: { detail: "無效的主題值，必須為 'dark' 或 'light'" } })
      }
      theme = body.theme
      return route.fulfill({ json: { success: true, preferences: { theme } } })
    }
    return route.fulfill({ json: { theme } })
  })
  await page.route(`${API}/api/messages/unread-count`, (route) =>
    route.fulfill({ json: { count: opts.unreadCount ?? 0 } }),
  )
  await page.route(`${API}/api/user/me`, (route) => {
    const auth = route.request().headers()["authorization"]
    if (!auth || !user) return route.fulfill({ status: 401, json: { detail: "未授權" } })
    return route.fulfill({ json: user })
  })
  // 設定頁的語音區塊一進頁面就會打這三支，先給一組預設；要測語音本身請在後面再呼叫
  // `mockVoice`，它註冊得比較晚會蓋過這裡（Playwright 由後註冊的 handler 先比對）。
  await mockVoice(page, { isAdmin: Boolean(user?.is_admin) })
}

/**
 * 攔住所有沒被其他 mock* 接走的後端請求，記下來並回 599，讓漏 mock 的測試失敗，
 * 而不是安靜地打到正式機。必須在其他 mock* 之前呼叫：Playwright 由後註冊的
 * handler 先比對，先註冊的這支只會在沒人接手時才輪到。
 *
 * 用 route 而不是 page.on("request")：被 route 攔下的請求一樣會觸發 request 事件，
 * 光看事件分不出「已 mock」與「真的打出去」。
 */
export async function trapUnmockedApi(page: Page): Promise<string[]> {
  const unmocked: string[] = []
  await page.route(`${API}/**`, async (route) => {
    unmocked.push(new URL(route.request().url()).pathname)
    await route.fulfill({ status: 599, json: { detail: "這支端點沒有 mock" } })
  })
  return unmocked
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
      const projectId = reqUrl.searchParams.get("project_id") ?? ""
      let filtered = items
      if (q) filtered = filtered.filter((i) => i.title.includes(q))
      if (scope) filtered = filtered.filter((i) => i.scope === scope)
      if (projectId) filtered = filtered.filter((i) => i.project_id === projectId)
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

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/knowledge`,
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback()
      const body = route.request().postDataJSON() as Partial<KbFixture>
      const created: KbFixture = {
        id: `kb-${String(items.length + 1).padStart(3, "0")}`,
        title: body.title ?? "",
        type: body.type ?? "knowledge",
        category: body.category ?? "technical",
        scope: body.scope ?? "personal",
        owner: null,
        project_id: body.project_id ?? null,
        is_public: body.is_public ?? false,
        tags: { projects: [], roles: [], topics: [], level: null, ...body.tags },
        author: body.author ?? "",
        updated_at: "2026-09-11",
        created_at: "2026-09-11",
        source: { project: null, path: null, commit: null },
        related: [],
        content: body.content ?? "",
        attachments: [],
      }
      items.push(created)
      await route.fulfill({ status: 201, json: created })
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
      if (route.request().method() !== "PUT") return route.fallback()
      const id = new URL(route.request().url()).pathname.split("/").pop()!
      const idx = items.findIndex((i) => i.id === id)
      if (idx === -1) return route.fulfill({ status: 404, json: { detail: "找不到" } })
      const body = route.request().postDataJSON() as Partial<KbFixture>
      items[idx] = { ...items[idx], ...body }
      await route.fulfill({ json: items[idx] })
    },
  )

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/share`,
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback()
      const body = route.request().postDataJSON() as { resource_type: string; resource_id: string; expires_in: string | null; password?: string }
      const item = items.find((i) => i.id === body.resource_id)
      await route.fulfill({
        json: {
          token: "s1",
          url: "/public/s1",
          full_url: "https://ching-tech.ddns.net/ctos/public.html?token=s1",
          resource_type: body.resource_type,
          resource_id: body.resource_id,
          resource_title: item?.title ?? "",
        },
      })
    },
  )

  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/knowledge/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const parts = url.pathname.slice(detailPrefix.length).split("/")
      return parts.length === 2 && parts[1] === "history"
    },
    async (route) => {
      const id = new URL(route.request().url()).pathname.split("/").slice(-2)[0]
      await route.fulfill({
        json: {
          id,
          entries: [
            { commit: "abc1234def", author: "yazelin", date: "2026-09-10", message: "修正步驟" },
            { commit: "0123456789", author: "yazelin", date: "2026-09-01", message: "第一版" },
          ],
        },
      })
    },
  )

  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/knowledge/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const parts = url.pathname.slice(detailPrefix.length).split("/")
      return parts.length === 3 && parts[1] === "version"
    },
    async (route) => {
      const segs = new URL(route.request().url()).pathname.split("/")
      const commit = segs[segs.length - 1]
      const id = segs[segs.length - 3]
      await route.fulfill({ json: { id, commit, content: "# 舊版 " + commit } })
    },
  )

  return { items }
}

export interface AiLogFixture {
  id: string
  agent_id: string | null
  agent_name: string | null
  context_type: string | null
  model: string | null
  script_label: string | null
  allowed_tools: string[] | null
  used_tools: string[] | null
  success: boolean
  duration_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  created_at: string
  /** 發起這次呼叫的 CTOS 使用者；不設代表舊資料／未綁定（後端回 null，篩選 user_id=0 會找到它） */
  user_id?: number | null
  username?: string | null
  prompt_id?: string | null
  context_id?: string | null
  input_prompt?: string
  system_prompt?: string | null
  raw_response?: string | null
  parsed_response?: Record<string, unknown> | null
  error_message?: string | null
}

export interface AiAgentFixture {
  id: string
  name: string
  display_name: string | null
  model: string
  is_active: boolean
  tools: string[] | null
  updated_at: string
}

export const aiAgentFixtures: AiAgentFixture[] = [
  { id: "ag-1", name: "group-assistant", display_name: "群組助理", model: "claude-sonnet-4-5", is_active: true, tools: ["search_knowledge"], updated_at: "2026-09-01" },
  { id: "ag-2", name: "personal-assistant", display_name: "個人助理", model: "claude-sonnet-4-5", is_active: true, tools: ["search_knowledge"], updated_at: "2026-09-01" },
]

// 12 筆固定 fixture：id 遞增對應時間遞減（log-01 最新、log-12 最舊，跨 2026-09-01..2026-09-12），
// 3 筆 success:false（log-03／log-06／log-09，成功率 9/12=75%），log-03 帶 error_message，
// log-01 帶完整明細欄位供 Task 3 詳情頁 mock 使用。
export const aiLogFixtures: AiLogFixture[] = [
  {
    id: "log-01", agent_id: "ag-1", agent_name: "群組助理", context_type: "web-chat", model: "claude-sonnet-4-5",
    script_label: null, allowed_tools: ["search_knowledge"], used_tools: ["search_knowledge"], success: true,
    duration_ms: 1200, input_tokens: 350, output_tokens: 120, created_at: "2026-09-12T09:00:00",
    user_id: 2, username: "yazelin",
    prompt_id: "p-01", context_id: "c-01",
    input_prompt: "請幫我查泵浦保養週期", system_prompt: "你是擎添的助理", raw_response: "每三個月",
    parsed_response: {
      answer: "每三個月",
      tool_calls: [
        { id: "toolu_01", name: "ToolSearch", input: { query: "泵浦" }, output: "找到 2 筆" },
        { id: "toolu_02", name: "run_skill_script", input: { skill: "base", script: "list_files", path: "/" }, output: "a.txt\nb.txt" },
      ],
      tool_timings: [
        { name: "ToolSearch", duration_ms: 24 },
        { name: "run_skill_script", duration_ms: 310 },
      ],
      tool_routing: { mode: "auto" },
      routing: { provider: "claude" },
    },
    error_message: null,
  },
  { id: "log-02", agent_id: "ag-2", agent_name: "個人助理", context_type: "linebot-group", model: "claude-sonnet-4-5", script_label: null, allowed_tools: ["search_knowledge"], used_tools: [], success: true, duration_ms: 900, input_tokens: 210, output_tokens: 88, created_at: "2026-09-11T09:00:00" },
  { id: "log-03", agent_id: "ag-1", agent_name: "群組助理", context_type: "scheduler", model: "claude-sonnet-4-5", script_label: "daily-report", allowed_tools: ["search_knowledge"], used_tools: ["search_knowledge"], success: false, duration_ms: 30000, input_tokens: 400, output_tokens: 0, created_at: "2026-09-10T09:00:00", error_message: "模型逾時" },
  { id: "log-04", agent_id: "ag-2", agent_name: "個人助理", context_type: "web-chat", model: "claude-sonnet-4-5", script_label: null, allowed_tools: ["search_knowledge"], used_tools: ["search_knowledge"], success: true, duration_ms: 1100, input_tokens: 300, output_tokens: 140, created_at: "2026-09-09T09:00:00", user_id: 1, username: "admin" },
  { id: "log-05", agent_id: "ag-1", agent_name: "群組助理", context_type: "linebot-group", model: "claude-sonnet-4-5", script_label: null, allowed_tools: ["search_knowledge"], used_tools: [], success: true, duration_ms: 800, input_tokens: 180, output_tokens: 70, created_at: "2026-09-08T09:00:00" },
  { id: "log-06", agent_id: "ag-2", agent_name: "個人助理", context_type: "scheduler", model: "claude-sonnet-4-5", script_label: "weekly-report", allowed_tools: ["search_knowledge"], used_tools: [], success: false, duration_ms: 500, input_tokens: 90, output_tokens: 0, created_at: "2026-09-07T09:00:00", error_message: "工具呼叫失敗" },
  { id: "log-07", agent_id: "ag-1", agent_name: "群組助理", context_type: "web-chat", model: "claude-sonnet-4-5", script_label: null, allowed_tools: ["search_knowledge"], used_tools: ["search_knowledge"], success: true, duration_ms: 1300, input_tokens: 320, output_tokens: 150, created_at: "2026-09-06T09:00:00" },
  { id: "log-08", agent_id: "ag-2", agent_name: "個人助理", context_type: "linebot-group", model: "claude-sonnet-4-5", script_label: null, allowed_tools: ["search_knowledge"], used_tools: ["search_knowledge"], success: true, duration_ms: 1000, input_tokens: 260, output_tokens: 100, created_at: "2026-09-05T09:00:00" },
  { id: "log-09", agent_id: "ag-1", agent_name: "群組助理", context_type: "scheduler", model: "claude-sonnet-4-5", script_label: "daily-report", allowed_tools: ["search_knowledge"], used_tools: [], success: false, duration_ms: 15000, input_tokens: 150, output_tokens: 0, created_at: "2026-09-04T09:00:00", error_message: "逾時" },
  { id: "log-10", agent_id: "ag-2", agent_name: "個人助理", context_type: "web-chat", model: "claude-sonnet-4-5", script_label: null, allowed_tools: ["search_knowledge"], used_tools: ["search_knowledge"], success: true, duration_ms: 950, input_tokens: 240, output_tokens: 95, created_at: "2026-09-03T09:00:00" },
  { id: "log-11", agent_id: "ag-1", agent_name: "群組助理", context_type: "linebot-group", model: "claude-sonnet-4-5", script_label: null, allowed_tools: ["search_knowledge"], used_tools: ["search_knowledge"], success: true, duration_ms: 1050, input_tokens: 280, output_tokens: 110, created_at: "2026-09-02T09:00:00" },
  { id: "log-12", agent_id: "ag-2", agent_name: "個人助理", context_type: "scheduler", model: "claude-sonnet-4-5", script_label: "weekly-report", allowed_tools: ["search_knowledge"], used_tools: [], success: true, duration_ms: 700, input_tokens: 160, output_tokens: 60, created_at: "2026-09-01T09:00:00" },
]

/** 產生 n 筆連續遞減時間的 log fixture，供分頁情境測試用（例如 60 筆）。 */
export function makeAiLogs(n: number): AiLogFixture[] {
  const base = new Date("2026-09-12T09:00:00Z").getTime()
  const items: AiLogFixture[] = []
  for (let i = 0; i < n; i++) {
    const agent = aiAgentFixtures[i % 2]
    const context = ["linebot-group", "web-chat", "scheduler"][i % 3]
    items.push({
      id: `log-${String(i + 1).padStart(3, "0")}`,
      agent_id: agent.id,
      agent_name: agent.display_name,
      context_type: context,
      model: agent.model,
      script_label: null,
      allowed_tools: ["search_knowledge"],
      used_tools: i % 5 === 0 ? [] : ["search_knowledge"],
      success: i % 11 !== 0,
      duration_ms: 800 + i * 10,
      input_tokens: 200 + i,
      output_tokens: 80 + i,
      created_at: new Date(base - i * 3600_000).toISOString().replace(/\.\d{3}Z$/, ""),
    })
  }
  return items
}

function aiLogListItem(l: AiLogFixture) {
  const { id, agent_id, agent_name, context_type, model, script_label, allowed_tools, used_tools, success, duration_ms, input_tokens, output_tokens, created_at } = l
  return {
    id, agent_id, agent_name, context_type, model, script_label, allowed_tools, used_tools, success,
    duration_ms, input_tokens, output_tokens,
    user_id: l.user_id ?? null,
    username: l.username ?? null,
    created_at,
  }
}

function aiLogDetail(l: AiLogFixture) {
  return {
    id: l.id,
    agent_id: l.agent_id,
    agent_name: l.agent_name,
    prompt_id: l.prompt_id ?? null,
    context_type: l.context_type,
    context_id: l.context_id ?? null,
    input_prompt: l.input_prompt ?? "",
    system_prompt: l.system_prompt ?? null,
    allowed_tools: l.allowed_tools,
    raw_response: l.raw_response ?? null,
    parsed_response: l.parsed_response ?? null,
    model: l.model,
    success: l.success,
    error_message: l.error_message ?? null,
    duration_ms: l.duration_ms,
    input_tokens: l.input_tokens,
    output_tokens: l.output_tokens,
    user_id: l.user_id ?? null,
    username: l.username ?? null,
    created_at: l.created_at,
  }
}

function filterAiLogs(logs: AiLogFixture[], params: URLSearchParams, opts: { withListFilters: boolean }) {
  let filtered = logs
  const agentId = params.get("agent_id")
  const startDate = params.get("start_date")
  const endDate = params.get("end_date")
  if (agentId) filtered = filtered.filter((l) => l.agent_id === agentId)
  if (startDate) {
    const start = new Date(startDate).getTime()
    filtered = filtered.filter((l) => new Date(l.created_at).getTime() >= start)
  }
  if (endDate) {
    const end = new Date(endDate).getTime()
    filtered = filtered.filter((l) => new Date(l.created_at).getTime() <= end)
  }
  // user_id 套用在清單與統計兩支端點；0 代表「未記錄使用者」（user_id IS NULL），
  // 不能用 truthy 判斷（0 是合法值），要判是否為 null（沒帶這個參數）
  const userIdParam = params.get("user_id")
  if (userIdParam !== null) {
    const uid = Number(userIdParam)
    filtered = uid === 0 ? filtered.filter((l) => (l.user_id ?? null) === null) : filtered.filter((l) => l.user_id === uid)
  }
  if (opts.withListFilters) {
    const contextType = params.get("context_type")
    const success = params.get("success")
    if (contextType) filtered = filtered.filter((l) => l.context_type === contextType)
    if (success) filtered = filtered.filter((l) => l.success === (success === "true"))
  }
  return filtered
}

export async function mockAiLog(
  page: Page,
  opts: { logs?: AiLogFixture[]; agents?: AiAgentFixture[]; users?: SimpleUserFixture[] } = {},
) {
  const logs: AiLogFixture[] = (opts.logs ?? aiLogFixtures).map((l) => ({ ...l }))
  const agents: AiAgentFixture[] = (opts.agents ?? aiAgentFixtures).map((a) => ({ ...a }))
  const base = new URL(API)
  const prefix = base.pathname.replace(/\/$/, "")
  const sameOrigin = (url: URL) => url.origin === base.origin

  await mockUserList(page, opts.users ?? simpleUserFixtures)

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/ai/agents`,
    async (route) => route.fulfill({ json: { items: agents, total: agents.length } }),
  )

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/ai/logs/stats`,
    async (route) => {
      const params = new URL(route.request().url()).searchParams
      const filtered = filterAiLogs(logs, params, { withListFilters: false })
      const total = filtered.length
      const successCount = filtered.filter((l) => l.success).length
      const failureCount = total - successCount
      const durations = filtered.map((l) => l.duration_ms).filter((d): d is number => d != null)
      const avgDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null
      const totalIn = filtered.reduce((a, l) => a + (l.input_tokens ?? 0), 0)
      const totalOut = filtered.reduce((a, l) => a + (l.output_tokens ?? 0), 0)
      await route.fulfill({
        json: {
          total_calls: total, success_count: successCount, failure_count: failureCount,
          success_rate: total > 0 ? (successCount / total) * 100 : 0,
          avg_duration_ms: avgDuration, total_input_tokens: totalIn, total_output_tokens: totalOut,
        },
      })
    },
  )

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/ai/logs`,
    async (route) => {
      const params = new URL(route.request().url()).searchParams
      const filtered = filterAiLogs(logs, params, { withListFilters: true })
      const pageNum = Number(params.get("page") ?? "1")
      const pageSize = Number(params.get("page_size") ?? "50")
      const start = (pageNum - 1) * pageSize
      const items = filtered.slice(start, start + pageSize).map(aiLogListItem)
      await route.fulfill({ json: { items, total: filtered.length, page: pageNum, page_size: pageSize } })
    },
  )

  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/ai/logs/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const rest = url.pathname.slice(detailPrefix.length)
      return rest.length > 0 && rest !== "stats" && !rest.includes("/")
    },
    async (route) => {
      const id = new URL(route.request().url()).pathname.split("/").pop()!
      const found = logs.find((l) => l.id === id)
      if (!found) return route.fulfill({ status: 404, json: { detail: "找不到" } })
      await route.fulfill({ json: aiLogDetail(found) })
    },
  )

  return { logs, agents }
}

export interface AdminUserFixture {
  id: number
  username: string
  display_name: string | null
  is_admin: boolean
  permissions: { apps: Record<string, boolean>; knowledge: Record<string, boolean> }
  created_at: string
  last_login_at: string | null
  is_active: boolean
  role: string
  has_password: boolean
}

export const defaultAppNames: Record<string, string> = {
  "knowledge-base": "知識庫",
  "ai-assistant": "AI 助手",
  "ai-log": "AI Log",
  linebot: "Bot 管理",
  settings: "設定",
  "project-management": "專案管理",
  "vendor-management": "廠商管理",
  "inventory-management": "物料管理",
  "file-manager": "檔案管理",
  "memory-manager": "記憶管理",
}

export const adminUserFixtures: AdminUserFixture[] = [
  {
    id: 1, username: "admin", display_name: "管理員", is_admin: true,
    permissions: { apps: { "knowledge-base": true, "ai-log": true, linebot: true, settings: true }, knowledge: { global_write: true, global_delete: true } },
    created_at: "2026-01-01T00:00:00", last_login_at: "2026-09-10T08:00:00", is_active: true, role: "admin", has_password: true,
  },
  {
    id: 2, username: "yazelin", display_name: "亞澤", is_admin: false,
    permissions: { apps: { "knowledge-base": true, "ai-log": false, linebot: true, settings: true }, knowledge: { global_write: false, global_delete: false } },
    created_at: "2026-01-02T00:00:00", last_login_at: "2026-09-11T08:00:00", is_active: true, role: "user", has_password: true,
  },
]

/**
 * 攔管理員這一組端點：GET／POST /api/admin/users、/api/admin/default-permissions、
 * PATCH /api/admin/users/:id（編輯）、/status（停用啟用）、/permissions（deep merge 回寫）、
 * POST /:id/reset-password、/:id/clear-password、DELETE /:id。
 * 寫入都直接改 users 陣列，後續的 GET 會看到結果。
 * `failCreate` 讓「帳號重複」那種 400 可以被測到（後端是 services/user.py 190 的 ValueError）。
 */
export async function mockAdmin(page: Page, opts: { users?: AdminUserFixture[]; failCreate?: string } = {}) {
  const users: AdminUserFixture[] = (opts.users ?? adminUserFixtures).map((u) => ({
    ...u,
    permissions: { apps: { ...u.permissions.apps }, knowledge: { ...u.permissions.knowledge } },
  }))
  const base = new URL(API)
  const prefix = base.pathname.replace(/\/$/, "")
  const sameOrigin = (url: URL) => url.origin === base.origin

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/admin/users`,
    async (route) => {
      if (route.request().method() !== "POST") return route.fulfill({ json: { users } })
      if (opts.failCreate) return route.fulfill({ status: 400, json: { detail: opts.failCreate } })
      const body = route.request().postDataJSON() as { username: string; password: string; display_name: string | null; role: string }
      const id = Math.max(0, ...users.map((u) => u.id)) + 1
      users.push({
        id,
        username: body.username,
        display_name: body.display_name,
        is_admin: body.role === "admin",
        // 後端建帳號時不寫 preferences，權限就是該角色的預設值
        permissions: { apps: { "knowledge-base": true, "ai-log": false, linebot: true, settings: true }, knowledge: { global_write: false, global_delete: false } },
        created_at: "2026-09-12T00:00:00",
        last_login_at: null,
        is_active: true,
        role: body.role,
        has_password: true,
      })
      await route.fulfill({ json: { success: true, id, username: body.username, display_name: body.display_name, role: body.role, error: null } })
    },
  )

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/admin/default-permissions`,
    async (route) =>
      route.fulfill({
        json: {
          apps: { "knowledge-base": true, "ai-log": false, linebot: true, settings: true, "project-management": true, "ai-assistant": true, "vendor-management": true, "inventory-management": true, "file-manager": true, "memory-manager": true },
          knowledge: { global_write: false, global_delete: false },
          app_names: defaultAppNames,
        },
      }),
  )

  await page.route(
    (url) => sameOrigin(url) && /^\/api\/admin\/users\/[^/]+\/permissions$/.test(url.pathname.slice(prefix.length)),
    async (route) => {
      const id = Number(new URL(route.request().url()).pathname.split("/").slice(-2)[0])
      const user = users.find((u) => u.id === id)
      if (!user) return route.fulfill({ status: 404, json: { detail: "找不到" } })
      const body = route.request().postDataJSON() as { apps?: Record<string, boolean>; knowledge?: Record<string, boolean> }
      if (body.apps) Object.assign(user.permissions.apps, body.apps)
      if (body.knowledge) Object.assign(user.permissions.knowledge, body.knowledge)
      await route.fulfill({ json: { success: true, permissions: user.permissions } })
    },
  )

  /** 依網址取出 :id 並找到那筆 fixture；找不到就照後端回 404。 */
  function findUser(url: string, idIndexFromEnd: number) {
    const parts = new URL(url).pathname.split("/")
    return users.find((u) => u.id === Number(parts[parts.length - idIndexFromEnd]))
  }

  await page.route(
    (url) => sameOrigin(url) && /^\/api\/admin\/users\/[^/]+\/status$/.test(url.pathname.slice(prefix.length)),
    async (route) => {
      const user = findUser(route.request().url(), 2)
      if (!user) return route.fulfill({ status: 404, json: { detail: "使用者不存在" } })
      const body = route.request().postDataJSON() as { is_active: boolean }
      user.is_active = body.is_active
      await route.fulfill({ json: { success: true, message: body.is_active ? "帳號已啟用" : "帳號已停用", error: null } })
    },
  )

  await page.route(
    (url) => sameOrigin(url) && /^\/api\/admin\/users\/[^/]+\/reset-password$/.test(url.pathname.slice(prefix.length)),
    async (route) => {
      const user = findUser(route.request().url(), 2)
      if (!user) return route.fulfill({ status: 404, json: { detail: "使用者不存在" } })
      const body = route.request().postDataJSON() as { new_password: string }
      if (body.new_password.length < 8) return route.fulfill({ status: 400, json: { detail: "密碼需至少 8 個字元" } })
      user.has_password = true
      await route.fulfill({ json: { success: true, message: "密碼已重設，使用者下次登入需要變更密碼", error: null } })
    },
  )

  await page.route(
    (url) => sameOrigin(url) && /^\/api\/admin\/users\/[^/]+\/clear-password$/.test(url.pathname.slice(prefix.length)),
    async (route) => {
      const user = findUser(route.request().url(), 2)
      if (!user) return route.fulfill({ status: 404, json: { detail: "使用者不存在" } })
      user.has_password = false
      await route.fulfill({ json: { success: true, message: "密碼已清除，使用者將改為 NAS 認證登入", error: null } })
    },
  )

  await page.route(
    (url) => sameOrigin(url) && /^\/api\/admin\/users\/[^/]+$/.test(url.pathname.slice(prefix.length)),
    async (route) => {
      const method = route.request().method()
      const user = findUser(route.request().url(), 1)
      if (!user) return route.fulfill({ status: 404, json: { detail: "使用者不存在" } })
      if (method === "DELETE") {
        users.splice(users.indexOf(user), 1)
        return route.fulfill({ json: { success: true, message: "使用者已永久刪除", error: null } })
      }
      const body = route.request().postDataJSON() as { display_name?: string; email?: string; role?: string }
      if (body.display_name !== undefined) user.display_name = body.display_name
      if (body.role !== undefined) {
        user.role = body.role
        user.is_admin = body.role === "admin"
      }
      await route.fulfill({ json: { success: true, message: "使用者資訊已更新", error: null } })
    },
  )

  return { users }
}

export type BotPlatform = "line" | "telegram"

export interface BotGroupFixture {
  id: string
  platform_type: BotPlatform
  platform_group_id: string
  name: string | null
  picture_url: string | null
  member_count: number | null
  project_id: string | null
  project_name: string | null
  is_active: boolean
  allow_ai_response: boolean
  joined_at: string | null
  left_at: string | null
  created_at: string
  updated_at: string
}

export interface BotUserFixture {
  id: string
  platform_type: BotPlatform
  platform_user_id: string
  display_name: string | null
  picture_url: string | null
  status_message: string | null
  language: string | null
  user_id: number | null
  is_friend: boolean
  created_at: string
  updated_at: string
  bound_username: string | null
  bound_display_name: string | null
  is_blocked: boolean
  blocked_at: string | null
  blocked_reason: string | null
}

export interface BotMessageFixture {
  id: string
  message_id: string
  bot_user_id: string | null
  user_display_name: string | null
  user_picture_url: string | null
  bot_group_id: string | null
  message_type: string
  content: string | null
  file_id: string | null
  file_info: Record<string, unknown> | null
  is_from_bot: boolean
  ai_processed: boolean
  created_at: string
}

export interface BotFileFixture {
  id: string
  message_id: string | null
  file_type: string
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  nas_path: string | null
  thumbnail_path: string | null
  duration: number | null
  created_at: string
  bot_group_id: string | null
  bot_user_id: string | null
  user_display_name: string | null
  group_name: string | null
}

export interface BotPlatformBindingFixture {
  is_bound: boolean
  display_name: string | null
  picture_url: string | null
  bound_at: string | null
}

export interface BotBindingFixture {
  is_bound: boolean
  line_display_name: string | null
  line_picture_url: string | null
  bound_at: string | null
  line: BotPlatformBindingFixture | null
  telegram: BotPlatformBindingFixture | null
}

// 兩個群組：grp-1（line、allow_ai_response 開、已綁定 proj-1——與 projectFixtures 的
// proj-1.bot_groups 對得上）、grp-2（telegram、is_active 關且有 left_at、未綁定）。
export const botGroupFixtures: BotGroupFixture[] = [
  {
    id: "grp-1", platform_type: "line", platform_group_id: "C-line-001", name: "擎添業務群",
    picture_url: null, member_count: 12, project_id: "proj-1", project_name: "乙二站區監控案",
    is_active: true, allow_ai_response: true, joined_at: "2026-06-01T09:00:00", left_at: null,
    created_at: "2026-06-01T09:00:00", updated_at: "2026-09-01T09:00:00",
  },
  {
    id: "grp-2", platform_type: "telegram", platform_group_id: "tg-group-002", name: "退場測試群",
    picture_url: null, member_count: 5, project_id: null, project_name: null,
    is_active: false, allow_ai_response: false, joined_at: "2026-05-01T09:00:00", left_at: "2026-08-15T09:00:00",
    created_at: "2026-05-01T09:00:00", updated_at: "2026-08-15T09:00:00",
  },
]

// 三個使用者：usr-1 已綁定 CTOS 帳號、usr-2 未綁定、usr-3 已封鎖（理由「洗版」）。
export const botUserFixtures: BotUserFixture[] = [
  {
    id: "usr-1", platform_type: "line", platform_user_id: "U-line-001", display_name: "王小明",
    picture_url: null, status_message: null, language: "zh-TW", user_id: 2, is_friend: true,
    created_at: "2026-06-01T09:00:00", updated_at: "2026-09-01T09:00:00",
    bound_username: "yazelin", bound_display_name: "亞澤", is_blocked: false, blocked_at: null, blocked_reason: null,
  },
  {
    id: "usr-2", platform_type: "telegram", platform_user_id: "tg-user-002", display_name: "陳小華",
    picture_url: null, status_message: null, language: "zh-TW", user_id: null, is_friend: true,
    created_at: "2026-06-05T09:00:00", updated_at: "2026-09-01T09:00:00",
    bound_username: null, bound_display_name: null, is_blocked: false, blocked_at: null, blocked_reason: null,
  },
  {
    id: "usr-3", platform_type: "line", platform_user_id: "U-line-003", display_name: "訪客 003",
    picture_url: null, status_message: null, language: null, user_id: null, is_friend: false,
    created_at: "2026-07-01T09:00:00", updated_at: "2026-08-20T09:00:00",
    bound_username: null, bound_display_name: null, is_blocked: true, blocked_at: "2026-08-20T09:00:00", blocked_reason: "洗版",
  },
]

// 六則訊息：msg-2 是 is_from_bot，msg-3／msg-6 是非 text 類型（image／document）。
export const botMessageFixtures: BotMessageFixture[] = [
  { id: "msg-1", message_id: "m-line-001", bot_user_id: "usr-1", user_display_name: "王小明", user_picture_url: null, bot_group_id: "grp-1", message_type: "text", content: "早安", file_id: null, file_info: null, is_from_bot: false, ai_processed: true, created_at: "2026-09-01T09:00:00" },
  { id: "msg-2", message_id: "m-line-002", bot_user_id: null, user_display_name: "AI 助理", user_picture_url: null, bot_group_id: "grp-1", message_type: "text", content: "已為您查詢完成", file_id: null, file_info: null, is_from_bot: true, ai_processed: true, created_at: "2026-09-01T09:01:00" },
  { id: "msg-3", message_id: "m-line-003", bot_user_id: "usr-1", user_display_name: "王小明", user_picture_url: null, bot_group_id: "grp-1", message_type: "image", content: null, file_id: "file-1", file_info: { file_type: "image" }, is_from_bot: false, ai_processed: false, created_at: "2026-09-02T09:00:00" },
  { id: "msg-4", message_id: "m-tg-001", bot_user_id: "usr-2", user_display_name: "陳小華", user_picture_url: null, bot_group_id: "grp-2", message_type: "text", content: "測試訊息", file_id: null, file_info: null, is_from_bot: false, ai_processed: false, created_at: "2026-08-10T09:00:00" },
  { id: "msg-5", message_id: "m-line-005", bot_user_id: "usr-3", user_display_name: "訪客 003", user_picture_url: null, bot_group_id: null, message_type: "text", content: "廣告連結", file_id: null, file_info: null, is_from_bot: false, ai_processed: false, created_at: "2026-08-19T09:00:00" },
  { id: "msg-6", message_id: "m-line-006", bot_user_id: "usr-1", user_display_name: "王小明", user_picture_url: null, bot_group_id: "grp-1", message_type: "document", content: null, file_id: "file-2", file_info: { file_type: "document" }, is_from_bot: false, ai_processed: false, created_at: "2026-09-05T09:00:00" },
]

/** 供訊息分頁測試用：產生 n 筆遞減時間的文字訊息。 */
export function makeBotMessages(n: number): BotMessageFixture[] {
  const base = new Date("2026-09-10T09:00:00Z").getTime()
  const items: BotMessageFixture[] = []
  for (let i = 0; i < n; i++) {
    items.push({
      id: `msg-gen-${String(i + 1).padStart(3, "0")}`,
      message_id: `m-gen-${String(i + 1).padStart(3, "0")}`,
      bot_user_id: "usr-1",
      user_display_name: "王小明",
      user_picture_url: null,
      bot_group_id: "grp-1",
      message_type: "text",
      content: `訊息 ${i + 1}`,
      file_id: null,
      file_info: null,
      is_from_bot: false,
      ai_processed: false,
      created_at: new Date(base - i * 60_000).toISOString().replace(/\.\d{3}Z$/, ""),
    })
  }
  return items
}

// 三個檔案：file-1 image（grp-1，帶 nas_path）、file-2 document（grp-1，帶 nas_path）、
// file-3 video（grp-2，nas_path 為 null＝已過期，NAS 保留期滿後清掉實體檔但保留資料列）。
export const botFileFixtures: BotFileFixture[] = [
  { id: "file-1", message_id: "msg-3", file_type: "image", file_name: "現場照片.jpg", file_size: 245678, mime_type: "image/jpeg", nas_path: "/linebot/files/file-1.jpg", thumbnail_path: "/linebot/thumbs/file-1.jpg", duration: null, created_at: "2026-09-02T09:00:00", bot_group_id: "grp-1", bot_user_id: "usr-1", user_display_name: "王小明", group_name: "擎添業務群" },
  { id: "file-2", message_id: "msg-6", file_type: "document", file_name: "保養手冊.pdf", file_size: 1048576, mime_type: "application/pdf", nas_path: "/linebot/files/file-2.pdf", thumbnail_path: null, duration: null, created_at: "2026-09-05T09:00:00", bot_group_id: "grp-1", bot_user_id: "usr-1", user_display_name: "王小明", group_name: "擎添業務群" },
  { id: "file-3", message_id: null, file_type: "video", file_name: "驗收錄影.mp4", file_size: 5242880, mime_type: "video/mp4", nas_path: null, thumbnail_path: null, duration: 42, created_at: "2026-08-11T09:00:00", bot_group_id: "grp-2", bot_user_id: "usr-2", user_display_name: "陳小華", group_name: "退場測試群" },
]

// 綁定狀態：line 已綁定、telegram 未綁定。
export const botBindingFixture: BotBindingFixture = {
  is_bound: true,
  line_display_name: "亞澤",
  line_picture_url: null,
  bound_at: "2026-06-01T09:00:00",
  line: { is_bound: true, display_name: "亞澤", picture_url: null, bound_at: "2026-06-01T09:00:00" },
  telegram: { is_bound: false, display_name: null, picture_url: null, bound_at: null },
}

/** 彙整匯出，供後續 task 直接比對固定資料。 */
export const botFixtures = {
  groups: botGroupFixtures,
  users: botUserFixtures,
  messages: botMessageFixtures,
  files: botFileFixtures,
  binding: botBindingFixture,
}

function cloneBinding(b: BotBindingFixture): BotBindingFixture {
  return { ...b, line: b.line ? { ...b.line } : null, telegram: b.telegram ? { ...b.telegram } : null }
}

/** 攔 /api/bot/*：binding／groups／users(-with-binding)／messages／files，含刪除/封鎖/解封/allow_ai/unbind/generate-code 的 mutation。 */
export async function mockBot(
  page: Page,
  opts: {
    groups?: BotGroupFixture[]
    users?: BotUserFixture[]
    messages?: BotMessageFixture[]
    files?: BotFileFixture[]
    binding?: BotBindingFixture
  } = {},
) {
  const groups: BotGroupFixture[] = (opts.groups ?? botGroupFixtures).map((g) => ({ ...g }))
  const users: BotUserFixture[] = (opts.users ?? botUserFixtures).map((u) => ({ ...u }))
  const messages: BotMessageFixture[] = (opts.messages ?? botMessageFixtures).map((m) => ({ ...m }))
  const files: BotFileFixture[] = (opts.files ?? botFileFixtures).map((f) => ({ ...f }))
  const binding: BotBindingFixture = cloneBinding(opts.binding ?? botBindingFixture)

  const base = new URL(API)
  const prefix = base.pathname.replace(/\/$/, "")
  const sameOrigin = (url: URL) => url.origin === base.origin
  const byPlatform = <T extends { bot_group_id?: string | null; bot_user_id?: string | null }>(list: T[], platform: string): T[] =>
    list.filter((item) => {
      const g = groups.find((gr) => gr.id === item.bot_group_id)
      const u = users.find((us) => us.id === item.bot_user_id)
      return g?.platform_type === platform || u?.platform_type === platform
    })

  // ── 綁定 ──
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/bot/binding/status`,
    async (route) => route.fulfill({ json: binding }),
  )

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/bot/binding/generate-code`,
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback()
      await route.fulfill({ json: { code: "123456", expires_at: "2026-09-11T10:10:00" } })
    },
  )

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/bot/binding`,
    async (route) => {
      if (route.request().method() !== "DELETE") return route.fallback()
      const platform = new URL(route.request().url()).searchParams.get("platform_type")
      // 後端 services/bot_line/binding.py 的 _platform_status()：未綁定一律回
      // { is_bound:false, display_name:null, picture_url:null, bound_at:null }，不會是 null。
      const unbound: BotPlatformBindingFixture = { is_bound: false, display_name: null, picture_url: null, bound_at: null }
      if (platform === "line") {
        binding.line = unbound
        binding.line_display_name = null
        binding.line_picture_url = null
        binding.bound_at = null
      }
      if (platform === "telegram") binding.telegram = unbound
      // 頂層 is_bound = line.is_bound || telegram.is_bound，解綁後要重算而非強制設 false。
      binding.is_bound = Boolean(binding.line?.is_bound) || Boolean(binding.telegram?.is_bound)
      await route.fulfill({ json: { success: true } })
    },
  )

  // ── 群組列表（exact pathname，避免吃掉 /groups/{id}） ──
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/bot/groups`,
    async (route) => {
      if (route.request().method() !== "GET") return route.fallback()
      const params = new URL(route.request().url()).searchParams
      let filtered = groups
      const platform = params.get("platform_type")
      if (platform) filtered = filtered.filter((g) => g.platform_type === platform)
      const limit = Number(params.get("limit") ?? "20")
      const offset = Number(params.get("offset") ?? "0")
      await route.fulfill({ json: { items: filtered.slice(offset, offset + limit), total: filtered.length } })
    },
  )

  // ── 群組明細／PATCH／DELETE（連同訊息一起刪） ──
  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/bot/groups/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const rest = url.pathname.slice(detailPrefix.length)
      return rest.length > 0 && !rest.includes("/")
    },
    async (route) => {
      const id = new URL(route.request().url()).pathname.split("/").pop()!
      const idx = groups.findIndex((g) => g.id === id)
      if (idx === -1) return route.fulfill({ status: 404, json: { detail: "找不到" } })
      const method = route.request().method()
      if (method === "DELETE") {
        groups.splice(idx, 1)
        for (let i = messages.length - 1; i >= 0; i--) if (messages[i].bot_group_id === id) messages.splice(i, 1)
        return route.fulfill({ json: { status: "ok", message: "群組已刪除" } })
      }
      if (method === "PATCH") {
        const body = route.request().postDataJSON() as Partial<BotGroupFixture>
        groups[idx] = { ...groups[idx], ...body }
        return route.fulfill({ json: groups[idx] })
      }
      return route.fulfill({ json: groups[idx] })
    },
  )

  // ── 群組專案綁定：POST 帶 project_id 綁定、DELETE 解除 ──
  // 專案名稱查 projectFixtures（本檔下方定義），照後端 LineGroupResponse 同時回 project_id／project_name。
  await page.route(
    (url) => sameOrigin(url) && /\/api\/bot\/groups\/[^/]+\/bind-project$/.test(url.pathname),
    async (route) => {
      const segs = new URL(route.request().url()).pathname.split("/")
      const id = segs[segs.length - 2]
      const idx = groups.findIndex((g) => g.id === id)
      if (idx === -1) return route.fulfill({ status: 404, json: { detail: "Group not found" } })
      const method = route.request().method()
      if (method === "POST") {
        const body = route.request().postDataJSON() as { project_id: string }
        const project = projectFixtures.find((p) => p.id === body.project_id)
        groups[idx] = { ...groups[idx], project_id: body.project_id, project_name: project?.name ?? null }
        return route.fulfill({ json: { status: "ok", message: "專案綁定成功" } })
      }
      if (method === "DELETE") {
        groups[idx] = { ...groups[idx], project_id: null, project_name: null }
        return route.fulfill({ json: { status: "ok", message: "已解除專案綁定" } })
      }
      return route.fallback()
    },
  )

  // ── 已綁定使用者列表（與 /users 不同路徑，不互吃） ──
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/bot/users-with-binding`,
    async (route) => {
      const params = new URL(route.request().url()).searchParams
      let filtered = users
      const platform = params.get("platform_type")
      if (platform) filtered = filtered.filter((u) => u.platform_type === platform)
      const limit = Number(params.get("limit") ?? "20")
      const offset = Number(params.get("offset") ?? "0")
      await route.fulfill({ json: { items: filtered.slice(offset, offset + limit), total: filtered.length } })
    },
  )

  // ── 封鎖名單（?blocked=true） ──
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/bot/users`,
    async (route) => {
      if (route.request().method() !== "GET") return route.fallback()
      const params = new URL(route.request().url()).searchParams
      let filtered = users
      if (params.get("blocked") === "true") filtered = filtered.filter((u) => u.is_blocked)
      const platform = params.get("platform_type")
      if (platform) filtered = filtered.filter((u) => u.platform_type === platform)
      const limit = Number(params.get("limit") ?? "20")
      const offset = Number(params.get("offset") ?? "0")
      await route.fulfill({ json: { items: filtered.slice(offset, offset + limit), total: filtered.length } })
    },
  )

  // ── 封鎖／解封 ──
  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/bot/users/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const rest = url.pathname.slice(detailPrefix.length).split("/")
      return rest.length === 2 && (rest[1] === "block" || rest[1] === "unblock")
    },
    async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback()
      const segs = new URL(route.request().url()).pathname.split("/")
      const action = segs[segs.length - 1]
      const id = segs[segs.length - 2]
      const idx = users.findIndex((u) => u.id === id)
      if (idx === -1) return route.fulfill({ status: 404, json: { detail: "找不到" } })
      if (action === "block") {
        const body = route.request().postDataJSON() as { reason: string | null }
        users[idx] = { ...users[idx], is_blocked: true, blocked_at: "2026-09-11T12:00:00", blocked_reason: body.reason }
      } else {
        users[idx] = { ...users[idx], is_blocked: false, blocked_at: null, blocked_reason: null }
      }
      await route.fulfill({ json: users[idx] })
    },
  )

  // ── 訊息 ──
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/bot/messages`,
    async (route) => {
      const params = new URL(route.request().url()).searchParams
      let filtered = messages
      const platform = params.get("platform_type")
      const groupId = params.get("group_id")
      const userId = params.get("user_id")
      if (platform) filtered = byPlatform(filtered, platform)
      if (groupId) filtered = filtered.filter((m) => m.bot_group_id === groupId)
      if (userId) filtered = filtered.filter((m) => m.bot_user_id === userId)
      const pageNum = Number(params.get("page") ?? "1")
      const pageSize = Number(params.get("page_size") ?? "50")
      const start = (pageNum - 1) * pageSize
      await route.fulfill({ json: { items: filtered.slice(start, start + pageSize), total: filtered.length, page: pageNum, page_size: pageSize } })
    },
  )

  // ── 檔案列表 ──
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/bot/files`,
    async (route) => {
      if (route.request().method() !== "GET") return route.fallback()
      const params = new URL(route.request().url()).searchParams
      let filtered = files
      const platform = params.get("platform_type")
      const fileType = params.get("file_type")
      const groupId = params.get("group_id")
      if (platform) filtered = byPlatform(filtered, platform)
      if (fileType) filtered = filtered.filter((f) => f.file_type === fileType)
      if (groupId) filtered = filtered.filter((f) => f.bot_group_id === groupId)
      const pageNum = Number(params.get("page") ?? "1")
      const pageSize = Number(params.get("page_size") ?? "30")
      const start = (pageNum - 1) * pageSize
      await route.fulfill({ json: { items: filtered.slice(start, start + pageSize), total: filtered.length } })
    },
  )

  // ── 刪除檔案（exact，不吃 /download） ──
  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/bot/files/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const rest = url.pathname.slice(detailPrefix.length)
      return rest.length > 0 && !rest.includes("/")
    },
    async (route) => {
      if (route.request().method() !== "DELETE") return route.fallback()
      const id = new URL(route.request().url()).pathname.split("/").pop()!
      const idx = files.findIndex((f) => f.id === id)
      if (idx === -1) return route.fulfill({ status: 404, json: { detail: "找不到" } })
      files.splice(idx, 1)
      await route.fulfill({ json: { status: "ok", message: "檔案已刪除" } })
    },
  )

  // ── 下載（帶 Authorization header，回傳二進位內容而非 JSON） ──
  await page.route(
    (url) => sameOrigin(url) && url.pathname.startsWith(`${prefix}/api/bot/files/`) && url.pathname.endsWith("/download"),
    async (route) => {
      const segs = new URL(route.request().url()).pathname.split("/")
      const id = segs[segs.length - 2]
      const found = files.find((f) => f.id === id)
      if (!found) return route.fulfill({ status: 404, json: { detail: "找不到" } })
      if (found.file_type === "image") {
        return route.fulfill({ contentType: "image/png", body: ONE_PX_PNG })
      }
      await route.fulfill({ contentType: found.mime_type ?? "application/octet-stream", body: Buffer.from("fixture-file-content") })
    },
  )

  return { groups, users, messages, files, binding }
}

// ============================================================
// 專案模組（欄位逐一對後端 models/project.py 的 feat/projects-backend 版本）
// ============================================================

export interface SimpleUserFixture {
  id: number
  username: string
  display_name: string | null
}

export const simpleUserFixtures: SimpleUserFixture[] = [
  { id: 1, username: "admin", display_name: "管理員" },
  { id: 2, username: "yazelin", display_name: "亞澤" },
  { id: 3, username: "chen", display_name: "陳工" },
  { id: 4, username: "lin", display_name: null },
]

/** 攔 `/api/user/list`（使用者下拉選單）；mockProjects 與 mockAiLog 共用這支，避免各自註冊出不同形狀的 mock。 */
export async function mockUserList(page: Page, users: SimpleUserFixture[] = simpleUserFixtures) {
  const base = new URL(API)
  const prefix = base.pathname.replace(/\/$/, "")
  const sameOrigin = (url: URL) => url.origin === base.origin
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/user/list`,
    async (route) => route.fulfill({ json: { users } }),
  )
}

export interface ProjectMemberFixture {
  user_id: number
  username: string | null
  display_name: string | null
  role: string
}

export interface MilestoneFixture {
  id: string
  project_id: string
  name: string
  due_date: string
  completed_at: string | null
  status: string
  sort_order: number
  is_overdue: boolean
  created_at: string
  updated_at: string
}

export interface TaskFixture {
  id: string
  project_id: string
  title: string
  description: string | null
  milestone_id: string | null
  assignee_id: number | null
  assignee_name: string | null
  status: string
  due_date: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ProjectBotGroupFixture {
  id: string
  platform_type: string
  group_name: string | null
}

export interface ProjectFixture {
  id: string
  name: string
  customer: string | null
  status: string
  owner_id: number | null
  owner_name: string | null
  start_date: string | null
  end_date: string | null
  description: string | null
  created_by: number | null
  created_at: string
  updated_at: string
  progress: number
  member_count: number
  overdue_milestones: number
  members: ProjectMemberFixture[]
  milestones: MilestoneFixture[]
  tasks: TaskFixture[]
  bot_groups: ProjectBotGroupFixture[]
  knowledge_count: number
}

export const projectFixtures: ProjectFixture[] = [
  {
    id: "proj-1",
    name: "乙二站區監控案",
    customer: "乙二運輸",
    status: "active",
    owner_id: 2,
    owner_name: "亞澤",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    description: "監控主機汰換與圖控整合。",
    created_by: 1,
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-09-10T08:00:00",
    progress: 33,
    member_count: 2,
    // 逾期只在 status = active 時成立；ms-1、ms-2 兩筆逾期
    overdue_milestones: 2,
    members: [
      { user_id: 2, username: "yazelin", display_name: "亞澤", role: "owner" },
      { user_id: 3, username: "chen", display_name: "陳工", role: "member" },
    ],
    milestones: [
      {
        id: "ms-1", project_id: "proj-1", name: "細部設計完成", due_date: "2026-03-31", completed_at: null,
        status: "in_progress", sort_order: 0, is_overdue: true,
        created_at: "2026-01-01T00:00:00", updated_at: "2026-03-01T00:00:00",
      },
      {
        id: "ms-2", project_id: "proj-1", name: "現場安裝", due_date: "2026-06-30", completed_at: null,
        status: "pending", sort_order: 1, is_overdue: true,
        created_at: "2026-01-01T00:00:00", updated_at: "2026-01-01T00:00:00",
      },
      {
        id: "ms-3", project_id: "proj-1", name: "系統驗收", due_date: "2026-11-30", completed_at: "2026-09-01",
        status: "completed", sort_order: 2, is_overdue: false,
        created_at: "2026-01-01T00:00:00", updated_at: "2026-09-01T00:00:00",
      },
    ],
    tasks: [
      {
        id: "task-1", project_id: "proj-1", title: "盤點現場點位", description: "先做 B1 與 1F。",
        milestone_id: "ms-1", assignee_id: 2, assignee_name: "亞澤", status: "done", due_date: "2026-02-10",
        sort_order: 0, created_at: "2026-01-05T00:00:00", updated_at: "2026-02-10T00:00:00",
      },
      {
        id: "task-2", project_id: "proj-1", title: "繪製配電圖", description: null,
        milestone_id: "ms-1", assignee_id: 3, assignee_name: "陳工", status: "doing", due_date: "2026-10-01",
        sort_order: 1, created_at: "2026-01-05T00:00:00", updated_at: "2026-09-01T00:00:00",
      },
      {
        id: "task-3", project_id: "proj-1", title: "採購清單", description: null,
        milestone_id: null, assignee_id: null, assignee_name: null, status: "todo", due_date: null,
        sort_order: 2, created_at: "2026-01-05T00:00:00", updated_at: "2026-01-05T00:00:00",
      },
    ],
    bot_groups: [{ id: "grp-1", platform_type: "line", group_name: "擎添業務群" }],
    knowledge_count: 1,
  },
  {
    id: "proj-2",
    name: "廠務空調更新",
    customer: "擎添工業",
    status: "completed",
    owner_id: 1,
    owner_name: "管理員",
    start_date: "2025-06-01",
    end_date: "2026-02-28",
    description: null,
    created_by: 1,
    created_at: "2025-06-01T00:00:00",
    updated_at: "2026-02-28T00:00:00",
    progress: 100,
    member_count: 1,
    // 已完成的專案不標逾期，即使里程碑早就過期
    overdue_milestones: 0,
    members: [{ user_id: 1, username: "admin", display_name: "管理員", role: "owner" }],
    milestones: [
      {
        id: "ms-9", project_id: "proj-2", name: "結案報告", due_date: "2026-02-20", completed_at: "2026-02-18",
        status: "completed", sort_order: 0, is_overdue: false,
        created_at: "2025-06-01T00:00:00", updated_at: "2026-02-18T00:00:00",
      },
    ],
    tasks: [],
    bot_groups: [],
    knowledge_count: 0,
  },
  {
    id: "proj-3",
    name: "倉儲自動化評估",
    customer: null,
    status: "planning",
    owner_id: 1,
    owner_name: "管理員",
    start_date: null,
    end_date: null,
    description: null,
    created_by: 1,
    created_at: "2026-09-01T00:00:00",
    updated_at: "2026-09-01T00:00:00",
    progress: 0,
    member_count: 1,
    overdue_milestones: 0,
    // yazelin（userFixture，id 2）不在成員裡，用來驗「非成員看不到編輯控制」
    members: [{ user_id: 1, username: "admin", display_name: "管理員", role: "owner" }],
    milestones: [],
    tasks: [],
    bot_groups: [],
    knowledge_count: 0,
  },
]

function cloneProject(p: ProjectFixture): ProjectFixture {
  return {
    ...p,
    members: p.members.map((m) => ({ ...m })),
    milestones: p.milestones.map((m) => ({ ...m })),
    tasks: p.tasks.map((t) => ({ ...t })),
    bot_groups: p.bot_groups.map((g) => ({ ...g })),
  }
}

function listItemOf(p: ProjectFixture) {
  return {
    id: p.id, name: p.name, customer: p.customer, status: p.status,
    owner_id: p.owner_id, owner_name: p.owner_name,
    start_date: p.start_date, end_date: p.end_date,
    created_at: p.created_at, updated_at: p.updated_at,
    progress: p.progress, member_count: p.member_count,
    overdue_milestones: p.status === "active" ? p.overdue_milestones : 0,
  }
}

/**
 * 攔專案模組全部端點與 /api/user/list，照 mockBot 的寫法。
 * forbidEdits：所有寫入端點回 403「只有專案成員能編輯」，驗 role="alert" 用。
 */
export async function mockProjects(
  page: Page,
  opts: { projects?: ProjectFixture[]; users?: SimpleUserFixture[]; forbidEdits?: boolean } = {},
) {
  const projects: ProjectFixture[] = (opts.projects ?? projectFixtures).map(cloneProject)
  const users: SimpleUserFixture[] = (opts.users ?? simpleUserFixtures).map((u) => ({ ...u }))
  const forbidEdits = opts.forbidEdits ?? false
  let seq = 0

  const base = new URL(API)
  const prefix = base.pathname.replace(/\/$/, "")
  const sameOrigin = (url: URL) => url.origin === base.origin
  const forbidden = { status: 403, json: { detail: "只有專案成員能編輯" } }
  // 後端 api/project.py 的 _reject_bad_reference：外鍵對不到就翻成這兩個錯誤
  const userNotFound = { status: 404, json: { detail: "使用者不存在" } }
  const milestoneNotInProject = { status: 400, json: { detail: "里程碑不屬於此專案" } }
  // models/project.py 的 _not_null：更新請求對 NOT NULL 欄位明確送 null 是 422，
  // 而且 FastAPI 的 detail 是驗證錯誤陣列不是字串
  const nullRejected = (field: string) => ({
    status: 422,
    json: { detail: [{ loc: ["body", field], msg: "Value error, 此欄位不可為 null", type: "value_error" }] },
  })
  const knownUser = (id: number | null | undefined) => id === null || id === undefined || users.some((u) => u.id === id)

  // ── 使用者選單 ──
  await mockUserList(page, users)

  // ── dashboard 摘要（宣告在 /{id} 之前，與後端同序） ──
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/projects/summary`,
    async (route) => {
      const overdue = projects
        .filter((p) => p.status === "active")
        .flatMap((p) =>
          p.milestones
            .filter((m) => m.is_overdue)
            .map((m) => ({
              project_id: p.id, project_name: p.name, milestone_id: m.id,
              name: m.name, due_date: m.due_date, days_overdue: 30,
            })),
        )
      await route.fulfill({
        json: { active_count: projects.filter((p) => p.status === "active").length, overdue_milestones: overdue },
      })
    },
  )

  // ── 清單與建立 ──
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/projects`,
    async (route) => {
      const method = route.request().method()
      if (method === "POST") {
        if (forbidEdits) return route.fulfill(forbidden)
        const body = route.request().postDataJSON() as Partial<ProjectFixture>
        if (!knownUser(body.owner_id)) return route.fulfill(userNotFound)
        seq += 1
        const owner = users.find((u) => u.id === body.owner_id)
        const created: ProjectFixture = {
          id: `proj-new-${seq}`,
          name: body.name ?? "",
          customer: body.customer ?? null,
          status: body.status ?? "active",
          owner_id: body.owner_id ?? null,
          owner_name: owner ? owner.display_name || owner.username : null,
          start_date: body.start_date ?? null,
          end_date: body.end_date ?? null,
          description: body.description ?? null,
          created_by: 1,
          created_at: "2026-09-11T00:00:00",
          updated_at: "2026-09-11T00:00:00",
          progress: 0,
          member_count: owner ? 1 : 0,
          overdue_milestones: 0,
          members: owner
            ? [{ user_id: owner.id, username: owner.username, display_name: owner.display_name, role: "owner" }]
            : [],
          milestones: [],
          tasks: [],
          bot_groups: [],
          knowledge_count: 0,
        }
        projects.push(created)
        return route.fulfill({ status: 201, json: created })
      }
      const params = new URL(route.request().url()).searchParams
      let filtered = projects
      const statusFilter = params.get("status")
      const q = params.get("q")
      if (statusFilter) filtered = filtered.filter((p) => p.status === statusFilter)
      if (q) filtered = filtered.filter((p) => p.name.includes(q) || (p.customer ?? "").includes(q))
      const pageNum = Number(params.get("page") ?? "1")
      const pageSize = Number(params.get("page_size") ?? "20")
      const start = (pageNum - 1) * pageSize
      await route.fulfill({
        json: { items: filtered.slice(start, start + pageSize).map(listItemOf), total: filtered.length },
      })
    },
  )

  // ── 成員：POST /{id}/members、DELETE /{id}/members/{user_id} ──
  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const rest = url.pathname.slice(`${prefix}/api/projects/`.length).split("/")
      return url.pathname.startsWith(`${prefix}/api/projects/`) && rest[1] === "members"
    },
    async (route) => {
      if (forbidEdits) return route.fulfill(forbidden)
      const segs = new URL(route.request().url()).pathname.split("/")
      const method = route.request().method()
      if (method === "POST") {
        const id = segs[segs.length - 2]
        const project = projects.find((p) => p.id === id)
        if (!project) return route.fulfill({ status: 404, json: { detail: "專案不存在" } })
        const body = route.request().postDataJSON() as { user_id: number }
        const user = users.find((u) => u.id === body.user_id)
        if (!user) return route.fulfill({ status: 404, json: { detail: "使用者不存在" } })
        const member = { user_id: user.id, username: user.username, display_name: user.display_name, role: "member" }
        project.members.push(member)
        project.member_count = project.members.length
        return route.fulfill({ status: 201, json: member })
      }
      if (method === "DELETE") {
        const userId = Number(segs[segs.length - 1])
        const id = segs[segs.length - 3]
        const project = projects.find((p) => p.id === id)
        if (!project) return route.fulfill({ status: 404, json: { detail: "專案不存在" } })
        const idx = project.members.findIndex((m) => m.user_id === userId)
        if (idx === -1) return route.fulfill({ status: 404, json: { detail: "成員不存在" } })
        if (project.members[idx].role === "owner") {
          return route.fulfill({ status: 400, json: { detail: "負責人不能移除" } })
        }
        project.members.splice(idx, 1)
        project.member_count = project.members.length
        return route.fulfill({ json: { success: true } })
      }
      return route.fallback()
    },
  )

  // ── 里程碑 ──
  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const rest = url.pathname.slice(`${prefix}/api/projects/`.length).split("/")
      return url.pathname.startsWith(`${prefix}/api/projects/`) && rest[1] === "milestones"
    },
    async (route) => {
      if (forbidEdits) return route.fulfill(forbidden)
      const segs = new URL(route.request().url()).pathname.split("/")
      const method = route.request().method()
      if (method === "POST") {
        const id = segs[segs.length - 2]
        const project = projects.find((p) => p.id === id)
        if (!project) return route.fulfill({ status: 404, json: { detail: "專案不存在" } })
        const body = route.request().postDataJSON() as Partial<MilestoneFixture>
        seq += 1
        const created: MilestoneFixture = {
          id: `ms-new-${seq}`, project_id: project.id, name: body.name ?? "",
          due_date: body.due_date ?? "2026-12-31", completed_at: body.completed_at ?? null,
          status: body.status ?? "pending", sort_order: body.sort_order ?? 0, is_overdue: false,
          created_at: "2026-09-11T00:00:00", updated_at: "2026-09-11T00:00:00",
        }
        project.milestones.push(created)
        return route.fulfill({ status: 201, json: created })
      }
      const milestoneId = segs[segs.length - 1]
      const id = segs[segs.length - 3]
      const project = projects.find((p) => p.id === id)
      const idx = project?.milestones.findIndex((m) => m.id === milestoneId) ?? -1
      if (!project || idx === -1) return route.fulfill({ status: 404, json: { detail: "里程碑不存在" } })
      if (method === "DELETE") {
        project.milestones.splice(idx, 1)
        return route.fulfill({ json: { success: true } })
      }
      if (method === "PUT") {
        const body = route.request().postDataJSON() as Partial<MilestoneFixture>
        for (const field of ["name", "due_date", "status", "sort_order"] as const) {
          if (field in body && body[field] === null) return route.fulfill(nullRejected(field))
        }
        project.milestones[idx] = { ...project.milestones[idx], ...body }
        if (body.status === "completed") {
          project.milestones[idx].is_overdue = false
          project.overdue_milestones = Math.max(0, project.overdue_milestones - 1)
        }
        return route.fulfill({ json: project.milestones[idx] })
      }
      return route.fallback()
    },
  )

  // ── 任務 ──
  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const rest = url.pathname.slice(`${prefix}/api/projects/`.length).split("/")
      return url.pathname.startsWith(`${prefix}/api/projects/`) && rest[1] === "tasks"
    },
    async (route) => {
      if (forbidEdits) return route.fulfill(forbidden)
      const segs = new URL(route.request().url()).pathname.split("/")
      const method = route.request().method()
      if (method === "POST") {
        const id = segs[segs.length - 2]
        const project = projects.find((p) => p.id === id)
        if (!project) return route.fulfill({ status: 404, json: { detail: "專案不存在" } })
        const body = route.request().postDataJSON() as Partial<TaskFixture>
        if (!knownUser(body.assignee_id)) return route.fulfill(userNotFound)
        if (body.milestone_id && !project.milestones.some((m) => m.id === body.milestone_id && m.project_id === project.id)) {
          return route.fulfill(milestoneNotInProject)
        }
        const assignee = users.find((u) => u.id === body.assignee_id)
        seq += 1
        const created: TaskFixture = {
          id: `task-new-${seq}`, project_id: project.id, title: body.title ?? "",
          description: body.description ?? null, milestone_id: body.milestone_id ?? null,
          assignee_id: body.assignee_id ?? null,
          assignee_name: assignee ? assignee.display_name || assignee.username : null,
          status: body.status ?? "todo", due_date: body.due_date ?? null, sort_order: body.sort_order ?? 0,
          created_at: "2026-09-11T00:00:00", updated_at: "2026-09-11T00:00:00",
        }
        project.tasks.push(created)
        return route.fulfill({ status: 201, json: created })
      }
      const taskId = segs[segs.length - 1]
      const id = segs[segs.length - 3]
      const project = projects.find((p) => p.id === id)
      const idx = project?.tasks.findIndex((t) => t.id === taskId) ?? -1
      if (!project || idx === -1) return route.fulfill({ status: 404, json: { detail: "任務不存在" } })
      if (method === "DELETE") {
        project.tasks.splice(idx, 1)
        return route.fulfill({ json: { success: true } })
      }
      if (method === "PUT") {
        const body = route.request().postDataJSON() as Partial<TaskFixture>
        for (const field of ["title", "status", "sort_order"] as const) {
          if (field in body && body[field] === null) return route.fulfill(nullRejected(field))
        }
        if (!knownUser(body.assignee_id)) return route.fulfill(userNotFound)
        if (body.milestone_id && !project.milestones.some((m) => m.id === body.milestone_id && m.project_id === project.id)) {
          return route.fulfill(milestoneNotInProject)
        }
        project.tasks[idx] = { ...project.tasks[idx], ...body }
        return route.fulfill({ json: project.tasks[idx] })
      }
      return route.fallback()
    },
  )

  // ── 明細／更新／刪除（放最後，只吃 /api/projects/{id}） ──
  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/projects/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const rest = url.pathname.slice(detailPrefix.length)
      return rest.length > 0 && !rest.includes("/") && rest !== "summary"
    },
    async (route) => {
      const id = new URL(route.request().url()).pathname.split("/").pop()!
      const idx = projects.findIndex((p) => p.id === id)
      if (idx === -1) return route.fulfill({ status: 404, json: { detail: "專案不存在" } })
      const method = route.request().method()
      if (method === "DELETE") {
        if (forbidEdits) return route.fulfill(forbidden)
        projects.splice(idx, 1)
        return route.fulfill({ json: { success: true } })
      }
      if (method === "PUT") {
        if (forbidEdits) return route.fulfill(forbidden)
        const body = route.request().postDataJSON() as Partial<ProjectFixture>
        for (const field of ["name", "status"] as const) {
          if (field in body && body[field] === null) return route.fulfill(nullRejected(field))
        }
        if (!knownUser(body.owner_id)) return route.fulfill(userNotFound)
        const owner = users.find((u) => u.id === body.owner_id)
        projects[idx] = {
          ...projects[idx],
          ...body,
          owner_name: owner ? owner.display_name || owner.username : projects[idx].owner_name,
        }
        return route.fulfill({ json: projects[idx] })
      }
      return route.fulfill({ json: projects[idx] })
    },
  )

  return { projects, users }
}

// ============================================================
// AI 助手（/assistant）
// ============================================================

export interface ChatMessageFixture {
  role: string
  content: string
  timestamp: number
  is_summary?: boolean
}

export interface ChatFixture {
  id: string
  user_id: number | null
  title: string
  model: string
  prompt_name: string
  messages: ChatMessageFixture[]
  created_at: string
  updated_at: string
}

export const chatFixtures: ChatFixture[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: 2,
    title: "上週出貨進度",
    model: "claude-sonnet",
    prompt_name: "personal-assistant",
    messages: [
      { role: "user", content: "上週出貨到哪了？", timestamp: 1757600000 },
      { role: "assistant", content: "目前有 **三張** 單還沒出。", timestamp: 1757600010 },
    ],
    created_at: "2026-09-10T01:00:00Z",
    updated_at: "2026-09-12T01:00:00Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    user_id: 2,
    title: "報價單格式",
    model: "claude-sonnet",
    prompt_name: "personal-assistant",
    messages: [],
    created_at: "2026-09-08T01:00:00Z",
    updated_at: "2026-09-09T01:00:00Z",
  },
]

/** 清單回應不含 messages（後端 ChatResponse 沒有這個欄位）。 */
function chatListItem(c: ChatFixture) {
  return {
    id: c.id, user_id: c.user_id, title: c.title, model: c.model,
    prompt_name: c.prompt_name, created_at: c.created_at, updated_at: c.updated_at,
  }
}

/** 攔 `/api/ai/chats`（清單／建立／詳情／改標題／刪除）與 `/api/ai/agents`；狀態留在記憶體，同一個 page 內連續操作看得到結果。 */
export async function mockAssistant(
  page: Page,
  opts: { chats?: ChatFixture[]; agents?: AiAgentFixture[] } = {},
) {
  const chats: ChatFixture[] = (opts.chats ?? chatFixtures).map((c) => ({ ...c, messages: [...c.messages] }))
  const agents: AiAgentFixture[] = (opts.agents ?? aiAgentFixtures).map((a) => ({ ...a }))
  const base = new URL(API)
  const prefix = base.pathname.replace(/\/$/, "")
  const sameOrigin = (url: URL) => url.origin === base.origin
  let created = 0

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/ai/agents`,
    async (route) => route.fulfill({ json: { items: agents, total: agents.length } }),
  )

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/ai/chats`,
    async (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON() as { title?: string; model?: string; prompt_name?: string }
        created += 1
        const now = new Date().toISOString()
        const chat: ChatFixture = {
          id: `99999999-9999-4999-8999-99999999000${created}`,
          user_id: 2,
          title: body.title ?? "新對話",
          model: body.model ?? "claude-sonnet",
          prompt_name: body.prompt_name ?? "default",
          messages: [],
          created_at: now,
          updated_at: now,
        }
        chats.unshift(chat)
        return route.fulfill({ json: chat })
      }
      return route.fulfill({ json: chats.map(chatListItem) })
    },
  )

  await page.route(
    (url) => sameOrigin(url) && url.pathname.startsWith(`${prefix}/api/ai/chats/`),
    async (route) => {
      const id = new URL(route.request().url()).pathname.split("/").pop()!
      const idx = chats.findIndex((c) => c.id === id)
      if (idx < 0) return route.fulfill({ status: 404, json: { detail: "對話不存在" } })
      const method = route.request().method()
      if (method === "DELETE") {
        chats.splice(idx, 1)
        return route.fulfill({ json: { success: true } })
      }
      if (method === "PATCH") {
        const body = route.request().postDataJSON() as { title?: string; model?: string; prompt_name?: string }
        if (body.title !== undefined && body.title !== null) chats[idx].title = body.title
        if (body.model) chats[idx].model = body.model
        if (body.prompt_name) chats[idx].prompt_name = body.prompt_name
        return route.fulfill({ json: chats[idx] })
      }
      return route.fulfill({ json: chats[idx] })
    },
  )

  return { chats, agents }
}

/** 讀出假 socket 收到的送出事件（`src/lib/socket.ts` 在 VITE_E2E build 下記錄）。 */
export async function sentSocketEvents(page: Page): Promise<{ event: string; payload: unknown }[]> {
  return page.evaluate(() => (window as unknown as { __sentEvents?: { event: string; payload: unknown }[] }).__sentEvents ?? [])
}

/** 讓假 socket 對頁面派送一個「收到」的事件。 */
export async function emitSocketEvent(page: Page, event: string, payload: unknown) {
  await page.evaluate(
    ([e, p]) => {
      const mock = (window as unknown as { __CTOS_SOCKET_MOCK__?: { receive: (e: string, p: unknown) => void } }).__CTOS_SOCKET_MOCK__
      if (!mock) throw new Error("假 socket 沒有掛上 window.__CTOS_SOCKET_MOCK__")
      mock.receive(e as string, p)
    },
    [event, payload] as [string, unknown],
  )
}

/** 假 socket 連線時帶的 auth.token。 */
export async function socketAuthToken(page: Page): Promise<string | null> {
  return page.evaluate(
    () => (window as unknown as { __CTOS_SOCKET_MOCK__?: { token: string | null } }).__CTOS_SOCKET_MOCK__?.token ?? null,
  )
}

// ============================================================
// 往來對象（/parties）
//
// fixture 欄位逐一對 backend/src/ching_tech_os/models/erp.py 的 Party* 模型：
// PartyListItem／PartyDetailResponse／PartyContactResponse／PartyAddressResponse／
// PartyPurchaseOrderItem／PartyProjectItem。Decimal 欄位（total_amount）在
// pydantic v2 的 JSON 模式序列化成字串，不是數字，fixture 照樣給字串。
// ============================================================

export interface PartyContactFixture {
  id: string
  party_id: string
  name: string
  title: string | null
  phone: string | null
  mobile: string | null
  email: string | null
  is_primary: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PartyAddressFixture {
  id: string
  party_id: string
  label: string | null
  address: string
  city: string | null
  is_primary: boolean
  created_at: string
  updated_at: string
}

export interface PartyPurchaseOrderFixture {
  id: string
  po_no: string
  status: string
  order_date: string | null
  expected_date: string | null
  total_amount: string | null
}

export interface PartyProjectFixture {
  id: string
  name: string
  status: string
}

export interface PartyFixture {
  id: string
  name: string
  short_name: string | null
  aliases: string[]
  is_supplier: boolean
  is_customer: boolean
  tax_id: string | null
  industry: string | null
  payment_terms: string | null
  notes: string | null
  source_ref: string | null
  created_by: number | null
  created_at: string
  updated_at: string
  contacts: PartyContactFixture[]
  addresses: PartyAddressFixture[]
  purchase_orders: PartyPurchaseOrderFixture[]
  projects: PartyProjectFixture[]
  knowledge_count: number
}

export const partyFixtures: PartyFixture[] = [
  {
    id: "party-1",
    name: "甲一機電股份有限公司",
    short_name: "甲一機電",
    aliases: ["甲一", "Jiayi Electric"],
    is_supplier: true,
    is_customer: false,
    tax_id: "12345678",
    industry: "機電工程",
    payment_terms: "月結 30 天",
    notes: "配電盤主力供應商。",
    source_ref: null,
    created_by: 1,
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-09-10T08:00:00",
    contacts: [
      {
        id: "contact-1", party_id: "party-1", name: "陳采購", title: "採購課長",
        phone: "02-2345-6789", mobile: "0912-345-678", email: "chen@jiayi.example",
        is_primary: true, notes: null,
        created_at: "2026-01-01T00:00:00", updated_at: "2026-01-01T00:00:00",
      },
      {
        id: "contact-2", party_id: "party-1", name: "林工程", title: "工程師",
        phone: null, mobile: "0922-111-222", email: null,
        is_primary: false, notes: null,
        created_at: "2026-02-01T00:00:00", updated_at: "2026-02-01T00:00:00",
      },
    ],
    addresses: [
      {
        id: "addr-1", party_id: "party-1", label: "總公司", address: "甲一路三段 100 號 5 樓",
        city: "臺北市", is_primary: true,
        created_at: "2026-01-01T00:00:00", updated_at: "2026-01-01T00:00:00",
      },
      {
        id: "addr-2", party_id: "party-1", label: "工廠", address: "乙二路 88 號",
        city: "桃園市", is_primary: false,
        created_at: "2026-01-01T00:00:00", updated_at: "2026-01-01T00:00:00",
      },
    ],
    purchase_orders: [
      {
        id: "po-1", po_no: "PO-202608-001", status: "ordered",
        order_date: "2026-08-01", expected_date: "2026-09-30", total_amount: "128000.00",
      },
      {
        id: "po-2", po_no: "PO-202606-001", status: "received",
        order_date: "2026-06-01", expected_date: "2026-06-20", total_amount: "45500.50",
      },
    ],
    projects: [{ id: "proj-1", name: "乙二站區監控案", status: "active" }],
    knowledge_count: 2,
  },
  {
    id: "party-2",
    name: "乙二運輸股份有限公司",
    short_name: "乙二",
    aliases: ["乙二運輸"],
    is_supplier: false,
    is_customer: true,
    tax_id: "87654321",
    industry: "軌道運輸",
    payment_terms: null,
    notes: null,
    source_ref: "erpnext:CUST-0002",
    created_by: 1,
    created_at: "2026-02-01T00:00:00",
    updated_at: "2026-09-01T00:00:00",
    contacts: [
      {
        id: "contact-9", party_id: "party-2", name: "王主任", title: null,
        phone: "02-1234-5678", mobile: null, email: null,
        is_primary: true, notes: null,
        created_at: "2026-02-01T00:00:00", updated_at: "2026-02-01T00:00:00",
      },
    ],
    addresses: [],
    purchase_orders: [],
    projects: [],
    knowledge_count: 0,
  },
  {
    id: "party-3",
    name: "丙三電機",
    short_name: null,
    // 同時是供應商與客戶，用來驗兩個角色 badge 一起出現
    aliases: [],
    is_supplier: true,
    is_customer: true,
    tax_id: null,
    industry: null,
    payment_terms: null,
    notes: null,
    source_ref: null,
    created_by: 1,
    created_at: "2026-03-01T00:00:00",
    updated_at: "2026-08-01T00:00:00",
    contacts: [],
    addresses: [],
    purchase_orders: [],
    projects: [],
    knowledge_count: 0,
  },
]

// ============================================================
// 物料與庫存（/items、/warehouses、/stock）
//
// fixture 欄位逐一對 backend/src/ching_tech_os/models/erp.py 的 Item*／Warehouse*／
// Stock* 模型。migration 030 把 qty 與 qty_delta 開成 Numeric(18,4)、purchase_price
// 開成 Numeric(14,4)，pydantic v2 的 JSON 模式把 Decimal 序列化成字串，所以
// fixture 一律給帶四位小數的字串，前端要自己收尾數。
// 名稱與料號全部是杜撰的，不對應任何真實供應商或品項。
// ============================================================

export interface WarehouseFixture {
  id: string
  code: string
  name: string
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface StockBalanceFixture {
  warehouse_id: string
  qty: string
}

export interface StockMovementFixture {
  id: string
  item_id: string
  warehouse_id: string
  qty_delta: string
  reason: string
  ref_type: string | null
  ref_id: string | null
  note: string | null
  actor_user_id: number | null
  created_at: string
}

export interface ItemFixture {
  id: string
  code: string
  name: string
  spec: string | null
  unit: string | null
  item_group: string | null
  default_supplier_id: string | null
  purchase_price: string | null
  lead_days: number | null
  aliases: string[]
  notes: string | null
  source_ref: string | null
  created_by: number | null
  created_at: string
  updated_at: string
  /** 各倉餘額；warehouse_code／warehouse_name 由 mock 依 warehouses 陣列補上 */
  balances: StockBalanceFixture[]
  movements: StockMovementFixture[]
}

export const warehouseFixtures: WarehouseFixture[] = [
  { id: "wh-1", code: "A01", name: "主倉", created_by: 1, created_at: "2026-01-01T00:00:00", updated_at: "2026-01-01T00:00:00" },
  { id: "wh-2", code: "B01", name: "工地倉", created_by: 1, created_at: "2026-01-01T00:00:00", updated_at: "2026-02-01T00:00:00" },
  // 沒有任何餘額，用來驗「倉庫還有庫存餘額，不能刪除」的反面
  { id: "wh-3", code: "C01", name: "備品倉", created_by: 1, created_at: "2026-03-01T00:00:00", updated_at: "2026-03-01T00:00:00" },
]

export const itemFixtures: ItemFixture[] = [
  {
    id: "item-1",
    code: "MTR-0001",
    name: "感應馬達",
    spec: "三相 220V 1HP",
    unit: "台",
    item_group: "馬達",
    default_supplier_id: "party-1",
    purchase_price: "8200.0000",
    lead_days: 14,
    aliases: ["induction motor", "感應電動機"],
    notes: "常備品，安全庫存 10 台。",
    source_ref: null,
    created_by: 1,
    created_at: "2026-01-05T00:00:00",
    updated_at: "2026-09-10T09:00:00",
    balances: [
      { warehouse_id: "wh-1", qty: "12.0000" },
      { warehouse_id: "wh-2", qty: "3.0000" },
    ],
    movements: [
      {
        id: "mv-1", item_id: "item-1", warehouse_id: "wh-1", qty_delta: "10.0000",
        reason: "receipt", ref_type: "purchase_order", ref_id: "po-1", note: "採購入庫",
        // created_at 在 migration 030 是 TIMESTAMP(timezone=True)，pydantic 會帶偏移送出來；
        // 這筆刻意給 UTC，畫面要顯示成台北時間 17:00 才算有轉
        actor_user_id: 1, created_at: "2026-09-10T09:00:00+00:00",
      },
      {
        id: "mv-2", item_id: "item-1", warehouse_id: "wh-2", qty_delta: "-2.0000",
        reason: "issue", ref_type: null, ref_id: null, note: "工地領用",
        actor_user_id: 2, created_at: "2026-09-08T14:30:00",
      },
      {
        id: "mv-3", item_id: "item-1", warehouse_id: "wh-1", qty_delta: "5.0000",
        reason: "adjust", ref_type: null, ref_id: null, note: "盤點補回",
        actor_user_id: 1, created_at: "2026-09-05T10:00:00",
      },
    ],
  },
  {
    id: "item-2",
    code: "SNS-0002",
    name: "丙式感測器",
    spec: "NPN 常開 12–24V",
    unit: "個",
    item_group: "感測器",
    default_supplier_id: "party-3",
    purchase_price: "1250.5000",
    lead_days: 7,
    aliases: [],
    notes: null,
    source_ref: null,
    created_by: 1,
    created_at: "2026-02-01T00:00:00",
    updated_at: "2026-09-02T00:00:00",
    balances: [{ warehouse_id: "wh-1", qty: "40.0000" }],
    movements: [
      {
        id: "mv-4", item_id: "item-2", warehouse_id: "wh-1", qty_delta: "40.0000",
        reason: "import", ref_type: null, ref_id: null, note: "舊系統匯入",
        actor_user_id: null, created_at: "2026-02-01T00:00:00",
      },
    ],
  },
  {
    id: "item-3",
    code: "CBL-0003",
    name: "控制電纜",
    // 沒有供應商、沒有價格、沒有庫存也沒有異動：驗空狀態與破折號
    spec: "0.75mm² 10C",
    unit: "公尺",
    item_group: "線材",
    default_supplier_id: null,
    purchase_price: null,
    lead_days: null,
    aliases: [],
    notes: null,
    source_ref: null,
    created_by: 1,
    created_at: "2026-03-01T00:00:00",
    updated_at: "2026-08-01T00:00:00",
    balances: [],
    movements: [],
  },
]

// ============================================================
// 採購單（/purchase-orders）
//
// fixture 欄位逐一對 backend/src/ching_tech_os/models/erp.py 的 PurchaseOrder*。
// qty／received_qty 是 Numeric(18,4)、unit_price 是 Numeric(14,4)，pydantic v2 的
// JSON 模式把 Decimal 序列化成字串，所以一律給帶四位小數的字串。
// 單號格式照 services/erp_purchasing.py 的 next_po_no：PO-YYYYMM-NNN。
// supplier_name／project_name／item_code／item_name 由 mock 依 parties、projects、
// items 三個陣列補上，跟後端的 LEFT JOIN 同一個來源。
// 名稱、單號與品名全部是杜撰的，不對應任何真實供應商或單據。
// ============================================================

export interface PurchaseOrderLineFixture {
  id: string
  item_id: string
  description: string | null
  qty: string
  unit_price: string | null
  received_qty: string
  sort_order: number
}

export interface PurchaseOrderFixture {
  id: string
  po_no: string
  supplier_id: string
  project_id: string | null
  status: string
  order_date: string | null
  expected_date: string | null
  notes: string | null
  created_by: number | null
  created_at: string
  updated_at: string
  lines: PurchaseOrderLineFixture[]
}

export const purchaseOrderFixtures: PurchaseOrderFixture[] = [
  {
    // 已下單、掛專案、兩行都還沒收：收貨對話框與「取消」的主要樣本
    id: "po-1",
    po_no: "PO-202608-001",
    supplier_id: "party-1",
    project_id: "proj-1",
    status: "ordered",
    order_date: "2026-08-01",
    expected_date: "2026-09-30",
    notes: "第一批配電盤料件。",
    created_by: 1,
    // created_at 是 timestamptz，pydantic 會帶偏移送出來；這筆刻意給 UTC，
    // 畫面要顯示成台北時間 10:00 才算有轉
    created_at: "2026-08-01T02:00:00+00:00",
    updated_at: "2026-08-05T06:30:00+00:00",
    lines: [
      { id: "line-1", item_id: "item-1", description: "含出廠測試報告", qty: "10.0000", unit_price: "12000.0000", received_qty: "0.0000", sort_order: 0 },
      { id: "line-2", item_id: "item-3", description: null, qty: "200.0000", unit_price: "40.0000", received_qty: "0.0000", sort_order: 1 },
    ],
  },
  {
    // 已收貨：明細頁不該出現「編輯」「收貨」「取消」
    id: "po-2",
    po_no: "PO-202606-001",
    supplier_id: "party-1",
    project_id: null,
    status: "received",
    order_date: "2026-06-01",
    expected_date: "2026-06-20",
    notes: null,
    created_by: 1,
    created_at: "2026-06-01T02:00:00+00:00",
    updated_at: "2026-06-20T06:00:00+00:00",
    lines: [
      { id: "line-3", item_id: "item-2", description: null, qty: "36.0000", unit_price: "1250.0000", received_qty: "36.0000", sort_order: 0 },
      { id: "line-4", item_id: "item-3", description: null, qty: "10.0000", unit_price: "50.0500", received_qty: "10.0000", sort_order: 1 },
    ],
  },
  {
    // 部分到貨，而且同一個物料有兩行：收貨的 key 只能是 line_id，不能是 item_id
    id: "po-3",
    po_no: "PO-202609-001",
    supplier_id: "party-3",
    project_id: "proj-3",
    status: "partial",
    order_date: "2026-09-01",
    expected_date: "2026-09-20",
    notes: null,
    created_by: 1,
    created_at: "2026-09-01T01:00:00+00:00",
    updated_at: "2026-09-05T01:00:00+00:00",
    lines: [
      { id: "line-5", item_id: "item-1", description: "第一批", qty: "6.0000", unit_price: "12000.0000", received_qty: "2.0000", sort_order: 0 },
      { id: "line-6", item_id: "item-1", description: "第二批", qty: "4.0000", unit_price: "11500.0000", received_qty: "0.0000", sort_order: 1 },
    ],
  },
  {
    // 草稿、沒有單價、沒有預計到貨：金額 0 與破折號的樣本
    id: "po-4",
    po_no: "PO-202609-002",
    supplier_id: "party-1",
    project_id: null,
    status: "draft",
    order_date: "2026-09-10",
    expected_date: null,
    notes: null,
    created_by: 1,
    created_at: "2026-09-10T03:00:00+00:00",
    updated_at: "2026-09-10T03:00:00+00:00",
    lines: [
      { id: "line-7", item_id: "item-3", description: null, qty: "100.0000", unit_price: null, received_qty: "0.0000", sort_order: 0 },
    ],
  },
  {
    // 已取消：再取消一次會拿到後端的「採購單已經取消」
    id: "po-5",
    po_no: "PO-202607-001",
    supplier_id: "party-3",
    project_id: null,
    status: "cancelled",
    order_date: "2026-07-01",
    expected_date: "2026-07-15",
    notes: null,
    created_by: 1,
    created_at: "2026-07-01T02:00:00+00:00",
    updated_at: "2026-07-10T02:00:00+00:00",
    lines: [
      { id: "line-8", item_id: "item-2", description: null, qty: "5.0000", unit_price: "1250.0000", received_qty: "0.0000", sort_order: 0 },
    ],
  },
]

function cloneParty(p: PartyFixture): PartyFixture {
  return {
    ...p,
    aliases: [...p.aliases],
    contacts: p.contacts.map((c) => ({ ...c })),
    addresses: p.addresses.map((a) => ({ ...a })),
    purchase_orders: p.purchase_orders.map((o) => ({ ...o })),
    projects: p.projects.map((j) => ({ ...j })),
  }
}

function clonePo(po: PurchaseOrderFixture): PurchaseOrderFixture {
  return { ...po, lines: po.lines.map((l) => ({ ...l })) }
}

function cloneItem(it: ItemFixture): ItemFixture {
  return {
    ...it,
    aliases: [...it.aliases],
    balances: it.balances.map((b) => ({ ...b })),
    movements: it.movements.map((m) => ({ ...m })),
  }
}

/** PartyListItem：明細沒有的 primary_contact／primary_phone 照後端 SQL（主要優先、phone 優先 mobile）算。 */
function partyListItemOf(p: PartyFixture) {
  const primary = [...p.contacts].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0]
  return {
    id: p.id,
    name: p.name,
    short_name: p.short_name,
    is_supplier: p.is_supplier,
    is_customer: p.is_customer,
    tax_id: p.tax_id,
    industry: p.industry,
    primary_contact: primary?.name ?? null,
    primary_phone: primary ? (primary.phone ?? primary.mobile) : null,
    created_at: p.created_at,
    updated_at: p.updated_at,
  }
}

/** PartyDetailResponse：GET 明細的 audit_id 是 null，建立／更新／合併才有值。 */
function partyDetailOf(p: PartyFixture, auditId: string | null = null) {
  return { ...cloneParty(p), audit_id: auditId }
}

/**
 * 攔 /api/parties、/api/items、/api/warehouses、/api/stock、/api/purchase-orders 全部端點。照 mockProjects 的寫法，狀態與錯誤訊息對 api/erp.py：
 * - 清單 query 只有 q／role／page／page_size（後端搜尋名稱、簡稱、統編、別名）
 * - POST /merge 的 keep_id === drop_id 回 400「不能把同一筆往來對象合併到自己」
 * - forbidEdits：寫入端點回 403（require_app_permission("vendor-management") 的樣子）
 */
export async function mockErp(
  page: Page,
  opts: {
    parties?: PartyFixture[]
    items?: ItemFixture[]
    warehouses?: WarehouseFixture[]
    purchaseOrders?: PurchaseOrderFixture[]
    /** 只用來補採購單的 project_name，不會攔 /api/projects（那是 mockProjects 的事） */
    projects?: ProjectFixture[]
    forbidEdits?: boolean
  } = {},
) {
  const parties: PartyFixture[] = (opts.parties ?? partyFixtures).map(cloneParty)
  const forbidEdits = opts.forbidEdits ?? false
  let seq = 0

  const base = new URL(API)
  const prefix = base.pathname.replace(/\/$/, "")
  const sameOrigin = (url: URL) => url.origin === base.origin
  const forbidden = { status: 403, json: { detail: "沒有權限使用此功能" } }
  const notFound = { status: 404, json: { detail: "往來對象不存在" } }
  // models/erp.py 的 _not_null：更新請求對 NOT NULL 欄位明確送 null 是 422，
  // 而且 FastAPI 的 detail 是驗證錯誤陣列不是字串
  const nullRejected = (field: string) => ({
    status: 422,
    json: { detail: [{ loc: ["body", field], msg: "Value error, 此欄位不可為 null", type: "value_error" }] },
  })

  // ── 明細／更新／刪除（先註冊；Playwright 後註冊的先比對，所以 merge 放後面才吃得到） ──
  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/parties/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const rest = url.pathname.slice(detailPrefix.length)
      return rest.length > 0 && !rest.includes("/")
    },
    async (route) => {
      const id = new URL(route.request().url()).pathname.split("/").pop()!
      const idx = parties.findIndex((p) => p.id === id)
      if (idx === -1) return route.fulfill(notFound)
      const method = route.request().method()
      if (method === "DELETE") {
        if (forbidEdits) return route.fulfill(forbidden)
        parties.splice(idx, 1)
        seq += 1
        return route.fulfill({ json: { success: true, audit_id: `audit-${seq}` } })
      }
      if (method === "PUT") {
        if (forbidEdits) return route.fulfill(forbidden)
        const body = route.request().postDataJSON() as Partial<PartyFixture>
        parties[idx] = { ...parties[idx], ...body }
        seq += 1
        return route.fulfill({ json: partyDetailOf(parties[idx], `audit-${seq}`) })
      }
      return route.fulfill({ json: partyDetailOf(parties[idx]) })
    },
  )

  // ── 聯絡人／地址：POST /{id}/{kind}、PUT／DELETE /{id}/{kind}/{cid} ──
  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/parties/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const rest = url.pathname.slice(detailPrefix.length).split("/")
      return rest[1] === "contacts" || rest[1] === "addresses"
    },
    async (route) => {
      if (forbidEdits) return route.fulfill(forbidden)
      const segs = new URL(route.request().url()).pathname.split("/")
      const method = route.request().method()

      // PUT／DELETE /{id}/{kind}/{childId}：不屬於該 party 或不存在都是 404
      if (method === "PUT" || method === "DELETE") {
        const childId = segs[segs.length - 1]
        const childKind = segs[segs.length - 2]
        const partyId = segs[segs.length - 3]
        const party = parties.find((p) => p.id === partyId)
        const isContact = childKind === "contacts"
        const childNotFound = {
          status: 404,
          json: { detail: isContact ? "聯絡人不存在" : "地址不存在" },
        }
        if (!party) return route.fulfill(childNotFound)
        seq += 1
        if (isContact) {
          const idx = party.contacts.findIndex((c) => c.id === childId)
          if (idx === -1) return route.fulfill(childNotFound)
          if (method === "DELETE") {
            // 後端是硬刪除，刪掉主要那筆不自動指派新主要
            party.contacts.splice(idx, 1)
            return route.fulfill({ json: { success: true, audit_id: `audit-${seq}` } })
          }
          const body = route.request().postDataJSON() as Partial<PartyContactFixture>
          for (const field of ["name", "is_primary"] as const) {
            if (field in body && body[field] === null) return route.fulfill(nullRejected(field))
          }
          if (body.is_primary) party.contacts.forEach((c) => (c.is_primary = false))
          party.contacts[idx] = { ...party.contacts[idx], ...body, updated_at: "2026-09-12T00:00:00" }
          party.contacts.sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
          return route.fulfill({ json: { ...party.contacts[idx], audit_id: `audit-${seq}` } })
        }
        const idx = party.addresses.findIndex((a) => a.id === childId)
        if (idx === -1) return route.fulfill(childNotFound)
        if (method === "DELETE") {
          party.addresses.splice(idx, 1)
          return route.fulfill({ json: { success: true, audit_id: `audit-${seq}` } })
        }
        const body = route.request().postDataJSON() as Partial<PartyAddressFixture>
        for (const field of ["address", "is_primary"] as const) {
          if (field in body && body[field] === null) return route.fulfill(nullRejected(field))
        }
        if (body.is_primary) party.addresses.forEach((a) => (a.is_primary = false))
        party.addresses[idx] = { ...party.addresses[idx], ...body, updated_at: "2026-09-12T00:00:00" }
        party.addresses.sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
        return route.fulfill({ json: { ...party.addresses[idx], audit_id: `audit-${seq}` } })
      }

      const kind = segs[segs.length - 1]
      const id = segs[segs.length - 2]
      const party = parties.find((p) => p.id === id)
      if (!party) return route.fulfill(notFound)
      seq += 1
      if (kind === "contacts") {
        const body = route.request().postDataJSON() as Partial<PartyContactFixture>
        // 後端 _insert_contact：設 is_primary 會把同一家原本的主要聯絡人取消
        if (body.is_primary) party.contacts.forEach((c) => (c.is_primary = false))
        party.contacts.push({
          id: `contact-new-${seq}`, party_id: party.id, name: body.name ?? "",
          title: body.title ?? null, phone: body.phone ?? null, mobile: body.mobile ?? null,
          email: body.email ?? null, is_primary: Boolean(body.is_primary), notes: body.notes ?? null,
          created_at: "2026-09-12T00:00:00", updated_at: "2026-09-12T00:00:00",
        })
        party.contacts.sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
        return route.fulfill({
          status: 201,
          json: { success: true, contact_id: `contact-new-${seq}`, audit_id: `audit-${seq}` },
        })
      }
      const body = route.request().postDataJSON() as Partial<PartyAddressFixture>
      if (body.is_primary) party.addresses.forEach((a) => (a.is_primary = false))
      party.addresses.push({
        id: `addr-new-${seq}`, party_id: party.id, label: body.label ?? null,
        address: body.address ?? "", city: body.city ?? null, is_primary: Boolean(body.is_primary),
        created_at: "2026-09-12T00:00:00", updated_at: "2026-09-12T00:00:00",
      })
      party.addresses.sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      return route.fulfill({
        status: 201,
        json: { success: true, address_id: `addr-new-${seq}`, audit_id: `audit-${seq}` },
      })
    },
  )

  // ── 合併（後註冊才比明細那條先比對） ──
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/parties/merge`,
    async (route) => {
      if (forbidEdits) return route.fulfill(forbidden)
      const body = route.request().postDataJSON() as { keep_id: string; drop_id: string }
      if (body.keep_id === body.drop_id) {
        return route.fulfill({ status: 400, json: { detail: "不能把同一筆往來對象合併到自己" } })
      }
      const keepIdx = parties.findIndex((p) => p.id === body.keep_id)
      const dropIdx = parties.findIndex((p) => p.id === body.drop_id)
      if (keepIdx === -1 || dropIdx === -1) {
        return route.fulfill({ status: 400, json: { detail: "要合併的往來對象不存在或已刪除" } })
      }
      const keep = parties[keepIdx]
      const drop = parties[dropIdx]
      const keepHasPrimaryContact = keep.contacts.some((c) => c.is_primary)
      const keepHasPrimaryAddress = keep.addresses.some((a) => a.is_primary)
      keep.contacts.push(
        ...drop.contacts.map((c) => ({ ...c, party_id: keep.id, is_primary: keepHasPrimaryContact ? false : c.is_primary })),
      )
      keep.addresses.push(
        ...drop.addresses.map((a) => ({ ...a, party_id: keep.id, is_primary: keepHasPrimaryAddress ? false : a.is_primary })),
      )
      keep.purchase_orders.push(...drop.purchase_orders.map((o) => ({ ...o })))
      // _merge_aliases：keep 的別名 ＋ drop 的名稱／簡稱／別名，去重且保持順序
      for (const alias of [drop.name, drop.short_name, ...drop.aliases]) {
        if (alias && alias !== keep.name && !keep.aliases.includes(alias)) keep.aliases.push(alias)
      }
      // 主檔欄位：角色取 OR、統編取 COALESCE（keep 沒有才吃 drop 的）
      keep.is_supplier = keep.is_supplier || drop.is_supplier
      keep.is_customer = keep.is_customer || drop.is_customer
      keep.tax_id = keep.tax_id ?? drop.tax_id
      keep.updated_at = "2026-09-12T00:00:00"
      parties.splice(dropIdx, 1)
      seq += 1
      return route.fulfill({ json: partyDetailOf(keep, `audit-${seq}`) })
    },
  )

  // ── 清單與建立 ──
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/parties`,
    async (route) => {
      const method = route.request().method()
      if (method === "POST") {
        if (forbidEdits) return route.fulfill(forbidden)
        const body = route.request().postDataJSON() as Partial<PartyFixture>
        seq += 1
        const created: PartyFixture = {
          id: `party-new-${seq}`,
          name: body.name ?? "",
          short_name: body.short_name ?? null,
          aliases: body.aliases ?? [],
          is_supplier: Boolean(body.is_supplier),
          is_customer: Boolean(body.is_customer),
          tax_id: body.tax_id ?? null,
          industry: body.industry ?? null,
          payment_terms: body.payment_terms ?? null,
          notes: body.notes ?? null,
          source_ref: body.source_ref ?? null,
          created_by: 1,
          created_at: "2026-09-12T00:00:00",
          updated_at: "2026-09-12T00:00:00",
          contacts: (body.contacts ?? []).map((c, i) => ({
            id: `contact-new-${seq}-${i}`, party_id: `party-new-${seq}`, name: c.name ?? "",
            title: c.title ?? null, phone: c.phone ?? null, mobile: c.mobile ?? null,
            email: c.email ?? null, is_primary: Boolean(c.is_primary), notes: c.notes ?? null,
            created_at: "2026-09-12T00:00:00", updated_at: "2026-09-12T00:00:00",
          })),
          addresses: (body.addresses ?? []).map((a, i) => ({
            id: `addr-new-${seq}-${i}`, party_id: `party-new-${seq}`, label: a.label ?? null,
            address: a.address ?? "", city: a.city ?? null, is_primary: Boolean(a.is_primary),
            created_at: "2026-09-12T00:00:00", updated_at: "2026-09-12T00:00:00",
          })),
          purchase_orders: [],
          projects: [],
          knowledge_count: 0,
        }
        parties.push(created)
        return route.fulfill({ status: 201, json: partyDetailOf(created, `audit-${seq}`) })
      }
      const params = new URL(route.request().url()).searchParams
      let filtered = parties
      const role = params.get("role")
      if (role === "supplier") filtered = filtered.filter((p) => p.is_supplier)
      if (role === "customer") filtered = filtered.filter((p) => p.is_customer)
      if (role === "both") filtered = filtered.filter((p) => p.is_supplier && p.is_customer)
      const q = params.get("q")
      if (q) {
        // 後端是 ILIKE：名稱／簡稱／統編／別名／聯絡人姓名都不分大小寫，
        // 但電話與手機走等值比對（避免片段號碼誤中）
        const needle = q.toLowerCase()
        const has = (v: string | null) => (v ?? "").toLowerCase().includes(needle)
        filtered = filtered.filter(
          (p) =>
            has(p.name) ||
            has(p.short_name) ||
            has(p.tax_id) ||
            p.aliases.some(has) ||
            p.contacts.some((c) => has(c.name) || c.phone === q || c.mobile === q),
        )
      }
      // 後端 ORDER BY p.updated_at DESC
      filtered = [...filtered].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      const pageNum = Number(params.get("page") ?? "1")
      const pageSize = Number(params.get("page_size") ?? "20")
      const start = (pageNum - 1) * pageSize
      await route.fulfill({
        json: { items: filtered.slice(start, start + pageSize).map(partyListItemOf), total: filtered.length },
      })
    },
  )

  // ── 物料、倉庫、庫存 ──────────────────────────────────────
  // 錯誤訊息逐字對 services/erp_inventory.py：料號／倉庫代碼撞名、負庫存、
  // 調撥數量與同倉調撥都是 400（api/erp.py 的 _http_error 把 ErpError 翻成 400）。
  const items: ItemFixture[] = (opts.items ?? itemFixtures).map(cloneItem)
  const warehouses: WarehouseFixture[] = (opts.warehouses ?? warehouseFixtures).map((w) => ({ ...w }))
  const itemNotFound = { status: 404, json: { detail: "物料不存在" } }
  const warehouseNotFound = { status: 404, json: { detail: "倉庫不存在" } }

  /** Numeric(18,4)：mock 用浮點算完再固定四位，跟後端送出來的字串同形狀 */
  const q4 = (n: number) => n.toFixed(4)
  const balanceOf = (item: ItemFixture, warehouseId: string) =>
    item.balances.find((b) => b.warehouse_id === warehouseId)
  const totalQtyOf = (item: ItemFixture) =>
    q4(item.balances.reduce((sum, b) => sum + Number(b.qty), 0))

  function warehouseOf(id: string) {
    return warehouses.find((w) => w.id === id)
  }

  function itemListItemOf(it: ItemFixture) {
    return {
      id: it.id,
      code: it.code,
      name: it.name,
      spec: it.spec,
      unit: it.unit,
      item_group: it.item_group,
      default_supplier_id: it.default_supplier_id,
      // 後端是 LEFT JOIN parties，供應商名字跟著往來對象主檔走
      default_supplier_name: parties.find((p) => p.id === it.default_supplier_id)?.name ?? null,
      purchase_price: it.purchase_price,
      total_qty: totalQtyOf(it),
      created_at: it.created_at,
      updated_at: it.updated_at,
    }
  }

  function itemDetailOf(it: ItemFixture, auditId: string | null = null) {
    return {
      id: it.id,
      audit_id: auditId,
      code: it.code,
      name: it.name,
      spec: it.spec,
      unit: it.unit,
      item_group: it.item_group,
      default_supplier_id: it.default_supplier_id,
      default_supplier_name: parties.find((p) => p.id === it.default_supplier_id)?.name ?? null,
      purchase_price: it.purchase_price,
      lead_days: it.lead_days,
      aliases: [...it.aliases],
      notes: it.notes,
      source_ref: it.source_ref,
      created_by: it.created_by,
      created_at: it.created_at,
      updated_at: it.updated_at,
      // 後端 ORDER BY w.code，而且 JOIN 掉已刪除的倉庫
      balances: it.balances
        .filter((b) => warehouseOf(b.warehouse_id))
        .map((b) => ({
          warehouse_id: b.warehouse_id,
          warehouse_code: warehouseOf(b.warehouse_id)!.code,
          warehouse_name: warehouseOf(b.warehouse_id)!.name,
          qty: b.qty,
        }))
        .sort((a, b) => a.warehouse_code.localeCompare(b.warehouse_code)),
      total_qty: totalQtyOf(it),
      // 後端 ORDER BY m.created_at DESC LIMIT 20
      movements: [...it.movements]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 20)
        .map((m) => ({ ...m, warehouse_name: warehouseOf(m.warehouse_id)?.name ?? null })),
    }
  }

  /** apply_movement：先寫異動再累計餘額，餘額為負就整筆退回（交易回滾） */
  function applyMovement(
    item: ItemFixture,
    warehouseId: string,
    delta: number,
    reason: string,
    note: string | null,
    ref: { type: string; id: string } | null = null,
  ): { error?: string } {
    const current = Number(balanceOf(item, warehouseId)?.qty ?? "0")
    const next = current + delta
    if (next < 0) {
      return { error: `庫存不足：目前 ${q4(current)}，要異動 ${q4(delta)}（不允許負庫存）` }
    }
    const existing = balanceOf(item, warehouseId)
    if (existing) existing.qty = q4(next)
    else item.balances.push({ warehouse_id: warehouseId, qty: q4(next) })
    seq += 1
    item.movements.push({
      id: `mv-new-${seq}`,
      item_id: item.id,
      warehouse_id: warehouseId,
      qty_delta: q4(delta),
      reason,
      ref_type: ref?.type ?? null,
      ref_id: ref?.id ?? null,
      note,
      actor_user_id: 2,
      created_at: "2026-09-12T12:00:00",
    })
    return {}
  }

  // 物料明細／更新／刪除
  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/items/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const rest = url.pathname.slice(detailPrefix.length)
      return rest.length > 0 && !rest.includes("/")
    },
    async (route) => {
      const id = new URL(route.request().url()).pathname.split("/").pop()!
      const idx = items.findIndex((it) => it.id === id)
      if (idx === -1) return route.fulfill(itemNotFound)
      const method = route.request().method()
      if (method === "DELETE") {
        if (forbidEdits) return route.fulfill(forbidden)
        items.splice(idx, 1)
        seq += 1
        return route.fulfill({ json: { success: true, audit_id: `audit-${seq}` } })
      }
      if (method === "PUT") {
        if (forbidEdits) return route.fulfill(forbidden)
        const body = route.request().postDataJSON() as Partial<ItemFixture>
        for (const field of ["code", "name", "aliases"] as const) {
          if (field in body && body[field] === null) return route.fulfill(nullRejected(field))
        }
        if (body.code && items.some((it) => it.id !== id && it.code === body.code)) {
          return route.fulfill({ status: 400, json: { detail: `料號已存在：${body.code}` } })
        }
        items[idx] = { ...items[idx], ...body, updated_at: "2026-09-12T12:00:00" }
        seq += 1
        return route.fulfill({ json: itemDetailOf(items[idx], `audit-${seq}`) })
      }
      return route.fulfill({ json: itemDetailOf(items[idx]) })
    },
  )

  // 物料清單／建立
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/items`,
    async (route) => {
      const method = route.request().method()
      if (method === "POST") {
        if (forbidEdits) return route.fulfill(forbidden)
        const body = route.request().postDataJSON() as Partial<ItemFixture>
        if (items.some((it) => it.code === body.code)) {
          return route.fulfill({ status: 400, json: { detail: `料號已存在：${body.code}` } })
        }
        seq += 1
        const created: ItemFixture = {
          id: `item-new-${seq}`,
          code: body.code ?? "",
          name: body.name ?? "",
          spec: body.spec ?? null,
          unit: body.unit ?? null,
          item_group: body.item_group ?? null,
          default_supplier_id: body.default_supplier_id ?? null,
          purchase_price: body.purchase_price ?? null,
          lead_days: body.lead_days ?? null,
          aliases: body.aliases ?? [],
          notes: body.notes ?? null,
          source_ref: body.source_ref ?? null,
          created_by: 1,
          created_at: "2026-09-12T12:00:00",
          updated_at: "2026-09-12T12:00:00",
          balances: [],
          movements: [],
        }
        items.push(created)
        return route.fulfill({ status: 201, json: itemDetailOf(created, `audit-${seq}`) })
      }
      const params = new URL(route.request().url()).searchParams
      let filtered = items
      const group = params.get("item_group")
      // 後端是 i.item_group = $1 的等值比對，不是模糊
      if (group) filtered = filtered.filter((it) => it.item_group === group)
      const q = params.get("q")
      if (q) {
        // 後端 ILIKE：料號／品名／規格／別名，四個欄位都不分大小寫
        const needle = q.toLowerCase()
        const has = (v: string | null) => (v ?? "").toLowerCase().includes(needle)
        filtered = filtered.filter((it) => has(it.code) || has(it.name) || has(it.spec) || it.aliases.some(has))
      }
      // 後端 ORDER BY i.updated_at DESC
      filtered = [...filtered].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      const pageNum = Number(params.get("page") ?? "1")
      const pageSize = Number(params.get("page_size") ?? "20")
      const start = (pageNum - 1) * pageSize
      await route.fulfill({
        json: { items: filtered.slice(start, start + pageSize).map(itemListItemOf), total: filtered.length },
      })
    },
  )

  // 倉庫更新／刪除
  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/warehouses/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const rest = url.pathname.slice(detailPrefix.length)
      return rest.length > 0 && !rest.includes("/")
    },
    async (route) => {
      if (forbidEdits) return route.fulfill(forbidden)
      const id = new URL(route.request().url()).pathname.split("/").pop()!
      const idx = warehouses.findIndex((w) => w.id === id)
      if (idx === -1) return route.fulfill(warehouseNotFound)
      if (route.request().method() === "DELETE") {
        const used = items.some((it) => it.balances.some((b) => b.warehouse_id === id && Number(b.qty) !== 0))
        if (used) return route.fulfill({ status: 400, json: { detail: "倉庫還有庫存餘額，不能刪除" } })
        warehouses.splice(idx, 1)
        seq += 1
        return route.fulfill({ json: { success: true, audit_id: `audit-${seq}` } })
      }
      const body = route.request().postDataJSON() as Partial<WarehouseFixture>
      for (const field of ["code", "name"] as const) {
        if (field in body && body[field] === null) return route.fulfill(nullRejected(field))
      }
      if (body.code && warehouses.some((w) => w.id !== id && w.code === body.code)) {
        return route.fulfill({ status: 400, json: { detail: `倉庫代碼已存在：${body.code}` } })
      }
      warehouses[idx] = { ...warehouses[idx], ...body, updated_at: "2026-09-12T12:00:00" }
      seq += 1
      return route.fulfill({ json: { ...warehouses[idx], audit_id: `audit-${seq}` } })
    },
  )

  // 倉庫清單／建立
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/warehouses`,
    async (route) => {
      const method = route.request().method()
      if (method === "POST") {
        if (forbidEdits) return route.fulfill(forbidden)
        const body = route.request().postDataJSON() as Partial<WarehouseFixture>
        if (warehouses.some((w) => w.code === body.code)) {
          return route.fulfill({ status: 400, json: { detail: `倉庫代碼已存在：${body.code}` } })
        }
        seq += 1
        const created: WarehouseFixture = {
          id: `wh-new-${seq}`,
          code: body.code ?? "",
          name: body.name ?? "",
          created_by: 1,
          created_at: "2026-09-12T12:00:00",
          updated_at: "2026-09-12T12:00:00",
        }
        warehouses.push(created)
        return route.fulfill({ status: 201, json: { ...created, audit_id: `audit-${seq}` } })
      }
      // 後端 ORDER BY code；page_size 預設 50
      const params = new URL(route.request().url()).searchParams
      const sorted = [...warehouses].sort((a, b) => a.code.localeCompare(b.code))
      const pageNum = Number(params.get("page") ?? "1")
      const pageSize = Number(params.get("page_size") ?? "50")
      const start = (pageNum - 1) * pageSize
      await route.fulfill({
        json: { items: sorted.slice(start, start + pageSize).map((w) => ({ ...w, audit_id: null })), total: sorted.length },
      })
    },
  )

  // 調整庫存
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/stock/adjust`,
    async (route) => {
      if (forbidEdits) return route.fulfill(forbidden)
      const body = route.request().postDataJSON() as {
        item_id: string
        warehouse_id: string
        qty_delta: number | string
        reason?: string
        note?: string | null
      }
      const item = items.find((it) => it.id === body.item_id)
      if (!item) return route.fulfill(itemNotFound)
      const delta = Number(body.qty_delta)
      if (delta === 0) return route.fulfill({ status: 400, json: { detail: "異動數量不可為 0" } })
      const applied = applyMovement(item, body.warehouse_id, delta, body.reason ?? "adjust", body.note ?? null)
      if (applied.error) return route.fulfill({ status: 400, json: { detail: applied.error } })
      item.updated_at = "2026-09-12T12:00:00"
      seq += 1
      return route.fulfill({
        json: {
          success: true,
          audit_id: `audit-${seq}`,
          qty_after: balanceOf(item, body.warehouse_id)!.qty,
        },
      })
    },
  )

  // 倉別調撥
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/stock/transfer`,
    async (route) => {
      if (forbidEdits) return route.fulfill(forbidden)
      const body = route.request().postDataJSON() as {
        item_id: string
        from_warehouse_id: string
        to_warehouse_id: string
        qty: number | string
        note?: string | null
      }
      const item = items.find((it) => it.id === body.item_id)
      if (!item) return route.fulfill(itemNotFound)
      const qty = Number(body.qty)
      if (qty <= 0) return route.fulfill({ status: 400, json: { detail: "調撥數量必須大於 0" } })
      if (body.from_warehouse_id === body.to_warehouse_id) {
        return route.fulfill({ status: 400, json: { detail: "來源倉與目的倉不能相同" } })
      }
      const out = applyMovement(item, body.from_warehouse_id, -qty, "transfer_out", body.note ?? null)
      if (out.error) return route.fulfill({ status: 400, json: { detail: out.error } })
      applyMovement(item, body.to_warehouse_id, qty, "transfer_in", body.note ?? null)
      item.updated_at = "2026-09-12T12:00:00"
      seq += 1
      return route.fulfill({
        json: {
          success: true,
          audit_id: `audit-${seq}`,
          balances: [body.from_warehouse_id, body.to_warehouse_id].map((wid) => ({
            warehouse_id: wid,
            qty: balanceOf(item, wid)!.qty,
          })),
        },
      })
    },
  )

  // 庫存查詢（item × warehouse 一列）
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/stock`,
    async (route) => {
      const params = new URL(route.request().url()).searchParams
      const itemId = params.get("item_id")
      const warehouseId = params.get("warehouse_id")
      const rows = items
        .filter((it) => !itemId || it.id === itemId)
        .flatMap((it) =>
          it.balances
            .filter((b) => (!warehouseId || b.warehouse_id === warehouseId) && warehouseOf(b.warehouse_id))
            .map((b) => ({
              item_id: it.id,
              item_code: it.code,
              item_name: it.name,
              warehouse_id: b.warehouse_id,
              warehouse_code: warehouseOf(b.warehouse_id)!.code,
              warehouse_name: warehouseOf(b.warehouse_id)!.name,
              qty: b.qty,
            })),
        )
      // 後端 ORDER BY i.code, w.code
      rows.sort((a, b) => a.item_code.localeCompare(b.item_code) || a.warehouse_code.localeCompare(b.warehouse_code))
      const pageNum = Number(params.get("page") ?? "1")
      const pageSize = Number(params.get("page_size") ?? "50")
      const start = (pageNum - 1) * pageSize
      await route.fulfill({ json: { items: rows.slice(start, start + pageSize), total: rows.length } })
    },
  )

  // ── 採購單 ──────────────────────────────────────────────────
  // 錯誤訊息逐字對 services/erp_purchasing.py；狀態碼對 api/erp.py 的 _http_error
  // （ErpError → 400、NotFoundError → 404、AmbiguousError → 409）。
  const purchaseOrders: PurchaseOrderFixture[] = (opts.purchaseOrders ?? purchaseOrderFixtures).map(clonePo)
  const projects: ProjectFixture[] = (opts.projects ?? projectFixtures).map((p) => ({ ...p }))
  const poNotFound = { status: 404, json: { detail: "採購單不存在" } }
  // models/erp.py 的 ConfigDict(extra="forbid")：pydantic v2 的 extra_forbidden
  const PO_CREATE_FIELDS = ["supplier_id", "lines", "project_id", "status", "order_date", "expected_date", "notes"]
  const PO_LINE_CREATE_FIELDS = ["item_id", "qty", "unit_price", "description"]
  const extraForbidden = (loc: (string | number)[], field: string) => ({
    status: 422,
    json: { detail: [{ loc: [...loc, field], msg: "Extra inputs are not permitted", type: "extra_forbidden" }] },
  })
  // 後端 _CLOSED_STATUSES：已收貨與已取消的單不給改、也不給收貨
  const CLOSED_STATUSES = ["received", "cancelled"]

  const lineAmount = (l: PurchaseOrderLineFixture) => Number(l.qty) * Number(l.unit_price ?? "0")
  const poTotal = (po: PurchaseOrderFixture) => q4(po.lines.reduce((sum, l) => sum + lineAmount(l), 0))
  const lineRemain = (l: PurchaseOrderLineFixture) => Number(l.qty) - Number(l.received_qty)

  function poListItemOf(po: PurchaseOrderFixture) {
    return {
      id: po.id,
      po_no: po.po_no,
      supplier_id: po.supplier_id,
      supplier_name: parties.find((p) => p.id === po.supplier_id)?.name ?? null,
      project_id: po.project_id,
      project_name: projects.find((p) => p.id === po.project_id)?.name ?? null,
      status: po.status,
      order_date: po.order_date,
      expected_date: po.expected_date,
      // 後端是兩支相關子查詢：行項數與 SUM(qty * COALESCE(unit_price, 0))
      line_count: po.lines.length,
      total_amount: poTotal(po),
      created_at: po.created_at,
      updated_at: po.updated_at,
    }
  }

  /** PurchaseOrderDetailResponse：GET 明細的 audit_id 是 null，建立／更新才有值。 */
  function poDetailOf(po: PurchaseOrderFixture, auditId: string | null = null) {
    return {
      id: po.id,
      audit_id: auditId,
      po_no: po.po_no,
      supplier_id: po.supplier_id,
      supplier_name: parties.find((p) => p.id === po.supplier_id)?.name ?? null,
      project_id: po.project_id,
      project_name: projects.find((p) => p.id === po.project_id)?.name ?? null,
      status: po.status,
      order_date: po.order_date,
      expected_date: po.expected_date,
      notes: po.notes,
      created_by: po.created_by,
      created_at: po.created_at,
      updated_at: po.updated_at,
      // 後端 ORDER BY l.sort_order, l.id
      lines: [...po.lines]
        .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
        .map((l) => ({
          id: l.id,
          po_id: po.id,
          item_id: l.item_id,
          item_code: items.find((it) => it.id === l.item_id)?.code ?? null,
          item_name: items.find((it) => it.id === l.item_id)?.name ?? null,
          description: l.description,
          qty: l.qty,
          unit_price: l.unit_price,
          received_qty: l.received_qty,
          sort_order: l.sort_order,
        })),
      total_amount: poTotal(po),
    }
  }

  /** _refresh_po_status：全收改 received、部分收改 partial，其餘回 ordered。 */
  function refreshPoStatus(po: PurchaseOrderFixture): string {
    const total = po.lines.reduce((s, l) => s + Number(l.qty), 0)
    const received = po.lines.reduce((s, l) => s + Number(l.received_qty), 0)
    po.status = received >= total ? "received" : received > 0 ? "partial" : "ordered"
    po.updated_at = "2026-09-12T12:00:00+00:00"
    return po.status
  }

  // 採購單明細／更新
  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/purchase-orders/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const rest = url.pathname.slice(detailPrefix.length)
      return rest.length > 0 && !rest.includes("/")
    },
    async (route) => {
      const id = new URL(route.request().url()).pathname.split("/").pop()!
      const po = purchaseOrders.find((p) => p.id === id)
      if (!po) return route.fulfill(poNotFound)
      if (route.request().method() !== "PUT") return route.fulfill({ json: poDetailOf(po) })
      if (forbidEdits) return route.fulfill(forbidden)
      if (CLOSED_STATUSES.includes(po.status)) {
        return route.fulfill({ status: 400, json: { detail: `採購單狀態為 ${po.status}，不能修改` } })
      }
      const body = route.request().postDataJSON() as Partial<PurchaseOrderFixture>
      // models/erp.py 的 _not_null：supplier_id 與 status 明確送 null 是 422
      for (const field of ["supplier_id", "status"] as const) {
        if (field in body && body[field] === null) return route.fulfill(nullRejected(field))
      }
      // PurchaseOrderUpdate 的 status 只收 draft／ordered（EditablePurchaseOrderStatus）
      if (body.status && !["draft", "ordered"].includes(body.status)) {
        return route.fulfill({
          status: 422,
          json: { detail: [{ loc: ["body", "status"], msg: "Input should be 'draft' or 'ordered'", type: "literal_error" }] },
        })
      }
      Object.assign(po, body, { updated_at: "2026-09-12T12:00:00+00:00" })
      seq += 1
      return route.fulfill({ json: poDetailOf(po, `audit-${seq}`) })
    },
  )

  // 收貨與取消（後註冊才比明細那條先比對）
  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/purchase-orders/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const rest = url.pathname.slice(detailPrefix.length).split("/")
      return rest[1] === "receive" || rest[1] === "cancel"
    },
    async (route) => {
      if (forbidEdits) return route.fulfill(forbidden)
      const segs = new URL(route.request().url()).pathname.split("/")
      const action = segs[segs.length - 1]
      const po = purchaseOrders.find((p) => p.id === segs[segs.length - 2])
      if (!po) return route.fulfill(poNotFound)
      seq += 1

      if (action === "cancel") {
        if (po.status === "cancelled") {
          return route.fulfill({ status: 400, json: { detail: "採購單已經取消" } })
        }
        if (po.lines.some((l) => Number(l.received_qty) > 0)) {
          return route.fulfill({ status: 400, json: { detail: "已收過貨的採購單不能取消，請先做庫存調整" } })
        }
        po.status = "cancelled"
        po.updated_at = "2026-09-12T12:00:00+00:00"
        return route.fulfill({ json: { success: true, status: "cancelled", audit_id: `audit-${seq}` } })
      }

      if (CLOSED_STATUSES.includes(po.status)) {
        return route.fulfill({ status: 400, json: { detail: `採購單狀態為 ${po.status}，不能收貨` } })
      }
      const body = route.request().postDataJSON() as {
        lines?: { line_id?: string; item_id?: string; qty: number | string }[]
        all?: boolean
        warehouse_id?: string | null
        note?: string | null
      }

      // _resolve_receive_warehouse：沒指定入庫倉時只有一個倉才自動採用
      let warehouseId = body.warehouse_id ?? null
      if (warehouseId) {
        if (!warehouseOf(warehouseId)) {
          return route.fulfill({ status: 400, json: { detail: "倉庫不存在或已刪除" } })
        }
      } else if (warehouses.length === 1) {
        warehouseId = warehouses[0].id
      } else {
        return route.fulfill({ status: 400, json: { detail: "請指定入庫倉別" } })
      }

      // _receive_plan：行項的 key 是 line_id；同一行在同一個請求裡出現兩次，剩餘量要遞減
      const remain = new Map(po.lines.map((l) => [l.id, lineRemain(l)]))
      const plan: { line: PurchaseOrderLineFixture; qty: number }[] = []
      if (body.all) {
        for (const l of po.lines) {
          if (lineRemain(l) > 0) plan.push({ line: l, qty: lineRemain(l) })
        }
      } else {
        for (const entry of body.lines ?? []) {
          let line: PurchaseOrderLineFixture | undefined
          if (entry.line_id) {
            line = po.lines.find((l) => l.id === entry.line_id)
            if (!line) {
              return route.fulfill({ status: 400, json: { detail: `採購單沒有這個行項：${entry.line_id}` } })
            }
          } else if (entry.item_id) {
            const matched = po.lines.filter((l) => l.item_id === entry.item_id)
            if (matched.length === 0) {
              return route.fulfill({ status: 400, json: { detail: `採購單沒有這個物料的行項：${entry.item_id}` } })
            }
            // 同一物料有兩行時後端拋 AmbiguousError → 409，要呼叫端指定 line_id
            if (matched.length > 1) {
              return route.fulfill({ status: 409, json: { detail: `採購單行項有多筆符合：${entry.item_id}` } })
            }
            line = matched[0]
          } else {
            return route.fulfill({ status: 400, json: { detail: "收貨行項要給 line_id 或 item_id" } })
          }
          const qty = Number(entry.qty)
          if (!(qty > 0)) {
            return route.fulfill({ status: 400, json: { detail: "收貨數量必須大於 0" } })
          }
          const left = remain.get(line.id)!
          if (qty > left) {
            return route.fulfill({
              status: 400,
              json: { detail: `收貨數量超過未收量（未收 ${q4(left)}，要收 ${String(entry.qty)}）` },
            })
          }
          remain.set(line.id, left - qty)
          plan.push({ line, qty })
        }
      }
      if (plan.length === 0) {
        return route.fulfill({ status: 400, json: { detail: "沒有可收貨的行項" } })
      }

      for (const { line, qty } of plan) {
        line.received_qty = q4(Number(line.received_qty) + qty)
        const item = items.find((it) => it.id === line.item_id)
        // 收貨走 erp_inventory.apply_movement，reason=receipt，ref 指回採購單
        if (item) applyMovement(item, warehouseId, qty, "receipt", body.note ?? null, { type: "purchase_order", id: po.id })
      }
      return route.fulfill({ json: { success: true, status: refreshPoStatus(po), audit_id: `audit-${seq}` } })
    },
  )

  // 採購單清單／建立
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/purchase-orders`,
    async (route) => {
      const method = route.request().method()
      if (method === "POST") {
        if (forbidEdits) return route.fulfill(forbidden)
        const body = route.request().postDataJSON() as {
          supplier_id?: string
          project_id?: string | null
          status?: string
          order_date?: string | null
          expected_date?: string | null
          notes?: string | null
          lines?: { item_id: string; qty: string; unit_price?: string | null; description?: string | null }[]
        }
        // PurchaseOrderCreate 與 PurchaseOrderLineCreate 都是 extra="forbid"：
        // po_no 由 service 產生、received_qty 只給匯入腳本用，REST 送進來是 422
        const extra = Object.keys(body).find((k) => !PO_CREATE_FIELDS.includes(k))
        if (extra) return route.fulfill(extraForbidden(["body"], extra))
        const lines = body.lines ?? []
        if (lines.length === 0) {
          return route.fulfill({ status: 400, json: { detail: "採購單至少要一個行項" } })
        }
        for (const [i, l] of lines.entries()) {
          const bad = Object.keys(l).find((k) => !PO_LINE_CREATE_FIELDS.includes(k))
          if (bad) return route.fulfill(extraForbidden(["body", "lines", i], bad))
        }
        if (!parties.some((p) => p.id === body.supplier_id)) {
          return route.fulfill({ status: 400, json: { detail: "供應商不存在或已刪除" } })
        }
        if (body.project_id && !projects.some((p) => p.id === body.project_id)) {
          return route.fulfill({ status: 400, json: { detail: "專案不存在" } })
        }
        for (const l of lines) {
          if (!items.some((it) => it.id === l.item_id)) {
            return route.fulfill({ status: 400, json: { detail: `物料不存在或已刪除：${l.item_id}` } })
          }
          if (!(Number(l.qty) > 0)) {
            return route.fulfill({ status: 400, json: { detail: "行項數量必須大於 0" } })
          }
        }
        seq += 1
        // next_po_no：PO-YYYYMM-NNN，序號是同月已存在的最大值 +1
        const orderDate = body.order_date || "2026-09-12"
        const poPrefix = `PO-${orderDate.slice(0, 4)}${orderDate.slice(5, 7)}-`
        const maxSeq = purchaseOrders
          .filter((p) => p.po_no.startsWith(poPrefix))
          .reduce((m, p) => Math.max(m, Number(p.po_no.slice(poPrefix.length)) || 0), 0)
        const created: PurchaseOrderFixture = {
          id: `po-new-${seq}`,
          po_no: `${poPrefix}${String(maxSeq + 1).padStart(3, "0")}`,
          supplier_id: body.supplier_id!,
          project_id: body.project_id ?? null,
          status: body.status ?? "ordered",
          order_date: orderDate,
          expected_date: body.expected_date ?? null,
          notes: body.notes ?? null,
          created_by: 1,
          created_at: "2026-09-12T12:00:00+00:00",
          updated_at: "2026-09-12T12:00:00+00:00",
          lines: lines.map((l, i) => ({
            id: `line-new-${seq}-${i}`,
            item_id: l.item_id,
            description: l.description ?? null,
            qty: q4(Number(l.qty)),
            unit_price: l.unit_price === null || l.unit_price === undefined ? null : q4(Number(l.unit_price)),
            received_qty: "0.0000",
            sort_order: i,
          })),
        }
        purchaseOrders.push(created)
        return route.fulfill({ status: 201, json: poDetailOf(created, `audit-${seq}`) })
      }

      const params = new URL(route.request().url()).searchParams
      let filtered = purchaseOrders
      const supplierId = params.get("supplier_id")
      if (supplierId) filtered = filtered.filter((p) => p.supplier_id === supplierId)
      const status = params.get("status")
      if (status) filtered = filtered.filter((p) => p.status === status)
      const projectId = params.get("project_id")
      if (projectId) filtered = filtered.filter((p) => p.project_id === projectId)
      const since = params.get("since")
      // 後端是 COALESCE(po.order_date, po.created_at::date) >= $4
      if (since) filtered = filtered.filter((p) => (p.order_date ?? p.created_at.slice(0, 10)) >= since)
      // 後端 ORDER BY po.created_at DESC
      filtered = [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at))
      const pageNum = Number(params.get("page") ?? "1")
      const pageSize = Number(params.get("page_size") ?? "20")
      const start = (pageNum - 1) * pageSize
      await route.fulfill({
        json: { items: filtered.slice(start, start + pageSize).map(poListItemOf), total: filtered.length },
      })
    },
  )

  return { parties, items, warehouses, purchaseOrders }
}

// ============================================================
// NAS 檔案管理（/api/nas/*）
// ============================================================

export interface NasNode {
  name: string
  type: "file" | "directory"
  size?: number | null
  modified?: string | null
  /** 只有檔案有：預覽與下載時回的內容。 */
  content?: string | Buffer
  contentType?: string
  children?: NasNode[]
}

/** 杜撰的目錄樹（公開 repo，不放真實客戶／廠商／專案名）。 */
export const nasTreeFixture: NasNode[] = [
  {
    name: "共用區",
    type: "directory",
    children: [
      {
        name: "甲一機電",
        type: "directory",
        modified: "2026-09-01T09:30:00",
        children: [
          { name: "配置圖.png", type: "file", size: 2048, modified: "2026-09-02T10:15:00", content: ONE_PX_PNG, contentType: "image/png" },
          { name: "說明.md", type: "file", size: 96, modified: "2026-09-03T11:45:00", content: "# 甲一機電\n這是杜撰的測試內容。", contentType: "text/markdown" },
          { name: "手冊.pdf", type: "file", size: 4096, modified: "2026-09-04T08:00:00", content: "%PDF-1.4 測試", contentType: "application/pdf" },
          { name: "模型.dwg", type: "file", size: 8192, modified: "2026-09-05T16:20:00", content: "dwg", contentType: "application/octet-stream" },
        ],
      },
      { name: "乙二運輸", type: "directory", modified: "2026-08-20T13:00:00", children: [] },
      { name: "工作說明.txt", type: "file", size: 32, modified: "2026-08-21T14:05:00", content: "杜撰的純文字內容", contentType: "text/plain" },
    ],
  },
  { name: "備份區", type: "directory", children: [] },
]

/** 每次 mock 都要拿到自己的一份：寫入類端點會直接改這棵樹，共用同一份會讓測試互相污染。 */
function cloneNasTree(nodes: NasNode[]): NasNode[] {
  return nodes.map((n) => ({ ...n, children: n.children ? cloneNasTree(n.children) : undefined }))
}

function findNasNode(tree: NasNode[], path: string): NasNode | null {
  const segs = path.replace(/^\/+/, "").replace(/\/+$/, "").split("/").filter(Boolean)
  let nodes = tree
  let found: NasNode | null = null
  for (const seg of segs) {
    const next = nodes.find((n) => n.name === seg)
    if (!next) return null
    found = next
    nodes = next.children ?? []
  }
  return found
}

/** 照 services/smb.py 的 search_files：回傳的 path **不含 share 名稱**，是相對於搜尋起點所屬 share 的路徑。 */
function searchNasTree(tree: NasNode[], path: string, query: string): { name: string; path: string; type: "file" | "directory" }[] {
  const start = findNasNode(tree, path)
  if (!start) return []
  const segs = path.replace(/^\/+/, "").split("/").filter(Boolean)
  const basePath = segs.slice(1).join("/") // 去掉 share 名稱
  const out: { name: string; path: string; type: "file" | "directory" }[] = []
  const walk = (nodes: NasNode[], prefix: string) => {
    for (const n of nodes) {
      const p = prefix ? `${prefix}/${n.name}` : n.name
      if (n.name.includes(query)) out.push({ name: n.name, path: `/${p}`, type: n.type })
      if (n.children) walk(n.children, p)
    }
  }
  walk(start.children ?? [], basePath)
  return out
}

export interface NasMockControl {
  /** 模擬連線 token 到期（後端 30 分鐘）：之後帶舊 token 的請求都回 401＋X-NAS-Token-Expired。 */
  expireTokens: () => void
  /** 寫入類端點實際收到的內容，供測試比對契約。 */
  requests: { method: string; path: string; body: unknown }[]
}

/**
 * /api/nas/* 全 mock。
 *
 * 契約對照 `api/nas.py`：connect 帳密錯誤回 **200 加 success:false**（不是 401），連不到 NAS 才 503；
 * 缺連線／過期回 401 加 `X-NAS-Required`／`X-NAS-Token-Expired`（同時給後端那兩句 detail，
 * 跨網域讀不到 header 時前端是靠 detail 判斷的）；根目錄只有 `/api/nas/shares` 能列，`browse?path=/` 是 400。
 */
/** 對齊後端 `api/nas.py` 的 `NASConnectionInfo`：六個欄位都要有，時間是沒有時區的 isoformat。 */
export interface NasConnectionFixture {
  token: string
  host: string
  username: string
  created_at?: string
  expires_at?: string
  last_used_at?: string
}

/** 後端給的是 `datetime.now()` 的 isoformat：沒有時區、是伺服器的本地時間，不是 UTC。 */
function localIso(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function fullConnection(c: NasConnectionFixture) {
  // 後端 token 預設 30 分鐘，`get_user_connections` 不會把過期的剔掉，所以測試要能指定 expires_at
  const future = localIso(Date.now() + 30 * 60 * 1000)
  const past = localIso(Date.now() - 60 * 1000)
  return {
    token: c.token,
    host: c.host,
    username: c.username,
    created_at: c.created_at ?? past,
    expires_at: c.expires_at ?? future,
    last_used_at: c.last_used_at ?? past,
  }
}

export async function mockNas(
  page: Page,
  opts: {
    tree?: NasNode[]
    connections?: NasConnectionFixture[]
    unreachableHost?: string
    /** 這個檔名的上傳一律失敗（測多檔上傳中間有人失敗的情況）。 */
    failUploadFor?: string
  } = {},
): Promise<NasMockControl> {
  const tree = cloneNasTree(opts.tree ?? nasTreeFixture)
  const unreachableHost = opts.unreachableHost ?? "unreachable.test.invalid"
  const valid = new Set<string>((opts.connections ?? []).map((c) => c.token))
  const connections = (opts.connections ?? []).map(fullConnection)
  const control: NasMockControl = { expireTokens: () => valid.clear(), requests: [] }
  let seq = 0

  const base = new URL(API)
  const prefix = base.pathname.replace(/\/$/, "")
  const on = (name: string) => (url: URL) => url.origin === base.origin && url.pathname === `${prefix}/api/nas/${name}`

  const tokenOf = (route: Parameters<Parameters<Page["route"]>[1]>[0]) => route.request().headers()["x-nas-token"]

  const authFail = (expired: boolean) => ({
    status: 401,
    headers: expired ? { "X-NAS-Token-Expired": "true" } : { "X-NAS-Required": "true" },
    json: { detail: expired ? "NAS 連線已過期，請重新連線" : "請先連線 NAS" },
  })

  /** 回 null 代表已經回過 401，呼叫端直接 return。 */
  const requireToken = async (route: Parameters<Parameters<Page["route"]>[1]>[0]) => {
    const token = tokenOf(route)
    if (!token) {
      await route.fulfill(authFail(false))
      return false
    }
    if (!valid.has(token)) {
      await route.fulfill(authFail(true))
      return false
    }
    return true
  }

  await page.route(on("connections"), (route) => route.fulfill({ json: { connections } }))

  await page.route(on("connect"), async (route) => {
    const body = route.request().postDataJSON() as { host: string; username: string; password: string }
    if (body.host === unreachableHost) {
      return route.fulfill({ status: 503, json: { detail: `無法連線至 NAS ${body.host}` } })
    }
    if (body.password === "wrong") {
      return route.fulfill({ json: { success: false, token: null, error: "NAS 帳號或密碼錯誤", host: null } })
    }
    seq += 1
    const token = `nas-tok-${seq}`
    valid.add(token)
    connections.push(fullConnection({ token, host: body.host, username: body.username }))
    return route.fulfill({ json: { success: true, token, error: null, host: body.host } })
  })

  await page.route(on("disconnect"), async (route) => {
    const token = tokenOf(route)
    if (token) valid.delete(token)
    connections.length = 0
    return route.fulfill({ json: { success: true } })
  })

  await page.route(on("shares"), async (route) => {
    if (!(await requireToken(route))) return
    return route.fulfill({ json: { shares: tree.map((n) => ({ name: n.name, type: "disk" })) } })
  })

  await page.route(on("browse"), async (route) => {
    if (!(await requireToken(route))) return
    const path = new URL(route.request().url()).searchParams.get("path") ?? "/"
    if (path.replace(/\//g, "") === "") return route.fulfill({ status: 400, json: { detail: "請指定共享資料夾名稱" } })
    const node = findNasNode(tree, path)
    if (!node || node.type !== "directory") return route.fulfill({ status: 404, json: { detail: "檔案不存在" } })
    return route.fulfill({
      json: {
        path,
        items: (node.children ?? []).map((c) => ({
          name: c.name,
          type: c.type,
          size: c.type === "directory" ? null : (c.size ?? 0),
          modified: c.modified ?? null,
        })),
      },
    })
  })

  await page.route(on("search"), async (route) => {
    if (!(await requireToken(route))) return
    const params = new URL(route.request().url()).searchParams
    const path = params.get("path") ?? "/"
    const query = params.get("query") ?? ""
    const results = searchNasTree(tree, path, query)
    return route.fulfill({ json: { query, path, results, total: results.length } })
  })

  const serveFile = async (route: Parameters<Parameters<Page["route"]>[1]>[0], asDownload: boolean) => {
    if (!(await requireToken(route))) return
    const path = new URL(route.request().url()).searchParams.get("path") ?? ""
    const node = findNasNode(tree, path)
    if (!node || node.type !== "file") return route.fulfill({ status: 404, json: { detail: "檔案不存在" } })
    const headers: Record<string, string> = {}
    if (asDownload) headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(node.name)}`
    return route.fulfill({
      status: 200,
      contentType: node.contentType ?? "application/octet-stream",
      headers,
      body: node.content instanceof Buffer ? node.content : String(node.content ?? ""),
    })
  }

  await page.route(on("file"), (route) => serveFile(route, false))
  await page.route(on("download"), (route) => serveFile(route, true))

  // ---- 寫入類 ----

  const parentOf = (path: string) => {
    const segs = path.replace(/^\/+/, "").split("/").filter(Boolean)
    const name = segs.pop() ?? ""
    const parent = findNasNode(tree, `/${segs.join("/")}`)
    const siblings = segs.length === 0 ? tree : (parent?.children ?? null)
    return { name, siblings }
  }

  await page.route(on("upload"), async (route) => {
    if (!(await requireToken(route))) return
    // multipart：path 是目標資料夾，file 是檔案本身
    const body = route.request().postData() ?? ""
    const dir = body.match(/name="path"\r?\n\r?\n([^\r\n]*)/)?.[1] ?? ""
    const filename = body.match(/filename="([^"]*)"/)?.[1] ?? "unnamed"
    control.requests.push({ method: "POST", path: "/api/nas/upload", body: { path: dir, filename } })
    if (opts.failUploadFor && filename === opts.failUploadFor) {
      return route.fulfill({ status: 403, json: { detail: "無權限上傳檔案" } })
    }
    const node = findNasNode(tree, dir)
    if (!node || node.type !== "directory") return route.fulfill({ status: 404, json: { detail: "檔案不存在" } })
    node.children = node.children ?? []
    node.children.push({ name: filename, type: "file", size: 12, modified: "2026-09-12T09:00:00", content: "uploaded", contentType: "text/plain" })
    return route.fulfill({ json: { success: true, message: "上傳成功" } })
  })

  await page.route(on("mkdir"), async (route) => {
    if (!(await requireToken(route))) return
    const body = route.request().postDataJSON() as { path: string }
    control.requests.push({ method: "POST", path: "/api/nas/mkdir", body })
    const { name, siblings } = parentOf(body.path)
    if (!siblings) return route.fulfill({ status: 404, json: { detail: "檔案不存在" } })
    if (siblings.some((n) => n.name === name)) return route.fulfill({ status: 409, json: { detail: "資料夾已存在" } })
    siblings.push({ name, type: "directory", modified: "2026-09-12T09:00:00", children: [] })
    return route.fulfill({ json: { success: true, message: "建立成功" } })
  })

  await page.route(on("rename"), async (route) => {
    if (!(await requireToken(route))) return
    const body = route.request().postDataJSON() as { path: string; new_name: string }
    control.requests.push({ method: "PATCH", path: "/api/nas/rename", body })
    const { name, siblings } = parentOf(body.path)
    const node = siblings?.find((n) => n.name === name)
    if (!siblings || !node) return route.fulfill({ status: 404, json: { detail: "檔案不存在" } })
    if (siblings.some((n) => n.name === body.new_name)) return route.fulfill({ status: 409, json: { detail: "目標名稱已存在" } })
    node.name = body.new_name
    return route.fulfill({ json: { success: true, message: "重命名成功" } })
  })

  // DELETE /api/nas/file 與上面的 GET 同一條路徑：後註冊的先比對，方法不合就 fallback 給 GET 那支。
  await page.route(
    (url) => url.origin === base.origin && url.pathname === `${prefix}/api/nas/file`,
    async (route) => {
      if (route.request().method() !== "DELETE") return route.fallback()
      if (!(await requireToken(route))) return
      const body = route.request().postDataJSON() as { path: string; recursive: boolean }
      control.requests.push({ method: "DELETE", path: "/api/nas/file", body })
      const { name, siblings } = parentOf(body.path)
      const idx = siblings?.findIndex((n) => n.name === name) ?? -1
      if (!siblings || idx === -1) return route.fulfill({ status: 404, json: { detail: "檔案或資料夾不存在" } })
      const node = siblings[idx]
      if (node.type === "directory" && (node.children?.length ?? 0) > 0 && !body.recursive) {
        return route.fulfill({ status: 400, json: { detail: "資料夾不是空的，請使用遞迴刪除" } })
      }
      siblings.splice(idx, 1)
      return route.fulfill({ json: { success: true, message: "刪除成功" } })
    },
  )

  // 分享連結（nas_file）：resource_id 要是後端讀得到的掛載點路徑
  await page.route(
    (url) => url.origin === base.origin && url.pathname === `${prefix}/api/share`,
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback()
      const body = route.request().postDataJSON() as { resource_type: string; resource_id: string }
      control.requests.push({ method: "POST", path: "/api/share", body })
      if (!body.resource_id.startsWith("/mnt/")) {
        return route.fulfill({ status: 403, json: { detail: `無效的路徑：${body.resource_id}` } })
      }
      return route.fulfill({
        json: {
          token: "nas-share-1",
          url: "/s/nas-share-1",
          full_url: "https://ching-tech.ddns.net/ctos/s/nas-share-1",
          resource_type: body.resource_type,
          resource_id: body.resource_id,
          resource_title: body.resource_id.split("/").pop() ?? "",
        },
      })
    },
  )

  return control
}

// ============================================================
// 記憶管理（欄位逐一對後端 models/linebot.py 296–328 的 MemoryResponse）
// ============================================================

export interface MemoryFixture {
  id: string
  title: string
  content: string
  is_active: boolean
  created_at: string
  updated_at: string
  /** 建立者的 bot_users.id；個人記憶沒有這一欄（services/bot_line/memory.py 98–123），一律 null。 */
  created_by: string | null
  created_by_name: string | null
}

/** 掛在哪個對象底下：key 是 bot_groups.id／bot_users.id，對得上 botGroupFixtures／botUserFixtures。 */
export interface MemoryStoreFixture {
  group: Record<string, MemoryFixture[]>
  user: Record<string, MemoryFixture[]>
}

// grp-1 兩筆（一筆啟用、一筆停用且內容很長，用來驗折疊），grp-2 沒有記憶；
// usr-1 一筆，usr-2 沒有記憶。內容全是杜撰的。
export const memoryFixtures: MemoryStoreFixture = {
  group: {
    "grp-1": [
      {
        id: "mem-1", title: "出貨前先報數量", content: "要出貨前先在群組回報品項與數量，等對方確認再安排車。",
        is_active: true, created_at: "2026-09-01T09:00:00", updated_at: "2026-09-01T09:00:00",
        created_by: "usr-1", created_by_name: "王小明",
      },
      {
        id: "mem-2", title: "報價一律附工期",
        content: "報價回覆一律附上預計工期與交期，工期以工作天計算，不含例假日；若對方只問單價，也要主動補上工期，避免後續對交期認知不一致。標準品照公告價回，非標準品要先確認規格再報，規格沒講清楚就先問清楚，不要自己假設。金額超過十萬的案子，回覆時加一句請對方確認付款條件；需要現場勘查的，先問可以配合的時段，不要直接約時間。對方催進度時先講目前做到哪一段、下一段預計什麼時候好，不要只回「處理中」。這一條是內部規定，回覆時不必說明出處。",
        is_active: false, created_at: "2026-08-20T09:00:00", updated_at: "2026-08-25T09:00:00",
        created_by: null, created_by_name: null,
      },
    ],
    "grp-2": [],
  },
  user: {
    "usr-1": [
      {
        id: "mem-3", title: "稱呼", content: "叫我小明就好，不用加職稱。",
        is_active: true, created_at: "2026-09-02T09:00:00", updated_at: "2026-09-02T09:00:00",
        created_by: null, created_by_name: null,
      },
    ],
    "usr-2": [],
  },
}

function cloneMemoryStore(store: MemoryStoreFixture): MemoryStoreFixture {
  const copy: MemoryStoreFixture = { group: {}, user: {} }
  for (const kind of ["group", "user"] as const) {
    for (const [id, list] of Object.entries(store[kind])) copy[kind][id] = list.map((m) => ({ ...m }))
  }
  return copy
}

/**
 * 攔記憶這一組：`GET/POST /api/bot/groups/{id}/memories`、`GET/POST /api/bot/users/{id}/memories`、
 * `PUT/DELETE /api/bot/memories/{id}`。對象不在 `knownGroupIds`／`knownUserIds` 裡就照後端回
 * 404「Group not found」／「User not found」（api/linebot_router.py 1026–1029、1074–1076）；
 * 記憶 id 找不到是 404「Memory not found」（同檔 1122、1136）。
 *
 * 路徑和 `mockBot` 不會互吃：那邊的群組明細與使用者封鎖路由都排除了帶子路徑的 URL。
 */
export async function mockMemory(
  page: Page,
  opts: {
    memories?: MemoryStoreFixture
    knownGroupIds?: string[]
    knownUserIds?: string[]
    /** 建立群組記憶時後端記下的建立者（api/linebot_router.py 1050–1052）。 */
    createdBy?: { id: string; name: string } | null
    /** 第一次 PUT 回 500，之後照常成功；用來驗錯誤訊息。 */
    failUpdateOnce?: boolean
  } = {},
) {
  const store = cloneMemoryStore(opts.memories ?? memoryFixtures)
  const knownGroupIds = opts.knownGroupIds ?? botGroupFixtures.map((g) => g.id)
  const knownUserIds = opts.knownUserIds ?? botUserFixtures.map((u) => u.id)
  const createdBy = opts.createdBy === undefined ? { id: "usr-1", name: "王小明" } : opts.createdBy
  let updateFailuresLeft = opts.failUpdateOnce ? 1 : 0
  let nextId = 100

  const base = new URL(API)
  const prefix = base.pathname.replace(/\/$/, "")
  const sameOrigin = (url: URL) => url.origin === base.origin

  function listOf(kind: "group" | "user", id: string): MemoryFixture[] {
    if (!store[kind][id]) store[kind][id] = []
    return store[kind][id]
  }

  function findMemory(id: string): { list: MemoryFixture[]; index: number } | null {
    for (const kind of ["group", "user"] as const) {
      for (const list of Object.values(store[kind])) {
        const index = list.findIndex((m) => m.id === id)
        if (index !== -1) return { list, index }
      }
    }
    return null
  }

  for (const kind of ["group", "user"] as const) {
    const segment = kind === "group" ? "groups" : "users"
    const known = kind === "group" ? knownGroupIds : knownUserIds
    const notFound = kind === "group" ? "Group not found" : "User not found"
    await page.route(
      (url) => {
        if (!sameOrigin(url)) return false
        const p = `${prefix}/api/bot/${segment}/`
        if (!url.pathname.startsWith(p)) return false
        const rest = url.pathname.slice(p.length).split("/")
        return rest.length === 2 && rest[1] === "memories"
      },
      async (route) => {
        const segs = new URL(route.request().url()).pathname.split("/")
        const targetId = segs[segs.length - 2]
        if (!known.includes(targetId)) return route.fulfill({ status: 404, json: { detail: notFound } })
        const list = listOf(kind, targetId)
        if (route.request().method() === "POST") {
          const body = route.request().postDataJSON() as { title: string; content: string }
          const created: MemoryFixture = {
            id: `mem-${nextId++}`,
            title: body.title,
            content: body.content,
            is_active: true,
            created_at: "2026-09-12T09:00:00",
            updated_at: "2026-09-12T09:00:00",
            created_by: kind === "group" ? (createdBy?.id ?? null) : null,
            created_by_name: kind === "group" ? (createdBy?.name ?? null) : null,
          }
          // 後端 ORDER BY created_at DESC，新的排最前面。
          list.unshift(created)
          return route.fulfill({ json: created })
        }
        return route.fulfill({ json: { items: list, total: list.length } })
      },
    )
  }

  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const p = `${prefix}/api/bot/memories/`
      if (!url.pathname.startsWith(p)) return false
      const rest = url.pathname.slice(p.length)
      return rest.length > 0 && !rest.includes("/")
    },
    async (route) => {
      const method = route.request().method()
      const id = new URL(route.request().url()).pathname.split("/").pop()!
      if (method === "PUT" && updateFailuresLeft > 0) {
        updateFailuresLeft -= 1
        return route.fulfill({ status: 500, json: { detail: "資料庫暫時連不上" } })
      }
      const found = findMemory(id)
      if (!found) return route.fulfill({ status: 404, json: { detail: "Memory not found" } })
      if (method === "DELETE") {
        found.list.splice(found.index, 1)
        return route.fulfill({ json: { status: "ok", message: "記憶已刪除" } })
      }
      if (method === "PUT") {
        const body = route.request().postDataJSON() as Partial<MemoryFixture>
        const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined))
        found.list[found.index] = { ...found.list[found.index], ...patch, updated_at: "2026-09-12T10:00:00" }
        return route.fulfill({ json: found.list[found.index] })
      }
      return route.fallback()
    },
  )

  return store
}

/**
 * `ShareLinkResponse`（ching-tech-os `models/share.py` 22–37）。
 * 清單（`services/share.py` 549–600、602–647）每一列都帶滿這些欄位，
 * `password` 只有建立時才回（546），所以清單 fixture 沒有它。
 */
export interface ShareLinkFixture {
  token: string
  url: string
  full_url: string
  resource_type: string
  resource_id: string
  resource_title: string
  expires_at: string | null
  access_count: number
  created_at: string
  created_by: string | null
  is_expired: boolean
  has_password: boolean
}

/** 登入者（yazelin）自己的連結。三筆各驗一件事：永久、有到期、已過期。 */
export const shareLinkFixtures: ShareLinkFixture[] = [
  {
    token: "sh-kb-001", url: "/s/sh-kb-001", full_url: "https://ctos.test.invalid/s/sh-kb-001",
    resource_type: "knowledge", resource_id: "kb-001", resource_title: "泵浦保養 SOP",
    expires_at: null, access_count: 12, created_at: "2026-09-10T02:00:00Z",
    created_by: "yazelin", is_expired: false, has_password: false,
  },
  {
    token: "sh-nas-002", url: "/s/sh-nas-002", full_url: "https://ctos.test.invalid/s/sh-nas-002",
    // nas_file 的 resource_title 後端只給檔名（`services/share.py` 423–426），路徑在 resource_id。
    resource_type: "nas_file", resource_id: "/mnt/nas/projects/甲一機電/配電圖.pdf", resource_title: "配電圖.pdf",
    expires_at: "2026-12-31T02:00:00Z", access_count: 0, created_at: "2026-09-11T06:00:00Z",
    created_by: "yazelin", is_expired: false, has_password: true,
  },
  {
    token: "sh-old-003", url: "/s/sh-old-003", full_url: "https://ctos.test.invalid/s/sh-old-003",
    resource_type: "knowledge", resource_id: "kb-002", resource_title: "PLC 韌體升級紀錄",
    expires_at: "2026-08-01T02:00:00Z", access_count: 5, created_at: "2026-07-31T02:00:00Z",
    created_by: "yazelin", is_expired: true, has_password: false,
  },
]

/**
 * 別人的連結，只有管理員 `view=all` 才看得到。
 * `resource_title` 是「未知資源」：後端的 `get_resource_title` 對 project 與
 * project_attachment 沒有實作，一律回這四個字（`services/share.py` 430–431）。
 */
export const otherShareLinkFixtures: ShareLinkFixture[] = [
  {
    token: "sh-proj-004", url: "/s/sh-proj-004", full_url: "https://ctos.test.invalid/s/sh-proj-004",
    resource_type: "project", resource_id: "7", resource_title: "未知資源",
    expires_at: null, access_count: 1, created_at: "2026-09-09T02:00:00Z",
    created_by: "shulin", is_expired: false, has_password: false,
  },
]

/**
 * `GET /api/share?view=`（`api/share.py` 135–166）與 `DELETE /api/share/{token}`（169–199）。
 *
 * `view=all` 只有管理員有效：非管理員送 all，後端一樣走 `list_my_links`（155–159），
 * 這支 mock 照抄這條規則。撤銷成功是 204 無內容（171）。
 */
export async function mockShares(
  page: Page,
  opts: {
    links?: ShareLinkFixture[]
    /** 別人建立的連結（管理員 `view=all` 才會併進來）。 */
    othersLinks?: ShareLinkFixture[]
    /** 回應裡的 `is_admin`（`api/share.py` 161 由 session.role 決定）。 */
    isAdmin?: boolean
    /** 這個 token 的 DELETE 回 403「您沒有權限撤銷此連結」（`services/share.py` 668–670）。 */
    denyRevokeToken?: string
  } = {},
) {
  const mine = opts.links ?? shareLinkFixtures.map((l) => ({ ...l }))
  const others = opts.othersLinks ?? otherShareLinkFixtures.map((l) => ({ ...l }))
  const isAdmin = opts.isAdmin ?? false

  await page.route(`${API}/api/share*`, async (route) => {
    // 建立（POST）不歸這一頁管，留給別的 mock（例如 mockKb）或 trapUnmockedApi。
    if (route.request().method() !== "GET") return route.fallback()
    const view = new URL(route.request().url()).searchParams.get("view")
    const links = view === "all" && isAdmin ? [...mine, ...others] : mine
    await route.fulfill({ json: { links, is_admin: isAdmin } })
  })

  await page.route(`${API}/api/share/*`, async (route) => {
    const raw = new URL(route.request().url()).pathname.split("/").pop() ?? ""
    const token = decodeURIComponent(raw)
    if (opts.denyRevokeToken === token) {
      return route.fulfill({ status: 403, json: { detail: "您沒有權限撤銷此連結" } })
    }
    const list = [mine, others].find((l) => l.some((x) => x.token === token))
    if (!list) return route.fulfill({ status: 404, json: { detail: "連結不存在" } })
    list.splice(list.findIndex((x) => x.token === token), 1)
    await route.fulfill({ status: 204 })
  })
}

/** 一般使用者＋`share-manager` 開放（後端預設關閉，`services/permissions.py` 177）。 */
export const shareUserFixture = {
  ...userFixture,
  permissions: {
    ...userFixture.permissions,
    apps: { ...userFixture.permissions.apps, "share-manager": true },
  },
}

/** `MessageResponse`（ching-tech-os models/message.py 42–55）。 */
export interface MessageFixture {
  id: number
  created_at: string
  severity: "debug" | "info" | "warning" | "error" | "critical"
  source: "system" | "security" | "app" | "user"
  category: string | null
  title: string
  content: string | null
  metadata: Record<string, unknown> | null
  user_id: number | null
  session_id: string | null
  is_read: boolean
}

/** 全部杜撰，沒有真實人名、群組名或廠商名。 */
export const messageFixtures: MessageFixture[] = [
  {
    id: 101, created_at: "2026-09-12T01:30:00Z", severity: "critical", source: "system",
    category: "storage", title: "資料庫磁碟空間低於 5%",
    content: "資料分割區剩餘 4.2%。\n請盡快清理或擴充。", metadata: { device: "/dev/sda2", free_percent: 4.2 },
    user_id: null, session_id: null, is_read: false,
  },
  {
    id: 102, created_at: "2026-09-12T01:00:00Z", severity: "error", source: "app",
    category: "sync", title: "物料同步作業失敗",
    content: "同步在第 3 批中斷，錯誤代碼 E_TIMEOUT。", metadata: { batch: 3, code: "E_TIMEOUT" },
    user_id: null, session_id: null, is_read: false,
  },
  {
    id: 103, created_at: "2026-09-12T00:40:00Z", severity: "warning", source: "security",
    category: "login", title: "偵測到異常登入嘗試",
    content: "同一帳號在 10 分鐘內失敗 6 次。", metadata: { attempts: 6 },
    user_id: 2, session_id: "sess-aaa", is_read: false,
  },
  {
    id: 104, created_at: "2026-09-11T23:10:00Z", severity: "info", source: "security",
    category: "login", title: "使用者登入成功",
    content: "由內部網段登入。", metadata: null,
    user_id: 2, session_id: "sess-bbb", is_read: false,
  },
  {
    id: 105, created_at: "2026-09-11T22:00:00Z", severity: "info", source: "user",
    category: "reminder", title: "有一張採購單待驗收",
    content: null, metadata: null,
    user_id: 2, session_id: null, is_read: true,
  },
  {
    id: 106, created_at: "2026-09-10T09:00:00Z", severity: "debug", source: "system",
    category: "startup", title: "服務啟動完成",
    content: "耗時 3.1 秒。", metadata: { seconds: 3.1 },
    user_id: null, session_id: null, is_read: true,
  },
  {
    id: 107, created_at: "2026-09-09T08:30:00Z", severity: "warning", source: "app",
    category: "quota", title: "知識庫附件容量已達八成",
    content: null, metadata: null,
    user_id: null, session_id: null, is_read: true,
  },
]

/** 產 n 筆連號訊息，用來驗分頁；奇數筆未讀。 */
export function makeMessages(n: number): MessageFixture[] {
  const severities: MessageFixture["severity"][] = ["debug", "info", "warning", "error", "critical"]
  const sources: MessageFixture["source"][] = ["system", "security", "app", "user"]
  return Array.from({ length: n }, (_, i) => {
    const num = i + 1
    return {
      id: 1000 + num,
      created_at: new Date(Date.UTC(2026, 8, 12, 0, 0, 0) - num * 60_000).toISOString(),
      severity: severities[i % severities.length],
      source: sources[i % sources.length],
      category: "batch",
      title: `批次訊息 ${String(num).padStart(3, "0")}`,
      content: `第 ${num} 則`,
      metadata: null,
      user_id: null,
      session_id: null,
      is_read: num % 2 === 0,
    }
  })
}

function messageListItem(m: MessageFixture) {
  const { id, created_at, severity, source, category, title, is_read } = m
  return { id, created_at, severity, source, category, title, is_read }
}

/** 照 ching-tech-os services/message.py 109–212 的 search_messages 做同樣的篩選。 */
function filterMessages(all: MessageFixture[], params: URLSearchParams): MessageFixture[] {
  const severities = params.getAll("severity")
  const sources = params.getAll("source")
  const category = params.get("category")
  const search = params.get("search")
  const isRead = params.get("is_read")
  const startDate = params.get("start_date")
  const endDate = params.get("end_date")
  return all.filter((m) => {
    if (severities.length > 0 && !severities.includes(m.severity)) return false
    if (sources.length > 0 && !sources.includes(m.source)) return false
    if (category && m.category !== category) return false
    if (isRead !== null && m.is_read !== (isRead === "true")) return false
    if (startDate && new Date(m.created_at) < new Date(startDate)) return false
    if (endDate && new Date(m.created_at) > new Date(endDate)) return false
    if (search) {
      const needle = search.toLowerCase()
      const hay = `${m.title}\n${m.content ?? ""}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })
}

/**
 * 訊息中心的四支端點（ching-tech-os api/messages.py 29–146）。未讀數由 fixture 現況算，
 * 所以標已讀之後鈴鐺的數字會跟著掉。註冊在 `mockApi` 之後才會蓋掉它的預設 unread-count。
 */
export async function mockMessages(page: Page, opts: { messages?: MessageFixture[] } = {}) {
  const messages: MessageFixture[] = (opts.messages ?? messageFixtures).map((m) => ({ ...m }))
  const base = new URL(API)
  const prefix = base.pathname.replace(/\/$/, "")
  const sameOrigin = (url: URL) => url.origin === base.origin

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/messages/unread-count`,
    async (route) => route.fulfill({ json: { count: messages.filter((m) => !m.is_read).length } }),
  )

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/messages/mark-read`,
    async (route) => {
      const body = route.request().postDataJSON() as { ids?: number[]; all?: boolean }
      if (!body.ids && !body.all) {
        return route.fulfill({ status: 400, json: { detail: "必須提供 ids 或設定 all=true" } })
      }
      const targets = body.all ? messages : messages.filter((m) => (body.ids ?? []).includes(m.id))
      let marked = 0
      for (const m of targets) {
        if (!m.is_read) { m.is_read = true; marked += 1 }
      }
      await route.fulfill({ json: { marked_count: marked } })
    },
  )

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/messages`,
    async (route) => {
      const params = new URL(route.request().url()).searchParams
      const filtered = filterMessages(messages, params)
      const pageNum = Number(params.get("page") ?? "1")
      const limit = Number(params.get("limit") ?? "20")
      const start = (pageNum - 1) * limit
      await route.fulfill({
        json: {
          items: filtered.slice(start, start + limit).map(messageListItem),
          total: filtered.length,
          page: pageNum,
          limit,
          total_pages: filtered.length > 0 ? Math.ceil(filtered.length / limit) : 1,
        },
      })
    },
  )

  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/messages/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const rest = url.pathname.slice(detailPrefix.length)
      return /^\d+$/.test(rest)
    },
    async (route) => {
      const id = Number(new URL(route.request().url()).pathname.split("/").pop())
      const found = messages.find((m) => m.id === id)
      if (!found) return route.fulfill({ status: 404, json: { detail: `訊息 ${id} 不存在` } })
      await route.fulfill({ json: { ...found } })
    },
  )

  return { messages }
}

// ============================================================
// Prompt 編輯器與 Agent 設定（/api/ai/prompts、/api/ai/agents、/api/ai/test、/api/ai/providers/status）
// 欄位對照 ching-tech-os `models/ai.py` 98–216、328–342 與 `services/ai_router.py` 310–322。
// ============================================================

/** `AiPromptResponse`（models/ai.py 119–129）。 */
export interface AiPromptFixture {
  id: string
  name: string
  display_name: string | null
  category: string | null
  content: string
  description: string | null
  variables: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

/** `AiAgentResponse`（models/ai.py 183–197）扣掉 `system_prompt`（由 mock 依 `system_prompt_id` 組出來）。 */
export interface AiAgentDetailFixture {
  id: string
  name: string
  display_name: string | null
  description: string | null
  model: string
  system_prompt_id: string | null
  is_active: boolean
  tools: string[] | null
  settings: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

/** 一般使用者，兩支 app 都開（後端預設是 False，要管理員開）。 */
export const aiManagementUserFixture = {
  ...userFixture,
  permissions: {
    ...userFixture.permissions,
    apps: { ...userFixture.permissions.apps, "prompt-editor": true, "agent-settings": true, "ai-log": true },
  },
}

export const aiPromptFixtures: AiPromptFixture[] = [
  {
    id: "pr-1", name: "web-chat-default", display_name: "預設對話助手", category: "system",
    content: "你是內部系統的助理，回答時先講結論再補理由。",
    description: "網頁對話的預設提示詞",
    variables: { user_name: "使用者顯示名稱", today: "今天日期" },
    created_at: "2026-08-01T09:00:00", updated_at: "2026-09-01T09:00:00",
  },
  {
    id: "pr-2", name: "linebot-group", display_name: "群組助理 Prompt", category: "linebot",
    content: "你在群組裡回話，一次回一件事。",
    description: "群組 bot 的系統提示詞",
    variables: null,
    created_at: "2026-08-02T09:00:00", updated_at: "2026-09-02T09:00:00",
  },
  {
    id: "pr-3", name: "summarizer", display_name: "對話摘要助手", category: "task",
    content: "把對話濃縮成三點。",
    description: null,
    variables: null,
    created_at: "2026-08-03T09:00:00", updated_at: "2026-09-03T09:00:00",
  },
]

export const aiAgentDetailFixtures: AiAgentDetailFixture[] = [
  {
    id: "agt-1", name: "web-chat", display_name: "網頁對話", description: "網頁端的通用助理",
    model: "claude-sonnet", system_prompt_id: "pr-1", is_active: true,
    tools: ["WebSearch", "Read"], settings: { temperature: 0.2 },
    created_at: "2026-08-01T09:00:00", updated_at: "2026-09-01T09:00:00",
  },
  {
    id: "agt-2", name: "linebot-group", display_name: "群組助理", description: null,
    model: "claude-haiku", system_prompt_id: "pr-2", is_active: true,
    tools: null, settings: null,
    created_at: "2026-08-02T09:00:00", updated_at: "2026-09-02T09:00:00",
  },
  {
    id: "agt-3", name: "night-report", display_name: "夜間報表", description: "排程用，平常關著",
    model: "claude-haiku", system_prompt_id: null, is_active: false,
    tools: null, settings: null,
    created_at: "2026-08-03T09:00:00", updated_at: "2026-09-03T09:00:00",
  },
]

/** `services/ai_router.py` 310–322 的 `provider_status()`。 */
export const providerStatusFixture = {
  mode: "auto",
  providers: {
    claude: { ready: true },
    codex: { ready: false, adapter_binary: true, codex_binary: false, circuit: { state: "closed", consecutive_failures: 0 } },
  },
  usage: {
    state: "fresh", utilization: 0.42, five_hour: 0.1, seven_day: 0.42,
    fetched_at: "2026-09-12T01:00:00+00:00", last_attempt_at: "2026-09-12T01:00:00+00:00",
    last_error: null, consecutive_failures: 0,
  },
}

export interface AiManagementRequest {
  method: string
  path: string
  body: unknown
}

export async function mockAiManagement(
  page: Page,
  opts: {
    prompts?: AiPromptFixture[]
    agents?: AiAgentDetailFixture[]
    /** `POST /api/ai/test` 的回應（`AiTestResponse`）。預設是成功配 log_id。 */
    testResponse?: { success: boolean; response: string | null; error: string | null; duration_ms: number | null; log_id: string | null }
    /** providers/status 回 403（非管理員打到時後端的行為）。 */
    providerStatusForbidden?: boolean
    /** 寫入類請求一律回 403，模擬有讀權限沒寫權限。 */
    writeForbidden?: string
  } = {},
) {
  const prompts: AiPromptFixture[] = (opts.prompts ?? aiPromptFixtures).map((p) => ({ ...p }))
  const agents: AiAgentDetailFixture[] = (opts.agents ?? aiAgentDetailFixtures).map((a) => ({ ...a }))
  const requests: AiManagementRequest[] = []
  const base = new URL(API)
  const prefix = base.pathname.replace(/\/$/, "")
  const sameOrigin = (url: URL) => url.origin === base.origin
  let nextId = 100

  function record(route: Parameters<Parameters<Page["route"]>[1]>[0]) {
    const req = route.request()
    let body: unknown = null
    try {
      body = req.postDataJSON()
    } catch { /* GET／DELETE 沒有 body */ }
    requests.push({ method: req.method(), path: new URL(req.url()).pathname, body })
  }

  /** 寫入類端點共用的 403 分支（`require_app_permission` 擋下來時後端回的形狀）。 */
  function forbidden() {
    return { status: 403, json: { detail: opts.writeForbidden } }
  }

  function promptListItem(p: AiPromptFixture) {
    const { id, name, display_name, category, description, updated_at } = p
    return { id, name, display_name, category, description, updated_at }
  }

  function agentListItem(a: AiAgentDetailFixture) {
    const { id, name, display_name, model, is_active, tools, updated_at } = a
    return { id, name, display_name, model, is_active, tools, updated_at }
  }

  function agentDetail(a: AiAgentDetailFixture) {
    const prompt = a.system_prompt_id ? (prompts.find((p) => p.id === a.system_prompt_id) ?? null) : null
    return { ...a, system_prompt: prompt }
  }

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/ai/providers/status`,
    async (route) => {
      record(route)
      if (opts.providerStatusForbidden) return route.fulfill({ status: 403, json: { detail: "需要管理員權限" } })
      await route.fulfill({ json: providerStatusFixture })
    },
  )

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/ai/test`,
    async (route) => {
      record(route)
      if (opts.writeForbidden) return route.fulfill(forbidden())
      await route.fulfill({
        json: opts.testResponse ?? { success: true, response: "1+1 等於 2。", error: null, duration_ms: 1234, log_id: "log-01" },
      })
    },
  )

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/ai/prompts`,
    async (route) => {
      record(route)
      if (route.request().method() === "POST") {
        if (opts.writeForbidden) return route.fulfill(forbidden())
        const body = route.request().postDataJSON() as Partial<AiPromptFixture> & { name: string; content: string }
        if (prompts.some((p) => p.name === body.name)) {
          return route.fulfill({ status: 400, json: { detail: `Prompt 名稱 '${body.name}' 已存在` } })
        }
        const created: AiPromptFixture = {
          id: `pr-${nextId++}`,
          name: body.name,
          display_name: body.display_name ?? null,
          category: body.category ?? null,
          content: body.content,
          description: body.description ?? null,
          variables: body.variables ?? null,
          created_at: "2026-09-12T02:00:00",
          updated_at: "2026-09-12T02:00:00",
        }
        prompts.unshift(created)
        return route.fulfill({ json: created })
      }
      const category = new URL(route.request().url()).searchParams.get("category")
      const items = (category ? prompts.filter((p) => p.category === category) : prompts).map(promptListItem)
      await route.fulfill({ json: { items, total: items.length } })
    },
  )

  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/ai/prompts/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const rest = url.pathname.slice(detailPrefix.length)
      return rest.length > 0 && !rest.includes("/")
    },
    async (route) => {
      record(route)
      const id = new URL(route.request().url()).pathname.split("/").pop()!
      const index = prompts.findIndex((p) => p.id === id)
      const method = route.request().method()
      if (method === "GET") {
        if (index === -1) return route.fulfill({ status: 404, json: { detail: "Prompt 不存在" } })
        return route.fulfill({ json: prompts[index] })
      }
      if (opts.writeForbidden) return route.fulfill(forbidden())
      if (index === -1) return route.fulfill({ status: 404, json: { detail: "Prompt 不存在" } })
      if (method === "PUT") {
        const patch = route.request().postDataJSON() as Partial<AiPromptFixture>
        prompts[index] = { ...prompts[index], ...patch, updated_at: "2026-09-12T03:00:00" }
        return route.fulfill({ json: prompts[index] })
      }
      // DELETE：被 agent 引用時後端回 400
      if (agents.some((a) => a.system_prompt_id === id)) {
        return route.fulfill({ status: 400, json: { detail: "此 Prompt 正被 Agent 使用，無法刪除" } })
      }
      prompts.splice(index, 1)
      await route.fulfill({ json: { success: true } })
    },
  )

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/ai/agents`,
    async (route) => {
      record(route)
      if (route.request().method() === "POST") {
        if (opts.writeForbidden) return route.fulfill(forbidden())
        const body = route.request().postDataJSON() as Partial<AiAgentDetailFixture> & { name: string; model: string }
        if (agents.some((a) => a.name === body.name)) {
          return route.fulfill({ status: 400, json: { detail: `Agent 名稱 '${body.name}' 已存在` } })
        }
        const created: AiAgentDetailFixture = {
          id: `agt-${nextId++}`,
          name: body.name,
          display_name: body.display_name ?? null,
          description: body.description ?? null,
          model: body.model,
          system_prompt_id: body.system_prompt_id ?? null,
          is_active: body.is_active ?? true,
          tools: body.tools ?? null,
          settings: body.settings ?? null,
          created_at: "2026-09-12T02:00:00",
          updated_at: "2026-09-12T02:00:00",
        }
        agents.unshift(created)
        return route.fulfill({ json: agentDetail(created) })
      }
      const items = agents.map(agentListItem)
      await route.fulfill({ json: { items, total: items.length } })
    },
  )

  await page.route(
    (url) => {
      if (!sameOrigin(url)) return false
      const detailPrefix = `${prefix}/api/ai/agents/`
      if (!url.pathname.startsWith(detailPrefix)) return false
      const rest = url.pathname.slice(detailPrefix.length)
      return rest.length > 0 && !rest.startsWith("by-name/")
    },
    async (route) => {
      record(route)
      const id = new URL(route.request().url()).pathname.split("/").pop()!
      const index = agents.findIndex((a) => a.id === id)
      const method = route.request().method()
      if (method === "GET") {
        if (index === -1) return route.fulfill({ status: 404, json: { detail: "Agent 不存在" } })
        return route.fulfill({ json: agentDetail(agents[index]) })
      }
      if (opts.writeForbidden) return route.fulfill(forbidden())
      if (index === -1) return route.fulfill({ status: 404, json: { detail: "Agent 不存在" } })
      if (method === "PUT") {
        const patch = route.request().postDataJSON() as Partial<AiAgentDetailFixture>
        agents[index] = { ...agents[index], ...patch, updated_at: "2026-09-12T03:00:00" }
        return route.fulfill({ json: agentDetail(agents[index]) })
      }
      agents.splice(index, 1)
      await route.fulfill({ json: { success: true } })
    },
  )

  await page.route(
    (url) => sameOrigin(url) && url.pathname.startsWith(`${prefix}/api/ai/agents/by-name/`),
    async (route) => {
      record(route)
      const name = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop()!)
      const found = agents.find((a) => a.name === name)
      if (!found) return route.fulfill({ status: 404, json: { detail: "Agent 不存在" } })
      await route.fulfill({ json: agentDetail(found) })
    },
  )

  return { prompts, agents, requests }
}

/** `ScheduledTaskResponse`（ching-tech-os `models/scheduled_task.py` 107–124）。 */
export interface ScheduledTaskFixture {
  id: string
  name: string
  description: string | null
  trigger_type: "cron" | "interval"
  trigger_config: Record<string, string | number>
  executor_type: "agent" | "skill_script"
  executor_config: Record<string, unknown>
  is_enabled: boolean
  created_by: number | null
  last_run_at: string | null
  next_run_at: string | null
  last_run_success: boolean | null
  last_run_error: string | null
  consecutive_failures: number
  created_at: string
  updated_at: string
  source: "dynamic" | "system" | "module"
}

export const scheduledTaskFixtures: ScheduledTaskFixture[] = [
  {
    id: "3f1b6c2a-0001-4a11-8c11-aaaaaaaaaaaa",
    name: "每日晨間摘要",
    description: "早上九點把前一天的紀錄整理成一段話",
    trigger_type: "cron",
    trigger_config: { minute: "0", hour: "9", day: "*", month: "*", day_of_week: "*" },
    executor_type: "agent",
    executor_config: { agent_name: "web-chat-default", prompt: "整理昨天的紀錄" },
    is_enabled: true,
    created_by: 1,
    last_run_at: "2026-09-11T01:00:00Z",
    next_run_at: "2026-09-12T01:00:00Z",
    last_run_success: true,
    last_run_error: null,
    consecutive_failures: 0,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-11T01:00:00Z",
    source: "dynamic",
  },
  {
    id: "3f1b6c2a-0002-4a11-8c11-bbbbbbbbbbbb",
    name: "庫存水位巡檢",
    description: null,
    trigger_type: "interval",
    trigger_config: { weeks: 0, days: 0, hours: 6, minutes: 0, seconds: 0 },
    executor_type: "skill_script",
    executor_config: { skill: "stock-watch", script: "check_levels.py", input: '{"threshold": 10}' },
    is_enabled: false,
    created_by: 1,
    last_run_at: "2026-09-11T18:00:00Z",
    next_run_at: null,
    last_run_success: false,
    last_run_error: "Script not found: stock-watch/check_levels.py",
    consecutive_failures: 3,
    created_at: "2026-08-20T00:00:00Z",
    updated_at: "2026-09-11T18:00:00Z",
    source: "dynamic",
  },
  {
    // 靜態排程：`_collect_static_schedules`（api/scheduler.py 246–283）用 job.id 當名稱，
    // cron 只回非星號的欄位，executor_config 是空的。
    id: "3f1b6c2a-0003-4a11-8c11-cccccccccccc",
    name: "cleanup_expired_shares",
    description: "清理過期分享連結",
    trigger_type: "cron",
    // `_parse_trigger` 是把 APScheduler 的欄位整包倒出來，實際會多一個 second。
    trigger_config: { hour: "3", minute: "30", second: "0" },
    executor_type: "agent",
    executor_config: {},
    is_enabled: true,
    created_by: null,
    last_run_at: null,
    next_run_at: "2026-09-13T19:30:00Z",
    last_run_success: null,
    last_run_error: null,
    consecutive_failures: 0,
    created_at: "2026-09-12T00:00:00Z",
    updated_at: "2026-09-12T00:00:00Z",
    source: "system",
  },
  {
    id: "3f1b6c2a-0004-4a11-8c11-dddddddddddd",
    name: "linebot:refresh_groups",
    description: "同步 LINE 群組名稱",
    trigger_type: "interval",
    trigger_config: { hours: 12 },
    executor_type: "agent",
    executor_config: {},
    is_enabled: true,
    created_by: null,
    last_run_at: null,
    next_run_at: "2026-09-12T12:00:00Z",
    last_run_success: null,
    last_run_error: null,
    consecutive_failures: 0,
    created_at: "2026-09-12T00:00:00Z",
    updated_at: "2026-09-12T00:00:00Z",
    source: "module",
  },
]

/** `GET /api/ai/agents` 的 items（前端只用 id／name／display_name）。 */
export const schedulerAgentFixtures = [
  {
    id: "9a7c1d10-0001-4b22-9d33-eeeeeeeeeeee",
    name: "web-chat-default",
    display_name: "網頁對話",
    model: "sonnet",
    is_active: true,
    tools: null,
    updated_at: "2026-09-01T00:00:00Z",
  },
  {
    id: "9a7c1d10-0002-4b22-9d33-ffffffffffff",
    name: "report-writer",
    display_name: null,
    model: "sonnet",
    is_active: true,
    tools: null,
    updated_at: "2026-09-01T00:00:00Z",
  },
]

/** `GET /api/skills` 的 skills（api/skills.py 181–205），這裡只留前端用得到的欄位。 */
export const schedulerSkillFixtures = [
  { name: "stock-watch", description: "庫存水位巡檢", scripts: ["check_levels.py", "export_csv.py"] },
  { name: "daily-report", description: "每日報表", scripts: ["build.py"] },
]

/**
 * 攔 `/api/scheduler/tasks`（七支端點）與下拉用的 `/api/ai/agents`、`/api/skills`。
 * 狀態留在記憶體，同一個 page 內連續操作看得到結果。
 */
export async function mockScheduler(
  page: Page,
  opts: {
    tasks?: ScheduledTaskFixture[]
    agents?: typeof schedulerAgentFixtures
    skills?: typeof schedulerSkillFixtures
    /** POST 一律回這個 409 訊息（api/scheduler.py 83–86 的名稱重複）。 */
    failCreate?: string
  } = {},
) {
  const tasks: ScheduledTaskFixture[] = (opts.tasks ?? scheduledTaskFixtures).map((t) => ({
    ...t,
    trigger_config: { ...t.trigger_config },
    executor_config: { ...t.executor_config },
  }))
  const base = new URL(API)
  const prefix = base.pathname.replace(/\/$/, "")
  const sameOrigin = (url: URL) => url.origin === base.origin
  const idFromUrl = (url: string, fromEnd: number) => {
    const parts = new URL(url).pathname.split("/")
    return parts[parts.length - fromEnd]
  }

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/ai/agents`,
    (route) =>
      route.fulfill({ json: { items: opts.agents ?? schedulerAgentFixtures, total: (opts.agents ?? schedulerAgentFixtures).length } }),
  )

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/skills`,
    (route) => route.fulfill({ json: { skills: opts.skills ?? schedulerSkillFixtures } }),
  )

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/scheduler/tasks`,
    async (route) => {
      if (route.request().method() !== "POST") return route.fulfill({ json: { tasks } })
      if (opts.failCreate) return route.fulfill({ status: 409, json: { detail: opts.failCreate } })
      const body = route.request().postDataJSON() as Partial<ScheduledTaskFixture>
      const created: ScheduledTaskFixture = {
        id: `3f1b6c2a-1${String(tasks.length).padStart(3, "0")}-4a11-8c11-999999999999`,
        name: body.name!,
        description: body.description ?? null,
        trigger_type: body.trigger_type!,
        trigger_config: body.trigger_config!,
        executor_type: body.executor_type!,
        executor_config: body.executor_config!,
        is_enabled: body.is_enabled ?? true,
        created_by: 1,
        last_run_at: null,
        next_run_at: body.is_enabled === false ? null : "2026-09-12T06:00:00Z",
        last_run_success: null,
        last_run_error: null,
        consecutive_failures: 0,
        created_at: "2026-09-12T05:00:00Z",
        updated_at: "2026-09-12T05:00:00Z",
        source: "dynamic",
      }
      tasks.push(created)
      await route.fulfill({ status: 201, json: created })
    },
  )

  await page.route(
    (url) => sameOrigin(url) && /^\/api\/scheduler\/tasks\/[^/]+$/.test(url.pathname.slice(prefix.length)),
    async (route) => {
      const id = idFromUrl(route.request().url(), 1)
      const index = tasks.findIndex((t) => t.id === id)
      // 靜態排程的假 id 不在資料表裡，PUT／DELETE 會落到 404（api/scheduler.py 136–138、177–179）。
      if (index < 0 || tasks[index].source !== "dynamic") {
        return route.fulfill({ status: 404, json: { detail: "排程不存在" } })
      }
      const method = route.request().method()
      if (method === "DELETE") {
        tasks.splice(index, 1)
        return route.fulfill({ status: 204 })
      }
      if (method === "PUT") {
        const body = route.request().postDataJSON() as Partial<ScheduledTaskFixture>
        // 後端 `model_dump(exclude_none=True)`（api/scheduler.py 149）：null 會被丟掉。
        for (const [k, v] of Object.entries(body)) {
          if (v !== null) (tasks[index] as unknown as Record<string, unknown>)[k] = v
        }
        tasks[index].updated_at = "2026-09-12T05:30:00Z"
      }
      await route.fulfill({ json: tasks[index] })
    },
  )

  await page.route(
    (url) => sameOrigin(url) && /^\/api\/scheduler\/tasks\/[^/]+\/toggle$/.test(url.pathname.slice(prefix.length)),
    async (route) => {
      const id = idFromUrl(route.request().url(), 2)
      const task = tasks.find((t) => t.id === id && t.source === "dynamic")
      if (!task) return route.fulfill({ status: 404, json: { detail: "排程不存在" } })
      const body = route.request().postDataJSON() as { is_enabled: boolean }
      task.is_enabled = body.is_enabled
      task.next_run_at = body.is_enabled ? "2026-09-12T06:00:00Z" : null
      await route.fulfill({ json: task })
    },
  )

  await page.route(
    (url) => sameOrigin(url) && /^\/api\/scheduler\/tasks\/[^/]+\/run$/.test(url.pathname.slice(prefix.length)),
    async (route) => {
      const id = idFromUrl(route.request().url(), 2)
      const task = tasks.find((t) => t.id === id && t.source === "dynamic")
      if (!task) return route.fulfill({ status: 404, json: { detail: "排程不存在" } })
      await route.fulfill({ status: 202, json: { message: `已送出執行: ${task.name}` } })
    },
  )

  return { tasks }
}

// ── 語音設定（api/voice_router.py 29–314）────────────────────────────────

export interface VoiceFixtureEngine {
  voices: { id: string; name: string; gender: string; language: string }[]
  config_schema: Record<string, Record<string, unknown>>
}

/**
 * 各引擎的 `get_config_schema()` 與 `list_voices()` 逐欄照抄
 * （ching-tech-os extends/voice/voice_tts.py：Edge 108–137、Google Cloud 146–172、
 * Gemini 331–355）。語音角色的 id 是引擎自己的識別碼，名稱是杜撰的顯示字串。
 *
 * `google_cloud` 目前不在 `get_available_engines()` 的回傳裡（voice_tts.py 385–388），
 * 但表單是照 `config_schema` 動態產的，這裡留著它是為了蓋到 slider 型別。
 */
export const voiceEngineFixtures: Record<string, VoiceFixtureEngine> = {
  edge: {
    // name 是 edge-tts 的 FriendlyName，照本機 `GET /api/voice/voices` 實際回的字串抄。
    voices: [
      { id: "zh-TW-HsiaoChenNeural", name: "Microsoft HsiaoChen Online (Natural) - Chinese (Taiwan)", gender: "female", language: "zh-TW" },
      { id: "zh-TW-YunJheNeural", name: "Microsoft YunJhe Online (Natural) - Chinese (Taiwan)", gender: "male", language: "zh-TW" },
      { id: "zh-TW-HsiaoYuNeural", name: "Microsoft HsiaoYu Online (Natural) - Chinese (Taiwanese Mandarin)", gender: "female", language: "zh-TW" },
    ],
    config_schema: { voice: { type: "select", label: "語音角色", required: true } },
  },
  gemini: {
    // Gemini 的 name 本來就帶了性別後綴（voice_tts.py 的 `_GEMINI_VOICES`），照抄。
    voices: [
      { id: "Kore", name: "Kore（女聲）", gender: "female", language: "multilingual" },
      { id: "Puck", name: "Puck（男聲）", gender: "male", language: "multilingual" },
    ],
    config_schema: {
      voice: { type: "select", label: "語音角色", required: true },
      instructions: {
        type: "text",
        label: "朗讀指示",
        placeholder: "用溫柔自然的語氣朗讀",
        default: "用溫柔自然的語氣朗讀",
      },
    },
  },
  google_cloud: {
    voices: [{ id: "cmn-TW-Standard-A", name: "標準女聲 A", gender: "female", language: "cmn-TW" }],
    config_schema: {
      voice: { type: "select", label: "語音角色", required: true },
      speed: { type: "slider", label: "語速", min: 0.5, max: 2.0, step: 0.1, default: 1.0 },
      pitch: { type: "slider", label: "音調", min: -10, max: 10, step: 1, default: 0 },
    },
  },
}

export interface VoiceSettingsFixture {
  tts_engine: string
  tts_params: Record<string, unknown>
}

/** `resolve_voice_settings` 的系統預設（services/mcp/voice_tools.py 58–64）。 */
export const voiceSystemDefault: VoiceSettingsFixture = {
  tts_engine: "edge",
  tts_params: { voice: "zh-TW-HsiaoChenNeural" },
}

export const voiceScopeFixtures = {
  groups: [
    { id: "11111111-1111-4111-8111-111111111111", name: "甲一機電群", platform: "line" },
    { id: "22222222-2222-4222-8222-222222222222", name: "乙二運輸群", platform: "telegram" },
  ],
  agents: [{ id: "33333333-3333-4333-8333-333333333333", name: "小助手" }],
}

/** 1 秒無聲 M4A 的前幾個 bytes；試聽只要能餵給 <audio> 當 blob，不必真的能播。 */
export const FAKE_AUDIO = Buffer.from("AAAAHGZ0eXBNNEEgAAAAAE00QSBpc29tbXA0Mg==", "base64")

export async function mockVoice(
  page: Page,
  opts: {
    isAdmin?: boolean
    groups?: typeof voiceScopeFixtures.groups
    agents?: typeof voiceScopeFixtures.agents
    /** key 是 `user`、`group:<id>`、`agent:<id>`；沒列到的 scope 代表沒存過設定（current=null）。 */
    stored?: Record<string, VoiceSettingsFixture>
    /** 試聽固定回這個狀態碼與 detail（429 冷卻、503 未安裝、501／500）。 */
    previewStatus?: number
    previewDetail?: string
    /** 可用引擎清單（`get_available_engines()`，voice_tts.py 385–388）。 */
    availableEngines?: string[]
  } = {},
) {
  const stored: Record<string, VoiceSettingsFixture> = { ...(opts.stored ?? {}) }
  const availableEngines = opts.availableEngines ?? ["edge", "gemini"]
  const base = new URL(API)
  const prefix = base.pathname.replace(/\/$/, "")
  const at = (path: string) => (url: URL) => url.origin === base.origin && url.pathname === `${prefix}${path}`

  await page.route(at("/api/voice/voices"), (route) => {
    const engine = new URL(route.request().url()).searchParams.get("engine") || "edge"
    const fixture = voiceEngineFixtures[engine] ?? voiceEngineFixtures.edge
    return route.fulfill({
      json: {
        engine,
        voices: fixture.voices,
        config_schema: fixture.config_schema,
        available_engines: availableEngines,
      },
    })
  })

  await page.route(at("/api/voice/scopes"), (route) =>
    route.fulfill({
      json: {
        is_admin: opts.isAdmin ?? false,
        groups: opts.groups ?? (opts.isAdmin ? voiceScopeFixtures.groups : []),
        agents: opts.isAdmin ? (opts.agents ?? voiceScopeFixtures.agents) : [],
      },
    }),
  )

  await page.route(at("/api/voice/settings"), (route) => {
    const req = route.request()
    const method = req.method()
    if (method === "PUT" || method === "DELETE") {
      const body = req.postDataJSON() as {
        scope: string; scope_id: string | null; tts_engine?: string; tts_params?: Record<string, unknown>
      }
      const key = body.scope === "user" ? "user" : `${body.scope}:${body.scope_id ?? ""}`
      if (body.scope !== "user" && !(opts.isAdmin ?? false)) {
        const what = body.scope === "group" ? "群組" : "Agent"
        return route.fulfill({ status: 403, json: { detail: `只有管理員可修改${what}語音設定` } })
      }
      if (method === "DELETE") delete stored[key]
      else stored[key] = { tts_engine: body.tts_engine ?? "edge", tts_params: body.tts_params ?? {} }
      return route.fulfill({ json: { ok: true } })
    }
    const params = new URL(req.url()).searchParams
    const scope = params.get("scope") ?? "user"
    const scopeId = params.get("scope_id") ?? ""
    const key = scope === "user" ? "user" : `${scope}:${scopeId}`
    const current = stored[key] ?? null
    return route.fulfill({ json: { scope, current, effective: current ?? voiceSystemDefault } })
  })

  await page.route(at("/api/voice/preview"), (route) => {
    if (opts.previewStatus) {
      return route.fulfill({
        status: opts.previewStatus,
        json: { detail: opts.previewDetail ?? "試聽失敗" },
      })
    }
    return route.fulfill({ status: 200, contentType: "audio/mp4", body: FAKE_AUDIO })
  })
}

/**
 * Skills（ching-tech-os `api/skills.py`）。清單 181–206、明細 208–243、
 * `PUT` 258–286、`DELETE` 287–295、`POST /reload` 297–302、
 * Hub 的 sources／search／inspect／install 169–179、307–520、
 * 檔案 `GET /{name}/files/{path}` 599–610。
 */
export interface SkillSummaryFixture {
  name: string
  description: string
  requires_app: string | string[] | null
  tools_count: number
  has_prompt: boolean
  references: string[]
  scripts: string[]
  scripts_count: number
  assets: string[]
  source: string
  license: string
  compatibility: string
  has_module: boolean
}

/** 明細比清單多這些欄位，但**沒有** `scripts_count`（`api/skills.py` 221–243）。 */
export interface SkillDetailFixture extends Omit<SkillSummaryFixture, "scripts_count"> {
  allowed_tools: string[]
  mcp_servers: string[]
  prompt: string
  script_tools: { name: string; path: string; description: string }[]
  metadata: Record<string, unknown> | null
  contributes: unknown
  meta: Record<string, unknown> | null
}

/**
 * 三支杜撰的 skill，各驗一種 `requires_app` 形狀：單一字串、清單（任一）、null。
 * `tools_count` 是後端算的 `len(allowed_tools)`（185），fixture 要跟明細的陣列長度一致。
 */
export const skillDetailFixtures: SkillDetailFixture[] = [
  {
    name: "inventory-helper",
    description: "查庫存餘額與調撥紀錄的助手說明。",
    requires_app: "inventory-management",
    tools_count: 2,
    has_prompt: true,
    references: ["references/庫存查詢.md", "references/調撥規則.txt"],
    scripts: ["scripts/stock_check.py"],
    assets: [],
    source: "native",
    license: "MIT",
    compatibility: ">=0.3.0",
    has_module: false,
    allowed_tools: ["Read", "Grep"],
    mcp_servers: ["erp"],
    prompt: "## 查庫存\n\n先問倉別，再查餘額。",
    script_tools: [{ name: "stock_check", path: "inventory-helper/scripts/stock_check.py", description: "盤點差異表" }],
    metadata: { ctos: { requires_app: "inventory-management" } },
    contributes: null,
    meta: null,
  },
  {
    name: "vendor-brief",
    // 清單語意是「任一」（`skills/__init__.py` 103–105），兩個 app 只要有一邊就看得到。
    requires_app: ["vendor-management", "project-management"],
    description: "整理往來對象近況給業務看。",
    tools_count: 1,
    has_prompt: true,
    references: [],
    scripts: [],
    assets: ["assets/範本.csv"],
    source: "external",
    license: "",
    compatibility: "",
    has_module: true,
    allowed_tools: ["Read"],
    mcp_servers: [],
    prompt: "## 對象近況\n\n先列最近三張採購單。",
    script_tools: [],
    metadata: { contributes: { app: { id: "vendor-brief", name: "對象近況", icon: "building" } } },
    contributes: { app: { id: "vendor-brief", name: "對象近況", icon: "building" } },
    meta: null,
  },
  {
    name: "pdf-toolkit",
    description: "把 PDF 拆頁與抽文字。",
    requires_app: null,
    tools_count: 0,
    has_prompt: false,
    references: [],
    scripts: ["scripts/split.sh"],
    assets: [],
    source: "clawhub",
    license: "Apache-2.0",
    compatibility: "",
    has_module: false,
    allowed_tools: [],
    mcp_servers: [],
    prompt: "",
    script_tools: [{ name: "split", path: "pdf-toolkit/scripts/split.sh", description: "依頁碼拆檔" }],
    metadata: {},
    contributes: null,
    // 只有從 Hub 裝進來的才有 `_meta.json`（`services/hub_meta.py` 55–83）。
    meta: { slug: "pdf-toolkit", version: "1.4.0", source: "clawhub", installed_at: "2026-09-01T02:00:00+00:00", owner: "demo-owner" },
  },
]

function skillSummaryOf(d: SkillDetailFixture): SkillSummaryFixture {
  return {
    name: d.name, description: d.description, requires_app: d.requires_app, tools_count: d.tools_count,
    has_prompt: d.has_prompt, references: d.references, scripts: d.scripts, scripts_count: d.scripts.length,
    assets: d.assets, source: d.source, license: d.license, compatibility: d.compatibility, has_module: d.has_module,
  }
}

/** `POST /hub/search` 的結果列：後端把 Hub 的 JSON 原樣轉發，只保證補上 `source`（335–336、348）。 */
export interface HubResultFixture {
  /** ClawHub 的全域唯一 id；同一個 slug 可能有好幾個作者各發一份，只有這個分得開。 */
  id?: string
  slug: string
  displayName?: string
  summary?: string
  /** 實測 ClawHub 搜尋結果這一欄是 null，版本由後端在 install 時抓 latest。 */
  version?: string | null
  source: "clawhub" | "skillhub"
  owner?: { handle: string; displayName?: string }
}

export const hubResultFixtures: HubResultFixture[] = [
  {
    id: "clawhub:aaa1", slug: "invoice-reader", displayName: "發票辨識", summary: "把發票掃描檔轉成表格。",
    version: "2.1.0", source: "clawhub", owner: { handle: "demo-owner", displayName: "示範作者" },
  },
  { id: "skillhub:bbb2", slug: "meeting-notes", displayName: "會議紀錄", summary: "把錄音逐字稿整理成重點。", version: "0.9.0", source: "skillhub" },
]

/**
 * 同一個 slug、不同作者的兩筆——ClawHub 真的會這樣回（搜「pdf」一次二十筆裡有七筆 slug 都是 `pdf`），
 * 而且 `version` 是 null。用來擋「安裝確認跳在每一筆同名的列上」這個回歸。
 */
export const duplicateSlugHubFixtures: HubResultFixture[] = [
  {
    id: "clawhub:dup1", slug: "pdf", displayName: "Pdf", summary: "甲作者的 PDF 工具。",
    version: null, source: "clawhub", owner: { handle: "owner-jia", displayName: "甲作者" },
  },
  {
    id: "clawhub:dup2", slug: "pdf", displayName: "Pdf", summary: "乙作者的 PDF 工具。",
    version: null, source: "clawhub", owner: { handle: "owner-yi", displayName: "乙作者" },
  },
]

/**
 * `GET /api/config/apps`（ching-tech-os `api/config_public.py` 19–22 →
 * `modules.py` 的 `get_enabled_app_manifests()` 364–378）。
 *
 * 回的是**裸陣列**不是 `{apps: [...]}`，而且這支**不需要認證**。清單含 extends 與
 * skill 貢獻的 app（`contributes.app` 走 `modules.py` 292–315），那些才是 SKILL.md
 * 的 `requires_app` 真的會寫的值；skill 貢獻的多帶 `loader`／`css`，這一頁用不到。
 */
export interface ConfigAppFixture {
  id: string
  name: string
  icon: string
  loader?: { src: string; globalName: string }
  css?: string
}

/** 照本機實測的形狀挑六筆：四個有頁面的、一個 skill 貢獻的（帶 loader／css）、一個側邊欄沒有的。 */
export const configAppFixtures: ConfigAppFixture[] = [
  { id: "knowledge-base", name: "知識庫", icon: "mdi-book-open-page-variant" },
  { id: "project-management", name: "專案管理", icon: "mdi-clipboard-text" },
  // 後端叫「廠商管理」，側邊欄叫「往來對象」——名稱以後端為準，這一筆就是拿來驗這件事的。
  { id: "vendor-management", name: "廠商管理", icon: "mdi-handshake" },
  { id: "inventory-management", name: "物料管理", icon: "mdi-package-variant" },
  { id: "file-manager", name: "檔案管理", icon: "mdi-folder" },
  {
    id: "his-integration",
    name: "HIS 整合",
    icon: "mdi-hospital-box",
    loader: { src: "/api/skills/his-integration/frontend/his-app.js", globalName: "HISIntegrationApp" },
    css: "/api/skills/his-integration/frontend/his-app.css",
  },
]

/** 單獨一支，讓需要 app 清單的頁各自掛（不綁在 mockApi 上，免得每一頁都多一次請求）。 */
export async function mockConfigApps(page: Page, apps: ConfigAppFixture[] | "fail" = configAppFixtures) {
  await page.route(`${API}/api/config/apps`, async (route) => {
    if (apps === "fail") return route.fulfill({ status: 500, json: { detail: "模組清單讀取失敗" } })
    await route.fulfill({ json: apps })
  })
}

export interface SkillMockStore {
  /** 每一次 `PUT /api/skills/{name}` 的 body，用來驗「只送變動欄位」與「沒變動就不送」。 */
  puts: { name: string; body: Record<string, unknown> }[]
  /** 清單被抓了幾次，用來驗安裝／重新載入之後有沒有重抓。 */
  listCalls: number
  reloadCalls: number
  deleted: string[]
  installed: { name: string; source: string; version?: string }[]
}

export async function mockSkills(
  page: Page,
  opts: {
    skills?: SkillDetailFixture[]
    /** `GET /{name}/files/{path}` 的內容，key 是 `<skill>/<path>`；沒列到的回 404「File not found」。 */
    files?: Record<string, string>
    hubSources?: { id: string; name: string; enabled: boolean }[]
    hubResults?: HubResultFixture[]
    /** 雙來源其中一家掛掉時後端放在 `errors` 而不是整支失敗（355–364）。 */
    hubErrors?: string[]
    hubInspectContent?: string
    /** 安裝一律回 409，detail 原樣是後端那句（454–457）。 */
    installConflict?: boolean
    /** `PUT` 一律回這個 400 detail。 */
    updateError?: string
  } = {},
): Promise<SkillMockStore> {
  const skills = (opts.skills ?? skillDetailFixtures).map((s) => ({ ...s }))
  const files = opts.files ?? {}
  const hubSources = opts.hubSources ?? [
    { id: "clawhub", name: "ClawHub", enabled: true },
    { id: "skillhub", name: "SkillHub", enabled: true },
  ]
  const hubResults = opts.hubResults ?? hubResultFixtures
  const store: SkillMockStore = { puts: [], listCalls: 0, reloadCalls: 0, deleted: [], installed: [] }

  async function dispatch(route: Parameters<Parameters<Page["route"]>[1]>[0]) {
    const req = route.request()
    const method = req.method()
    const path = new URL(req.url()).pathname
    // API_BASE 可能帶前綴（`/ctos`），從 `/api/skills` 之後切出來比對。
    const rest = decodeURIComponent(path.slice(path.indexOf("/api/skills") + "/api/skills".length))

    if (rest === "" && method === "GET") {
      store.listCalls += 1
      return route.fulfill({ json: { skills: skills.map(skillSummaryOf) } })
    }
    if (rest === "/reload" && method === "POST") {
      store.reloadCalls += 1
      return route.fulfill({ json: { reloaded: skills.length } })
    }
    if (rest === "/hub/sources") return route.fulfill({ json: { sources: hubSources } })
    if (rest === "/hub/search") {
      const body = req.postDataJSON() as { query: string; source: string | null }
      const results = hubResults.filter((r) => !body.source || r.source === body.source)
      return route.fulfill({
        json: body.source
          ? { query: body.query, results }
          : { query: body.query, results, sources: hubSources.map((s) => s.id), errors: opts.hubErrors ?? null },
      })
    }
    if (rest === "/hub/inspect") {
      const body = req.postDataJSON() as { slug: string; source: "clawhub" | "skillhub" }
      return route.fulfill({
        json: {
          slug: body.slug, source: body.source,
          content: opts.hubInspectContent ?? `---\nname: ${body.slug}\n---\n\n# ${body.slug}\n\n示範內容。`,
          skill: {}, owner: {}, latestVersion: {},
        },
      })
    }
    if (rest === "/hub/install") {
      const body = req.postDataJSON() as { name: string; source: string; version?: string }
      if (opts.installConflict) {
        return route.fulfill({ status: 409, json: { detail: `Skill '${body.name}' 已安裝。如需更新請先移除。` } })
      }
      store.installed.push(body)
      const found = hubResults.find((r) => r.slug === body.name)
      skills.push({
        name: body.name, description: found?.summary ?? "", requires_app: null, tools_count: 0, has_prompt: true,
        references: [], scripts: [], assets: [], source: body.source, license: "", compatibility: "", has_module: false,
        allowed_tools: [], mcp_servers: [], prompt: `# ${body.name}`, script_tools: [], metadata: {}, contributes: null,
        meta: { slug: body.name, version: found?.version ?? "", source: body.source, installed_at: "2026-09-12T02:00:00+00:00", owner: "" },
      })
      return route.fulfill({
        json: {
          installed: body.name, version: body.version ?? found?.version ?? "", source: body.source,
          path: `/srv/skills/${body.name}`, description: found?.summary ?? "", scripts_count: 0,
        },
      })
    }

    const fileMatch = /^\/([^/]+)\/(files|references)\/(.+)$/.exec(rest)
    if (fileMatch) {
      const [, name, kind, filePath] = fileMatch
      const key = `${name}/${kind === "references" && !filePath.startsWith("references/") ? `references/${filePath}` : filePath}`
      const content = files[key]
      if (content === undefined) return route.fulfill({ status: 404, json: { detail: "File not found" } })
      return route.fulfill({ json: { path: filePath, content } })
    }

    const name = rest.replace(/^\//, "")
    const index = skills.findIndex((s) => s.name === name)
    if (index === -1) return route.fulfill({ status: 404, json: { detail: `Skill '${name}' not found` } })
    const skill = skills[index]

    // 明細沒有 `scripts_count`，fixture 型別本身就沒帶，直接回整包。
    if (method === "GET") return route.fulfill({ json: skill })
    if (method === "PUT") {
      const body = req.postDataJSON() as Record<string, unknown>
      store.puts.push({ name, body })
      if (opts.updateError) return route.fulfill({ status: 400, json: { detail: opts.updateError } })
      if (Object.keys(body).length === 0) return route.fulfill({ status: 400, json: { detail: "No fields to update" } })
      if ("requires_app" in body) skill.requires_app = body.requires_app as string | string[] | null
      if ("allowed_tools" in body) {
        skill.allowed_tools = body.allowed_tools as string[]
        skill.tools_count = skill.allowed_tools.length
      }
      if ("mcp_servers" in body) skill.mcp_servers = body.mcp_servers as string[]
      // `PUT` 只回這四個欄位（281–286），不是完整的明細。
      return route.fulfill({
        json: { name: skill.name, requires_app: skill.requires_app, allowed_tools: skill.allowed_tools, mcp_servers: skill.mcp_servers },
      })
    }
    if (method === "DELETE") {
      skills.splice(index, 1)
      store.deleted.push(name)
      return route.fulfill({ json: { removed: name } })
    }
    return route.fallback()
  }

  await page.route(`${API}/api/skills`, dispatch)
  await page.route(`${API}/api/skills/**`, dispatch)
  return store
}

/**
 * 簡報產生（`api/presentation.py`）。
 *
 * `userFixture` 的 apps 沒有 `md2ppt`（後端 `services/permissions.py` 178 預設是開的，
 * 但 e2e 的 fixture 是逐項列出來的），所以要進得去這一頁得用這一份。
 */
export const presentationUserFixture = {
  ...userFixture,
  permissions: {
    ...userFixture.permissions,
    apps: { ...userFixture.permissions.apps, md2ppt: true },
  },
}

/** `PresentationResponse`（ching-tech-os `api/presentation.py` 37–46）。 */
export interface PresentationResultFixture {
  success: boolean
  title: string
  slides_count: number
  nas_path: string
  filename: string
  format: string
  message: string
}

export const presentationResultFixture: PresentationResultFixture = {
  success: true,
  title: "泵浦保養三步驟",
  slides_count: 5,
  nas_path: "ai-presentations/泵浦保養三步驟_20260912_101500.html",
  filename: "泵浦保養三步驟_20260912_101500.html",
  format: "html",
  message: "已生成《泵浦保養三步驟》HTML 簡報，共 5 頁",
}

export async function mockPresentation(
  page: Page,
  opts: {
    result?: PresentationResultFixture
    /** 回錯誤而不是成功；detail 照後端原樣（例如 `api/presentation.py` 57–58 的「請提供 topic 或 outline_json」）。 */
    error?: { status: number; detail: string }
    /** 拖住回應，用來看等待狀態；不給就立刻回。 */
    delayMs?: number
  } = {},
) {
  await page.route(`${API}/api/presentation/generate`, async (route) => {
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs))
    if (opts.error) {
      return route.fulfill({ status: opts.error.status, json: { detail: opts.error.detail } })
    }
    return route.fulfill({ json: opts.result ?? presentationResultFixture })
  })
}
