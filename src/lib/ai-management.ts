import { apiFetch } from "./api"

/**
 * Prompt 編輯器與 Agent 設定的 REST 契約，對照 ching-tech-os 的
 * `api/ai_management.py`（prefix `/api/ai`）與 `models/ai.py`。
 *
 * 權限（`api/ai_management.py` 40、53、66、80、95、113、133、146、153、167、177、190、203、307）：
 * - 讀取（GET prompts／agents）只要登入（`get_current_session`）。
 * - 寫入 prompt 要 app `prompt-editor`，寫入 agent 與 `POST /api/ai/test` 要 app `agent-settings`
 *   （兩個在 `services/permissions.py` 171–172 的預設都是 False）。
 * - `GET /api/ai/providers/status` 只有管理員（`require_admin`）。
 */

// ============================================================
// Prompt
// ============================================================

/** `AiPromptListItem`（`models/ai.py` 132–140）：不含 `content`。 */
export interface AiPromptListItem {
  id: string
  name: string
  display_name: string | null
  category: string | null
  description: string | null
  updated_at: string
}

/** `AiPromptListResponse`（`models/ai.py` 143–147）：後端沒有分頁，`total` 就是 `items.length`。 */
export interface AiPromptListResponse {
  items: AiPromptListItem[]
  total: number
}

/**
 * `AiPromptResponse`（`models/ai.py` 119–129）。
 *
 * 注意：`api/ai_management.py` 89–91 會在回傳前塞一個 `referencing_agents`，
 * 但這支端點宣告了 `response_model=AiPromptResponse`，FastAPI 會把 model 沒有的鍵濾掉，
 * 所以前端**拿不到**這個欄位，不要照著做「哪些 agent 在用」的畫面。
 */
export interface AiPrompt {
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

/** `AiPromptCreate`（`models/ai.py` 98–106）。 */
export interface AiPromptCreate {
  name: string
  display_name?: string | null
  category?: string | null
  content: string
  description?: string | null
  variables?: Record<string, unknown> | null
}

/** `AiPromptUpdate`（`models/ai.py` 109–116）：六個欄位都可選，沒送的不動。 */
export type AiPromptPatch = Partial<AiPromptCreate>

/** `POST /api/ai/prompts` 的 `name: str = Field(..., max_length=128)`，前端先擋免得白跑一趟 422。 */
export const PROMPT_NAME_MAX = 128
/** `display_name: str | None = Field(None, max_length=256)`。 */
export const PROMPT_DISPLAY_NAME_MAX = 256
/** `category: str | None = Field(None, max_length=64)`。 */
export const PROMPT_CATEGORY_MAX = 64

/**
 * 分類是自由字串（`max_length=64`），後端沒有 enum。下拉選項＝說明文字寫的三種
 * （`models/ai.py` 102 的「system, task, template」）加上種子資料實際用到的
 * `linebot`／`internal`（`migrations/versions/seed_data.sql`）。
 * 遇到不在這份清單裡的既有值，編輯頁會把它補進選項，不會靜默改掉。
 */
export const PROMPT_CATEGORY_OPTIONS = ["system", "task", "template", "linebot", "internal"] as const

/**
 * 這兩個 prompt 是 LINE／Telegram bot 的系統提示詞，改了立刻影響 bot：
 * `services/linebot_ai.py` 每次回話都重新讀 agent 的 system prompt，沒有快取。
 * agent `linebot-personal`／`linebot-group` 的 `system_prompt_id` 指到同名的 prompt
 * （`migrations/versions/008_update_bot_prompt_platform.py` 24、33）。
 */
export const BOT_PROMPT_NAMES = ["linebot-personal", "linebot-group"] as const

export function isBotPrompt(name: string): boolean {
  return (BOT_PROMPT_NAMES as readonly string[]).includes(name)
}

/** `GET /api/ai/prompts`，可選 `category` 過濾（`api/ai_management.py` 53–64）。 */
export function listPrompts(category?: string): Promise<AiPromptListResponse> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : ""
  return apiFetch<AiPromptListResponse>(`/api/ai/prompts${qs}`)
}

/** `GET /api/ai/prompts/{id}`，找不到是 404「Prompt 不存在」。 */
export function getPrompt(id: string): Promise<AiPrompt> {
  return apiFetch<AiPrompt>(`/api/ai/prompts/${id}`)
}

/** `POST /api/ai/prompts`，名稱撞名時後端回 400「Prompt 名稱 'x' 已存在」。 */
export function createPrompt(body: AiPromptCreate): Promise<AiPrompt> {
  return apiFetch<AiPrompt>("/api/ai/prompts", { method: "POST", body: JSON.stringify(body) })
}

/** `PUT /api/ai/prompts/{id}`，只送要改的欄位。 */
export function updatePrompt(id: string, patch: AiPromptPatch): Promise<AiPrompt> {
  return apiFetch<AiPrompt>(`/api/ai/prompts/${id}`, { method: "PUT", body: JSON.stringify(patch) })
}

/**
 * `DELETE /api/ai/prompts/{id}`：回 `{success: true}` 而不是 204。
 * 被 agent 引用時後端回 400（`api/ai_management.py` 120–124），detail 原樣顯示。
 */
export async function deletePrompt(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/ai/prompts/${id}`, { method: "DELETE" })
}

// ============================================================
// Agent
// ============================================================

/**
 * `AiAgentListItem`（`models/ai.py` 200–209）。
 * 沒有 `system_prompt_id`，所以清單列不出「關聯的 prompt」，要進明細才拿得到。
 */
export interface AiAgentListItem {
  id: string
  name: string
  display_name: string | null
  model: string
  is_active: boolean
  tools: string[] | null
  updated_at: string
}

/** `AiAgentListResponse`（`models/ai.py` 212–216）。 */
export interface AiAgentListResponse {
  items: AiAgentListItem[]
  total: number
}

/** `AiAgentResponse`（`models/ai.py` 183–197）：`system_prompt` 是整個 prompt 物件。 */
export interface AiAgent {
  id: string
  name: string
  display_name: string | null
  description: string | null
  model: string
  system_prompt_id: string | null
  system_prompt: AiPrompt | null
  is_active: boolean
  tools: string[] | null
  settings: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

/** `AiAgentCreate`（`models/ai.py` 159–169）：`name` 與 `model` 必填，`is_active` 預設 true。 */
export interface AiAgentCreate {
  name: string
  display_name?: string | null
  description?: string | null
  model: string
  system_prompt_id?: string | null
  is_active?: boolean
  tools?: string[] | null
  settings?: Record<string, unknown> | null
}

/** `AiAgentUpdate`（`models/ai.py` 172–180）：八個欄位都可選。 */
export type AiAgentPatch = Partial<AiAgentCreate>

/** `name: str = Field(..., max_length=64)`。 */
export const AGENT_NAME_MAX = 64
/** `display_name: str | None = Field(None, max_length=128)`。 */
export const AGENT_DISPLAY_NAME_MAX = 128
/** `model: str = Field(..., max_length=32)`。 */
export const AGENT_MODEL_MAX = 32

/**
 * 模型選項。後端**沒有**「列出可用模型」的端點：舊桌面
 * `frontend/js/agent-settings.js` 58–62 就是寫死這三個常數。
 * 這三個值對得上 `services/claude_agent.py` 167–171 的 `MODEL_MAP`
 * （`claude-opus`／`claude-sonnet`／`claude-haiku` → `opus`／`sonnet`／`haiku`），
 * 也是 `src/lib/assistant.ts` 的 `DEFAULT_MODEL` 用的寫法。
 * 欄位本身是自由字串（`max_length=32`），所以畫面給下拉也留「自己填」。
 */
export const MODEL_OPTIONS: { id: string; name: string }[] = [
  { id: "claude-opus", name: "Claude Opus" },
  { id: "claude-sonnet", name: "Claude Sonnet" },
  { id: "claude-haiku", name: "Claude Haiku" },
]

/**
 * 工具建議清單。同樣**沒有**端點：舊桌面 `frontend/js/agent-settings.js` 64–73
 * 是一份寫死的 checkbox 清單。後端不驗證 `tools` 的內容（`list[str] | None`），
 * 實際能不能用由 provider 決定，所以畫面做成可自由輸入的標籤，這份只當快捷鍵。
 */
export const TOOL_SUGGESTIONS: { id: string; name: string }[] = [
  { id: "WebSearch", name: "網路搜尋" },
  { id: "WebFetch", name: "網頁抓取" },
  { id: "Read", name: "讀取檔案" },
  { id: "Write", name: "寫入檔案" },
  { id: "Edit", name: "編輯檔案" },
  { id: "Bash", name: "執行命令" },
  { id: "Glob", name: "檔案匹配" },
  { id: "Grep", name: "內容搜尋" },
]

/** `GET /api/ai/agents`。 */
export function listAgents(): Promise<AiAgentListResponse> {
  return apiFetch<AiAgentListResponse>("/api/ai/agents")
}

/** `GET /api/ai/agents/{id}`，找不到是 404「Agent 不存在」。 */
export function getAgent(id: string): Promise<AiAgent> {
  return apiFetch<AiAgent>(`/api/ai/agents/${id}`)
}

/** `GET /api/ai/agents/by-name/{name}`（`api/ai_management.py` 153–162）。 */
export function getAgentByName(name: string): Promise<AiAgent> {
  return apiFetch<AiAgent>(`/api/ai/agents/by-name/${encodeURIComponent(name)}`)
}

/** `POST /api/ai/agents`，名稱撞名時後端回 400「Agent 名稱 'x' 已存在」。 */
export function createAgent(body: AiAgentCreate): Promise<AiAgent> {
  return apiFetch<AiAgent>("/api/ai/agents", { method: "POST", body: JSON.stringify(body) })
}

/** `PUT /api/ai/agents/{id}`，只送要改的欄位。 */
export function updateAgent(id: string, patch: AiAgentPatch): Promise<AiAgent> {
  return apiFetch<AiAgent>(`/api/ai/agents/${id}`, { method: "PUT", body: JSON.stringify(patch) })
}

/** `DELETE /api/ai/agents/{id}`：回 `{success: true}`，相關的 log 保留（`agent_id` 設 null）。 */
export async function deleteAgent(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/ai/agents/${id}`, { method: "DELETE" })
}

// ============================================================
// 測試呼叫
// ============================================================

/** `AiTestRequest`（`models/ai.py` 328–332）。 */
export interface AiTestRequest {
  agent_id: string
  message: string
}

/**
 * `AiTestResponse`（`models/ai.py` 335–342）。這支**真的會呼叫 AI**，會計費也會留一筆 ai_log。
 * 失敗不是 HTTP 錯誤：`success: false` 配 `error`，狀態碼仍是 200
 * （`services/ai_manager.py` 890–923 的 `test_agent` 直接把結果回出來）。
 */
export interface AiTestResponse {
  success: boolean
  response: string | null
  error: string | null
  duration_ms: number | null
  log_id: string | null
}

/** `POST /api/ai/test`（要 app `agent-settings`）。 */
export function testAgent(body: AiTestRequest): Promise<AiTestResponse> {
  return apiFetch<AiTestResponse>("/api/ai/test", { method: "POST", body: JSON.stringify(body) })
}

// ============================================================
// Provider 狀態（管理員）
// ============================================================

/** `services/codex_agent.py` 86–95 的 circuit 狀態。 */
export interface ProviderCircuit {
  state: string
  consecutive_failures: number
}

/** `services/codex_agent.py` 193–203。`claude` 那一支只回 `{ready: true}`（`ai_router.py` 318）。 */
export interface ProviderEntry {
  ready: boolean
  adapter_binary?: boolean
  codex_binary?: boolean
  circuit?: ProviderCircuit
}

/** `services/claude_usage.py` 63–76 的 `as_metadata()`；比例已正規化成 0–1。 */
export interface ClaudeUsage {
  state: string
  utilization: number | null
  five_hour: number | null
  seven_day: number | null
  fetched_at: string | null
  last_attempt_at: string | null
  last_error: string | null
  consecutive_failures: number
}

/** `services/ai_router.py` 310–322 的 `provider_status()`。 */
export interface ProviderStatus {
  mode: string
  providers: Record<string, ProviderEntry>
  usage: ClaudeUsage
}

/** `GET /api/ai/providers/status`（只有管理員，非管理員不要打）。 */
export function getProviderStatus(): Promise<ProviderStatus> {
  return apiFetch<ProviderStatus>("/api/ai/providers/status")
}

// ============================================================
// 共用工具
// ============================================================

/**
 * 解析 JSON 物件欄位（prompt 的 `variables`、agent 的 `settings`）。
 * 後端型別是 `dict[str, Any] | None`，所以陣列與純量都要擋下來，不然會吃 422。
 * 空白＝null（等於清掉）。
 */
export function parseJsonObject(text: string): { ok: true; value: Record<string, unknown> | null } | { ok: false; error: string } {
  const trimmed = text.trim()
  if (!trimmed) return { ok: true, value: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { ok: false, error: "JSON 格式不正確" }
  }
  if (parsed === null) return { ok: true, value: null }
  if (typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "必須是 JSON 物件（大括號包起來）" }
  return { ok: true, value: parsed as Record<string, unknown> }
}

/** 把物件排版成表單裡好讀的樣子；null 給空字串。 */
export function formatJsonObject(value: Record<string, unknown> | null): string {
  return value ? JSON.stringify(value, null, 2) : ""
}

export const aiManagementKeys = {
  prompts: ["ai-management", "prompts"] as const,
  promptList: (category?: string) => ["ai-management", "prompts", "list", category ?? ""] as const,
  promptDetail: (id: string) => ["ai-management", "prompts", "detail", id] as const,
  agents: ["ai-management", "agents"] as const,
  agentList: ["ai-management", "agents", "list"] as const,
  agentDetail: (id: string) => ["ai-management", "agents", "detail", id] as const,
  providerStatus: ["ai-management", "provider-status"] as const,
}
