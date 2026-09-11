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
        project_id: null,
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
