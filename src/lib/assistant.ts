import type { ToolCallEntry } from "./ai-log"
import { apiFetch } from "./api"

/**
 * AI 助手的 REST 契約，對照後端 `models/ai.py` 與 `api/ai_router.py`（prefix `/api/ai`）。
 * Socket.IO 事件的型別也放這裡，對照 `api/ai.py`。
 */

export interface ChatMessage {
  role: string
  content: string
  timestamp: number
  is_summary?: boolean
  /**
   * 這一輪用了哪些工具。後端存進 DB 的歷史訊息沒有這個欄位（工具呼叫只進 AI Log），
   * 只有 socket 當場回的 `ai_response` 帶得到；重新整理後就看不到了。
   */
  tool_calls?: ToolCallEntry[]
}

export interface Chat {
  id: string
  user_id: number | null
  title: string
  model: string
  prompt_name: string
  created_at: string
  updated_at: string
}

export interface ChatDetail extends Chat {
  messages: ChatMessage[]
}

export interface ChatCreate {
  title?: string
  model?: string
  prompt_name?: string
}

export interface ChatUpdate {
  title?: string
  model?: string
  prompt_name?: string
}

/** 後端 `ai_chat_event` 預設的模型（`api/ai.py` 的 `data.get("model", "claude-sonnet")`）。 */
export const DEFAULT_MODEL = "claude-sonnet"
/** 後端取不到 `prompt_name` 時退回的 agent（`api/ai.py` 的 `chat.get("prompt_name", "web-chat-default")`）。 */
export const DEFAULT_AGENT = "web-chat-default"

export function listChats(): Promise<Chat[]> {
  return apiFetch<Chat[]>("/api/ai/chats")
}

export function createChat(data: ChatCreate): Promise<ChatDetail> {
  return apiFetch<ChatDetail>("/api/ai/chats", { method: "POST", body: JSON.stringify(data) })
}

export function getChat(id: string): Promise<ChatDetail> {
  return apiFetch<ChatDetail>(`/api/ai/chats/${id}`)
}

export function updateChat(id: string, data: ChatUpdate): Promise<ChatDetail> {
  return apiFetch<ChatDetail>(`/api/ai/chats/${id}`, { method: "PATCH", body: JSON.stringify(data) })
}

export function deleteChat(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/ai/chats/${id}`, { method: "DELETE" })
}

export const assistantKeys = {
  all: ["assistant"] as const,
  chats: ["assistant", "chats"] as const,
  chat: (id: string) => ["assistant", "chat", id] as const,
  agents: ["assistant", "agents"] as const,
}

/**
 * 對話詳情的 query 設定。
 *
 * `refetchOnWindowFocus` 一定要關：送出訊息後使用者那則是樂觀塞進快取的，
 * 後端要等 AI 跑完才會把它寫進 DB。這段期間視窗重新取得焦點若重抓，
 * 回來的是還沒有那則訊息的舊資料，畫面上剛打的字就不見了。
 */
export function chatQueryOptions(id: string | null) {
  return {
    queryKey: assistantKeys.chat(id ?? ""),
    queryFn: () => getChat(id!),
    enabled: !!id,
    retry: false,
    refetchOnWindowFocus: false,
  }
}

// ============================================================
// Socket.IO 事件（對照 backend/src/ching_tech_os/api/ai.py）
// ============================================================

/** 送出：`ai_chat_event`。後端只看 chatId／message／model，agent 是對話自己的 prompt_name。 */
export interface AiChatEventPayload {
  chatId: string
  message: string
  model: string
}

/** 收到：`ai_typing`。 */
export interface AiTypingPayload {
  chatId?: string
  typing?: boolean
}

/** 收到：`ai_response`。後端目前只回 chatId 與 message，工具呼叫欄位是為之後預留的。 */
export interface AiResponsePayload {
  chatId?: string
  message?: string
  tool_calls?: ToolCallEntry[]
  toolCalls?: ToolCallEntry[]
}

/** 收到：`ai_error`。 */
export interface AiErrorPayload {
  chatId?: string
  error?: string
}

/** 收到：`compress_complete`。 */
export interface CompressCompletePayload {
  chatId?: string
  messages?: ChatMessage[]
  compressed_count?: number
}

/** 事件是不是屬於目前這串對話；後端對同一條連線推所有對話的事件，要自己過濾。 */
export function isForChat(payload: { chatId?: string } | undefined, chatId: string | null): boolean {
  if (!chatId) return false
  return payload?.chatId === chatId
}

/** 兩種命名都收（後端之後補上時不必再改頁面）；沒有工具呼叫回 undefined，不要塞空陣列。 */
export function toolCallsOf(payload: AiResponsePayload): ToolCallEntry[] | undefined {
  const calls = payload.tool_calls ?? payload.toolCalls
  return calls && calls.length > 0 ? calls : undefined
}

/** 訊息串顯示用：system 的壓縮摘要要另外標，其他 system 訊息不顯示。 */
export function visibleMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => m.role !== "system" || m.is_summary === true)
}

/** 清單上的時間：今天只顯示時分，其他顯示月／日。 */
export function chatTimeLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (sameDay) return d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })
  return d.toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" })
}
