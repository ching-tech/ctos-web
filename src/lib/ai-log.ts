import { apiFetch } from "./api"

export interface AiLogListItem {
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
  user_id: number | null
  username: string | null
  created_at: string
}

export interface AiLogListResponse {
  items: AiLogListItem[]
  total: number
  page: number
  page_size: number
}

export interface AiLogStats {
  total_calls: number
  success_count: number
  failure_count: number
  success_rate: number
  avg_duration_ms: number | null
  total_input_tokens: number
  total_output_tokens: number
}

export interface ToolCallEntry {
  id: string
  name: string
  input: Record<string, unknown>
  output: string | null
}

export interface ToolTiming {
  name: string
  duration_ms: number
}

export interface ParsedResponse {
  tool_calls?: ToolCallEntry[]
  tool_timings?: ToolTiming[]
  [key: string]: unknown
}

export interface AiLog {
  id: string
  agent_id: string | null
  agent_name: string | null
  prompt_id: string | null
  context_type: string | null
  context_id: string | null
  input_prompt: string
  system_prompt: string | null
  allowed_tools: string[] | null
  raw_response: string | null
  parsed_response: ParsedResponse | null
  model: string | null
  success: boolean
  error_message: string | null
  duration_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  user_id: number | null
  username: string | null
  created_at: string
}

export interface AiAgentListItem {
  id: string
  name: string
  display_name: string | null
  model: string
  is_active: boolean
  tools: string[] | null
  updated_at: string
}

export interface LogFilters {
  agent?: string
  context?: string
  success?: "true" | "false" | ""
  from?: string
  to?: string
  page?: number
  /** 依使用者篩選；0 代表「未記錄使用者」（user_id IS NULL），必須能與 undefined 區分，不能用 truthy 判斷 */
  user?: number
}

export interface SimpleUserInfo {
  id: number
  username: string
  display_name: string | null
}

export const CONTEXT_LABEL: Record<string, string> = {
  "web-chat": "Web 對話",
  "linebot-group": "Line 群組",
  "linebot-personal": "Line 個人",
  "telegram-group": "Telegram 群組",
  "telegram-personal": "Telegram 個人",
  scheduler: "排程",
  presentation: "簡報",
  compress: "壓縮",
  script: "腳本",
  test: "測試",
  research: "研究",
  "bot-restricted": "受限模式",
}

export function contextLabel(t: string | null): string {
  if (t === null) return "—"
  return CONTEXT_LABEL[t] ?? t
}

export function toolDisplayName(tc: ToolCallEntry): string {
  if (tc.name.includes("run_skill_script")) {
    const skill = tc.input.skill
    if (typeof skill === "string" && skill) {
      const script = tc.input.script
      return typeof script === "string" && script ? `run_skill_script(${skill}/${script})` : `run_skill_script(${skill})`
    }
  }
  return tc.name
}

export function usedToolsFrom(parsed: ParsedResponse | null): string[] {
  const toolCalls = parsed?.tool_calls
  if (!toolCalls || toolCalls.length === 0) return []
  const seen: string[] = []
  for (const tc of toolCalls) {
    const name = toolDisplayName(tc)
    if (!seen.includes(name)) seen.push(name)
  }
  return seen
}

export function toolDurationMs(parsed: ParsedResponse, index: number): number | null {
  const toolCalls = parsed.tool_calls
  const timings = parsed.tool_timings
  if (!toolCalls || !timings || timings.length !== toolCalls.length) return null
  return timings[index]?.duration_ms ?? null
}

export function toDayStart(d: string): string {
  return new Date(`${d}T00:00:00`).toISOString()
}

export function toDayEnd(d: string): string {
  return new Date(`${d}T23:59:59.999`).toISOString()
}

export function buildLogQuery(f: LogFilters, pageSize = 50): string {
  const params = new URLSearchParams()
  if (f.agent) params.set("agent_id", f.agent)
  if (f.context) params.set("context_type", f.context)
  if (f.success) params.set("success", f.success)
  if (f.from) params.set("start_date", toDayStart(f.from))
  if (f.to) params.set("end_date", toDayEnd(f.to))
  // user 可能是 0（未記錄使用者），不能用 truthy 判斷，要判 undefined
  if (f.user !== undefined) params.set("user_id", String(f.user))
  params.set("page", String(f.page ?? 1))
  params.set("page_size", String(pageSize))
  return `?${params.toString()}`
}

export function listLogs(f: LogFilters): Promise<AiLogListResponse> {
  return apiFetch<AiLogListResponse>(`/api/ai/logs${buildLogQuery(f)}`)
}

export function getLogStats(f: Pick<LogFilters, "agent" | "from" | "to" | "user">): Promise<AiLogStats> {
  const params = new URLSearchParams()
  if (f.agent) params.set("agent_id", f.agent)
  if (f.from) params.set("start_date", toDayStart(f.from))
  if (f.to) params.set("end_date", toDayEnd(f.to))
  if (f.user !== undefined) params.set("user_id", String(f.user))
  const qs = params.toString()
  return apiFetch<AiLogStats>(`/api/ai/logs/stats${qs ? `?${qs}` : ""}`)
}

export function getLog(id: string): Promise<AiLog> {
  return apiFetch<AiLog>(`/api/ai/logs/${id}`)
}

export function listAgents(): Promise<{ items: AiAgentListItem[]; total: number }> {
  return apiFetch<{ items: AiAgentListItem[]; total: number }>("/api/ai/agents")
}

export function listUsers(): Promise<{ users: SimpleUserInfo[] }> {
  return apiFetch<{ users: SimpleUserInfo[] }>("/api/user/list")
}

export const aiLogKeys = {
  all: ["ai-log"] as const,
  list: (f: LogFilters) => ["ai-log", "list", f] as const,
  stats: (f: Pick<LogFilters, "agent" | "from" | "to" | "user">) => ["ai-log", "stats", f] as const,
  detail: (id: string) => ["ai-log", "detail", id] as const,
  agents: ["ai-log", "agents"] as const,
  users: ["ai-log", "users"] as const,
}
