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
  parsed_response: Record<string, unknown> | null
  model: string | null
  success: boolean
  error_message: string | null
  duration_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
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
  params.set("page", String(f.page ?? 1))
  params.set("page_size", String(pageSize))
  return `?${params.toString()}`
}

export function listLogs(f: LogFilters): Promise<AiLogListResponse> {
  return apiFetch<AiLogListResponse>(`/api/ai/logs${buildLogQuery(f)}`)
}

export function getLogStats(f: Pick<LogFilters, "agent" | "from" | "to">): Promise<AiLogStats> {
  const params = new URLSearchParams()
  if (f.agent) params.set("agent_id", f.agent)
  if (f.from) params.set("start_date", toDayStart(f.from))
  if (f.to) params.set("end_date", toDayEnd(f.to))
  const qs = params.toString()
  return apiFetch<AiLogStats>(`/api/ai/logs/stats${qs ? `?${qs}` : ""}`)
}

export function getLog(id: string): Promise<AiLog> {
  return apiFetch<AiLog>(`/api/ai/logs/${id}`)
}

export function listAgents(): Promise<{ items: AiAgentListItem[]; total: number }> {
  return apiFetch<{ items: AiAgentListItem[]; total: number }>("/api/ai/agents")
}

export const aiLogKeys = {
  all: ["ai-log"] as const,
  list: (f: LogFilters) => ["ai-log", "list", f] as const,
  stats: (f: Pick<LogFilters, "agent" | "from" | "to">) => ["ai-log", "stats", f] as const,
  detail: (id: string) => ["ai-log", "detail", id] as const,
  agents: ["ai-log", "agents"] as const,
}
