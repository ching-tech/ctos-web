import { apiFetch } from "./api"

/**
 * 排程管理（`/api/scheduler/*`，全部端點都是 `require_admin`，見 ching-tech-os
 * `api/scheduler.py` 44–240）。型別對 `models/scheduled_task.py` 1–129。
 *
 * 同一份排程 bot 也能透過 MCP 工具 `manage_scheduled_task`／`list_scheduled_tasks`
 * 建立，這頁看到的就是同一份資料。
 */

export type TriggerType = "cron" | "interval"
export type ExecutorType = "agent" | "skill_script"
/** `ScheduledTaskResponse.source`（models/scheduled_task.py 124）。 */
export type TaskSource = "dynamic" | "system" | "module"
export type NotifyPlatform = "line" | "telegram"

/** `CronTriggerConfig`（models/scheduled_task.py 13–20），五個欄位都是字串、預設 `*`。 */
export interface CronTriggerConfig {
  minute: string
  hour: string
  day: string
  month: string
  day_of_week: string
}

/** `IntervalTriggerConfig`（models/scheduled_task.py 23–30），五個欄位都是整數、預設 0。 */
export interface IntervalTriggerConfig {
  weeks: number
  days: number
  hours: number
  minutes: number
  seconds: number
}

/**
 * 讀回來的 `trigger_config` 不保證欄位齊全：靜態排程由 `_parse_trigger`
 * （api/scheduler.py 286–310）組出來，cron 會略掉值是 `*` 的欄位，interval 只放
 * 換算後用得到的單位。所以一律當成兩種設定的聯集且全部選填。
 *
 * 另外 `_parse_trigger` 是把 APScheduler `CronTrigger` 的欄位整包倒出來，不是只倒
 * `CronTriggerConfig` 的那五個：本機後端的系統排程實際會多一個 `second`
 * （例如 `{hour: "3", minute: "0", second: "0"}`），所以這裡多留一格。
 */
export type TriggerConfig = Partial<CronTriggerConfig> &
  Partial<IntervalTriggerConfig> & { second?: string; year?: string }

/** `NotifyConfig`（models/scheduled_task.py 36–46）。放在 `executor_config.notify`，沒設就不推播。 */
export interface NotifyConfig {
  platform: NotifyPlatform
  target_id?: string | null
  is_group: boolean
  group_id?: string | null
}

/** `AgentExecutorConfig`（models/scheduled_task.py 49–55）。 */
export interface AgentExecutorConfig {
  agent_name: string
  prompt: string
  ctos_user_id?: number | null
  notify?: NotifyConfig | null
}

/** `SkillScriptExecutorConfig`（models/scheduled_task.py 58–65）。 */
export interface SkillScriptExecutorConfig {
  skill: string
  script: string
  input: string
  ctos_user_id?: number | null
  notify?: NotifyConfig | null
}

/**
 * 後端的 `executor_config` 是未驗證的 `dict`（`ScheduledTaskBase` 第 79 行，
 * 註解寫明兩個 ExecutorConfig 只作文件用途），所以讀回來的欄位一樣全部選填。
 */
export type ExecutorConfig = Partial<AgentExecutorConfig> & Partial<SkillScriptExecutorConfig>

/** `ScheduledTaskResponse`（models/scheduled_task.py 107–124）。 */
export interface ScheduledTask {
  id: string
  name: string
  description: string | null
  trigger_type: TriggerType
  trigger_config: TriggerConfig
  executor_type: ExecutorType
  executor_config: ExecutorConfig
  is_enabled: boolean
  created_by: number | null
  last_run_at: string | null
  next_run_at: string | null
  last_run_success: boolean | null
  last_run_error: string | null
  consecutive_failures: number
  created_at: string
  updated_at: string
  source: TaskSource
}

export interface ScheduledTaskListResponse {
  tasks: ScheduledTask[]
}

/** `ScheduledTaskCreate`（models/scheduled_task.py 71–86）：name 1–128，`is_enabled` 預設 true。 */
export interface ScheduledTaskCreate {
  name: string
  description?: string | null
  trigger_type: TriggerType
  trigger_config: TriggerConfig
  executor_type: ExecutorType
  executor_config: ExecutorConfig
  is_enabled?: boolean
}

/**
 * `ScheduledTaskUpdate`（models/scheduled_task.py 89–98）全部欄位選填。
 * 後端用 `body.model_dump(exclude_none=True)`（api/scheduler.py 149），送 null
 * 會被丟掉，所以「清空說明」這件事後端做不到，前端要送空字串。
 */
export type ScheduledTaskUpdate = Partial<ScheduledTaskCreate>

// ── 端點 ──────────────────────────────────────────────────────

/** `GET /api/scheduler/tasks`（api/scheduler.py 44–58）：沒有 query 參數，動態＋靜態一起回。 */
export function listScheduledTasks(): Promise<ScheduledTaskListResponse> {
  return apiFetch<ScheduledTaskListResponse>("/api/scheduler/tasks")
}

/** `GET /api/scheduler/tasks/{id}`（api/scheduler.py 103–115）：靜態排程查不到，回 404。 */
export function getScheduledTask(id: string): Promise<ScheduledTask> {
  return apiFetch<ScheduledTask>(`/api/scheduler/tasks/${id}`)
}

/** `POST /api/scheduler/tasks`（api/scheduler.py 64–97）：201；名稱重複回 409。 */
export function createScheduledTask(body: ScheduledTaskCreate): Promise<ScheduledTask> {
  return apiFetch<ScheduledTask>("/api/scheduler/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

/** `PUT /api/scheduler/tasks/{id}`（api/scheduler.py 121–159）。 */
export function updateScheduledTask(id: string, body: ScheduledTaskUpdate): Promise<ScheduledTask> {
  return apiFetch<ScheduledTask>(`/api/scheduler/tasks/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

/** `DELETE /api/scheduler/tasks/{id}`（api/scheduler.py 165–182）：204，沒有回應內容。 */
export function deleteScheduledTask(id: string): Promise<void> {
  return apiFetch<void>(`/api/scheduler/tasks/${id}`, { method: "DELETE" })
}

/** `PATCH /api/scheduler/tasks/{id}/toggle`（api/scheduler.py 188–215）。 */
export function toggleScheduledTask(id: string, isEnabled: boolean): Promise<ScheduledTask> {
  return apiFetch<ScheduledTask>(`/api/scheduler/tasks/${id}/toggle`, {
    method: "PATCH",
    body: JSON.stringify({ is_enabled: isEnabled }),
  })
}

/**
 * `POST /api/scheduler/tasks/{id}/run`（api/scheduler.py 221–240）：202，
 * 背景真的會跑一次 agent／腳本，不是乾跑。
 */
export function runScheduledTask(id: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/scheduler/tasks/${id}/run`, { method: "POST" })
}

/** `GET /api/skills` 的一筆（ching-tech-os `api/skills.py` 181–205）。這裡只用得到名稱與 scripts。 */
export interface SkillPickerItem {
  name: string
  description: string | null
  scripts: string[]
}

/**
 * skill／script 下拉用的最小清單。Skill 設定那條線之後會有完整的 `src/lib/skills.ts`，
 * 屆時把這支收斂過去。
 */
export function listSkillsForPicker(): Promise<{ skills: SkillPickerItem[] }> {
  return apiFetch<{ skills: SkillPickerItem[] }>("/api/skills")
}

// ── 顯示用純函式 ──────────────────────────────────────────────

const INTERVAL_UNITS: { key: keyof IntervalTriggerConfig; label: string }[] = [
  { key: "weeks", label: "週" },
  { key: "days", label: "天" },
  { key: "hours", label: "小時" },
  { key: "minutes", label: "分" },
  { key: "seconds", label: "秒" },
]

export const CRON_FIELDS: { key: keyof CronTriggerConfig; label: string }[] = [
  { key: "minute", label: "分" },
  { key: "hour", label: "時" },
  { key: "day", label: "日" },
  { key: "month", label: "月" },
  { key: "day_of_week", label: "週" },
]

export const EMPTY_CRON: CronTriggerConfig = { minute: "*", hour: "*", day: "*", month: "*", day_of_week: "*" }
export const EMPTY_INTERVAL: IntervalTriggerConfig = { weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0 }

/** 建立畫面的常用 cron 預設。 */
export const CRON_PRESETS: { label: string; config: CronTriggerConfig }[] = [
  { label: "每天 09:00", config: { ...EMPTY_CRON, minute: "0", hour: "9" } },
  { label: "每小時", config: { ...EMPTY_CRON, minute: "0" } },
  { label: "每週一 08:00", config: { ...EMPTY_CRON, minute: "0", hour: "8", day_of_week: "mon" } },
]

/**
 * cron 五欄按 APScheduler 慣例的順序排出來，缺的補 `*`。靜態排程多出來的 `second`
 * 只有不是整分（`0`／`*`）時才補在後面，不然每一列都會拖一句沒有資訊的尾巴。
 */
export function cronText(config: TriggerConfig): string {
  const base = CRON_FIELDS.map(({ key }) => config[key] ?? "*").join(" ")
  const second = config.second
  return second && second !== "0" && second !== "*" ? `${base}（秒 ${second}）` : base
}

/**
 * interval 轉人看得懂的文字。全部是 0（或沒有任何欄位）時後端會當成每 1 小時
 * （`services/task_scheduler.py` 190–191 的 `interval_fields = {"hours": 1}`）。
 */
export function intervalText(config: TriggerConfig): string {
  const parts = INTERVAL_UNITS.filter(({ key }) => Number(config[key] ?? 0) > 0).map(
    ({ key, label }) => `${Number(config[key])} ${label}`,
  )
  if (parts.length === 0) return "每 1 小時"
  return `每 ${parts.join(" ")}`
}

/** 清單「觸發」欄的文字。 */
export function triggerText(type: TriggerType, config: TriggerConfig): string {
  return type === "cron" ? `Cron ${cronText(config)}` : intervalText(config)
}

/** 清單「執行器」欄的文字。 */
export function executorText(type: ExecutorType, config: ExecutorConfig): string {
  if (type === "agent") return config.agent_name ?? "（未設定 agent）"
  if (!config.skill) return "（未設定 skill）"
  return config.script ? `${config.skill} / ${config.script}` : config.skill
}

export const SOURCE_LABEL: Record<TaskSource, string> = {
  dynamic: "動態",
  system: "系統",
  module: "模組",
}

/**
 * 只有 `source === "dynamic"` 的排程改得動：靜態排程的 id 是 `uuid5` 造出來的
 * 假 id（api/scheduler.py 264），不在資料表裡，PUT／DELETE／toggle 都會在
 * `get_scheduled_task` 那一步落到 404（api/scheduler.py 136–138、177–179、202–204）。
 */
export function isEditableTask(task: Pick<ScheduledTask, "source">): boolean {
  return task.source === "dynamic"
}

/** 編輯時只送真的改過的欄位。物件欄位比 JSON 字串，欄位順序不同不算改。 */
export function diffTaskUpdate(original: ScheduledTask, next: ScheduledTaskCreate): ScheduledTaskUpdate {
  const body: ScheduledTaskUpdate = {}
  if (next.name !== original.name) body.name = next.name
  if ((next.description ?? "") !== (original.description ?? "")) body.description = next.description ?? ""
  if (next.trigger_type !== original.trigger_type) body.trigger_type = next.trigger_type
  if (!sameJson(next.trigger_config, original.trigger_config)) body.trigger_config = next.trigger_config
  if (next.executor_type !== original.executor_type) body.executor_type = next.executor_type
  if (!sameJson(next.executor_config, original.executor_config)) body.executor_config = next.executor_config
  if ((next.is_enabled ?? true) !== original.is_enabled) body.is_enabled = next.is_enabled ?? true
  return body
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(src).sort()) out[k] = sortKeys(src[k])
    return out
  }
  return value
}

/**
 * skill_script 的 `input` 是 JSON 字串（models/scheduled_task.py 63），空字串代表沒有輸入。
 * 回傳錯誤訊息，沒問題回 null。
 */
export function validateJsonInput(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === "") return null
  try {
    JSON.parse(trimmed)
    return null
  } catch {
    return "輸入資料必須是合法的 JSON"
  }
}

/** 時間欄位全是後端的 ISO 字串；沒有就顯示破折號。 */
export function formatDateTime(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString("zh-TW", { hour12: false })
}

export const schedulerKeys = {
  all: ["scheduler"] as const,
  tasks: ["scheduler", "tasks"] as const,
  task: (id: string) => ["scheduler", "task", id] as const,
  skills: ["scheduler", "skills"] as const,
  agents: ["scheduler", "agents"] as const,
}
