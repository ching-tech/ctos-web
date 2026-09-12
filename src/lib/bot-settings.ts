import { apiFetch } from "./api"
import type { Platform } from "./bot"

/** 憑證欄位名稱，對應 ching-tech-os `services/bot_settings.py` 的 `PLATFORM_KEYS`（20–23）。 */
export type BotSettingsField =
  | "channel_secret"
  | "channel_access_token"
  | "bot_token"
  | "webhook_secret"
  | "admin_chat_id"

/** 欄位來源：資料庫、環境變數或未設定（`api/bot_settings.py` 的 `FieldStatus`，84–89）。 */
export type BotSettingsSource = "database" | "env" | "none"

export interface BotFieldStatus {
  has_value: boolean
  masked_value: string
  source: BotSettingsSource
  updated_at: string | null
}

/** `BotSettingsStatusResponse`（`api/bot_settings.py` 92–96）。 */
export interface BotSettingsStatus {
  platform: Platform
  fields: Partial<Record<BotSettingsField, BotFieldStatus>>
  proactive_push_enabled: boolean
}

/** `UpdateBotSettingsRequest`（`api/bot_settings.py` 68–75）。 */
export type BotSettingsUpdate = Partial<Record<BotSettingsField, string>> & {
  proactive_push_enabled?: boolean
}

/** `UpdateBotSettingsResponse`（`api/bot_settings.py` 78–81）。 */
export interface BotSettingsUpdateResult {
  success: boolean
  message: string
}

/** `BotSettingsDeleteResponse`（`api/bot_settings.py` 99–101）。 */
export interface BotSettingsDeleteResult {
  deleted: number
}

/** `TestConnectionResponse`（`api/bot_settings.py` 104–107）。 */
export interface BotSettingsTestResult {
  success: boolean
  message: string
}

/** 各平台的欄位順序（`services/bot_settings.py` 20–23）。 */
export const PLATFORM_FIELDS = {
  line: ["channel_secret", "channel_access_token"],
  telegram: ["bot_token", "webhook_secret", "admin_chat_id"],
} as const satisfies Record<Platform, readonly BotSettingsField[]>

/** 後端加密儲存、只回遮罩值的欄位（`services/bot_settings.py` 的 `ENCRYPTED_KEYS`，26）。 */
export const SENSITIVE_FIELDS: readonly BotSettingsField[] = [
  "channel_secret",
  "channel_access_token",
  "bot_token",
  "webhook_secret",
]

export function isSensitiveField(field: BotSettingsField): boolean {
  return SENSITIVE_FIELDS.includes(field)
}

export const FIELD_LABEL: Record<BotSettingsField, string> = {
  channel_secret: "Channel Secret",
  channel_access_token: "Channel Access Token",
  bot_token: "Bot Token",
  webhook_secret: "Webhook Secret",
  admin_chat_id: "管理員 Chat ID",
}

export const SOURCE_LABEL: Record<BotSettingsSource, string> = {
  database: "資料庫",
  env: "環境變數",
  none: "未設定",
}

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source as BotSettingsSource] ?? source
}

export const botSettingsKeys = {
  all: ["bot-settings"] as const,
  platform: (platform: Platform) => ["bot-settings", platform] as const,
}

export function getBotSettings(platform: Platform): Promise<BotSettingsStatus> {
  return apiFetch<BotSettingsStatus>(`/api/admin/bot-settings/${platform}`)
}

/**
 * 只送有值的欄位。後端 `update_settings`（`api/bot_settings.py` 126–152）會把空字串過濾掉，
 * 但送空字串會讓「至少需要一個非空欄位」的 400 更難看懂，所以在前端就不送。
 */
export function updateBotSettings(platform: Platform, patch: BotSettingsUpdate): Promise<BotSettingsUpdateResult> {
  const body: BotSettingsUpdate = {}
  for (const field of Object.keys(FIELD_LABEL) as BotSettingsField[]) {
    const value = patch[field]
    if (typeof value === "string" && value !== "") body[field] = value
  }
  if (typeof patch.proactive_push_enabled === "boolean") {
    body.proactive_push_enabled = patch.proactive_push_enabled
  }
  return apiFetch<BotSettingsUpdateResult>(`/api/admin/bot-settings/${platform}`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export function deleteBotSettings(platform: Platform): Promise<BotSettingsDeleteResult> {
  return apiFetch<BotSettingsDeleteResult>(`/api/admin/bot-settings/${platform}`, { method: "DELETE" })
}

/** 用「目前存的」憑證測試（後端 `test_connection` 自己去 `get_bot_credentials`，不吃 body，165–184）。 */
export function testBotConnection(platform: Platform): Promise<BotSettingsTestResult> {
  return apiFetch<BotSettingsTestResult>(`/api/admin/bot-settings/${platform}/test`, { method: "POST" })
}
