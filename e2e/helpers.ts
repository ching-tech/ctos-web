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
    apps: { "knowledge-base": true, "ai-log": false, linebot: true, settings: true, "project-management": true },
    knowledge: { global_write: false, global_delete: false },
  },
}
export const adminFixture = {
  ...userFixture, id: 1, username: "admin", display_name: "管理員", is_admin: true, role: "admin", account_role: "admin",
  permissions: {
    apps: { "knowledge-base": true, "ai-log": true, linebot: true, settings: true, "project-management": true },
    knowledge: { global_write: true, global_delete: true },
  },
}

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
  { id: "log-04", agent_id: "ag-2", agent_name: "個人助理", context_type: "web-chat", model: "claude-sonnet-4-5", script_label: null, allowed_tools: ["search_knowledge"], used_tools: ["search_knowledge"], success: true, duration_ms: 1100, input_tokens: 300, output_tokens: 140, created_at: "2026-09-09T09:00:00" },
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
  return { id, agent_id, agent_name, context_type, model, script_label, allowed_tools, used_tools, success, duration_ms, input_tokens, output_tokens, created_at }
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
  if (opts.withListFilters) {
    const contextType = params.get("context_type")
    const success = params.get("success")
    if (contextType) filtered = filtered.filter((l) => l.context_type === contextType)
    if (success) filtered = filtered.filter((l) => l.success === (success === "true"))
  }
  return filtered
}

export async function mockAiLog(page: Page, opts: { logs?: AiLogFixture[]; agents?: AiAgentFixture[] } = {}) {
  const logs: AiLogFixture[] = (opts.logs ?? aiLogFixtures).map((l) => ({ ...l }))
  const agents: AiAgentFixture[] = (opts.agents ?? aiAgentFixtures).map((a) => ({ ...a }))
  const base = new URL(API)
  const prefix = base.pathname.replace(/\/$/, "")
  const sameOrigin = (url: URL) => url.origin === base.origin

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
  "ai-log": "AI Log",
  linebot: "Bot 管理",
  settings: "設定",
  "project-management": "專案管理",
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

/** 攔 /api/admin/users、/api/admin/default-permissions、PATCH /api/admin/users/:id/permissions（依 deep merge 回寫）。 */
export async function mockAdmin(page: Page, opts: { users?: AdminUserFixture[] } = {}) {
  const users: AdminUserFixture[] = (opts.users ?? adminUserFixtures).map((u) => ({
    ...u,
    permissions: { apps: { ...u.permissions.apps }, knowledge: { ...u.permissions.knowledge } },
  }))
  const base = new URL(API)
  const prefix = base.pathname.replace(/\/$/, "")
  const sameOrigin = (url: URL) => url.origin === base.origin

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/admin/users`,
    async (route) => route.fulfill({ json: { users } }),
  )

  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/admin/default-permissions`,
    async (route) =>
      route.fulfill({
        json: {
          apps: { "knowledge-base": true, "ai-log": false, linebot: true, settings: true, "project-management": true },
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

// 兩個群組：grp-1（line、allow_ai_response 開）、grp-2（telegram、is_active 關且有 left_at）。
export const botGroupFixtures: BotGroupFixture[] = [
  {
    id: "grp-1", platform_type: "line", platform_group_id: "C-line-001", name: "擎添業務群",
    picture_url: null, member_count: 12, project_id: null, project_name: "展望 HIS 案",
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
    name: "台北捷運監控案",
    customer: "捷運公司",
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
  await page.route(
    (url) => sameOrigin(url) && url.pathname === `${prefix}/api/user/list`,
    async (route) => route.fulfill({ json: { users } }),
  )

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
