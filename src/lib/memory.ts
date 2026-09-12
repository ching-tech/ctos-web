import { apiFetch } from "./api"

/**
 * Bot 自訂記憶：群組記憶存 `bot_group_memories`、個人記憶存 `bot_user_memories`
 * （ching-tech-os `migrations/versions/clean_schema.sql` 476–485、535–543）。
 *
 * 這份資料和 bot 在對話裡用的是同一份：`services/linebot_ai.py` 1745–1763 在組系統提示詞時
 * 讀 `get_active_group_memories`／`get_active_user_memories`（只取 `is_active = true`），
 * 貼成「【自訂記憶】」段落；bot 的 `add_memory`／`get_memories` 工具
 * （`services/mcp/memory_tools.py`）寫讀的也是這兩張表。
 */

/** `MemoryResponse`（`models/linebot.py` 309–321）。`created_by`／`created_by_name` 只有群組記憶會有值。 */
export interface Memory {
  id: string
  title: string
  content: string
  is_active: boolean
  created_at: string
  updated_at: string
  /** 建立者的 `bot_users.id`，個人記憶恆為 null（`services/bot_line/memory.py` 55–95）。 */
  created_by: string | null
  created_by_name: string | null
}

/** `MemoryListResponse`（`models/linebot.py` 324–328）。後端沒有分頁，`total` 就是 `items.length`。 */
export interface MemoryListResponse {
  items: Memory[]
  total: number
}

/** 記憶掛在誰身上：群組（`bot_groups.id`）或使用者（`bot_users.id`，與 `/api/bot/users` 回的 `id` 同一個）。 */
export type MemoryTargetKind = "group" | "user"

/** `MemoryCreate`（`models/linebot.py` 296–300）：`title` 必填且最長 128，`content` 必填。 */
export interface MemoryCreate {
  title: string
  content: string
}

/** `MemoryUpdate`（`models/linebot.py` 303–307）：三個欄位都可選，沒給的不動。 */
export interface MemoryPatch {
  title?: string
  content?: string
  is_active?: boolean
}

/** `title: str = Field(..., max_length=128)`，前端先擋，免得白跑一趟 422。 */
export const MEMORY_TITLE_MAX = 128

function targetPath(kind: MemoryTargetKind, targetId: string): string {
  return kind === "group" ? `/api/bot/groups/${targetId}/memories` : `/api/bot/users/${targetId}/memories`
}

/** 群組：`GET /api/bot/groups/{group_id}/memories`；個人：`GET /api/bot/users/{user_id}/memories`。對象不存在時 404，detail 是「Group not found」／「User not found」。 */
export function listMemories(kind: MemoryTargetKind, targetId: string): Promise<MemoryListResponse> {
  return apiFetch<MemoryListResponse>(targetPath(kind, targetId))
}

/** 對應的 `POST`，回傳建立好的那一筆。 */
export function createMemory(kind: MemoryTargetKind, targetId: string, body: MemoryCreate): Promise<Memory> {
  return apiFetch<Memory>(targetPath(kind, targetId), { method: "POST", body: JSON.stringify(body) })
}

/**
 * `PUT /api/bot/memories/{id}`：群組與個人共用同一支，後端先找 `bot_group_memories`、
 * 找不到再找 `bot_user_memories`（`services/bot_line/memory.py` 124–216），所以前端不必分流。
 */
export function updateMemory(id: string, patch: MemoryPatch): Promise<Memory> {
  return apiFetch<Memory>(`/api/bot/memories/${id}`, { method: "PUT", body: JSON.stringify(patch) })
}

/** `DELETE /api/bot/memories/{id}`：回 `{status, message}` 而不是 204，找不到是 404「Memory not found」。 */
export async function deleteMemory(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/bot/memories/${id}`, { method: "DELETE" })
}

export const memoryKeys = {
  all: ["memory"] as const,
  list: (kind: MemoryTargetKind, targetId: string) => ["memory", kind, targetId] as const,
}
