import { API_BASE, ApiError, apiFetch } from "./api"
import { clearSession, getToken } from "./token"

/**
 * 語音設定 API 客戶端。
 *
 * 契約對 ching-tech-os `api/voice_router.py`：
 *   - `GET /api/voice/voices`（38–65）
 *   - `GET /api/voice/scopes`（71–124）
 *   - `GET /api/voice/settings`（137–179）
 *   - `PUT /api/voice/settings`（182–225）
 *   - `DELETE /api/voice/settings`（228–265）
 *   - `POST /api/voice/preview`（271–314）
 *
 * 參數表的實際內容出自各引擎的 `get_config_schema()`（extends/voice/voice_tts.py
 * 127–137 Edge、149–172 Google Cloud、343–355 Gemini）。
 */

/** `VoiceInfo`（extends/voice/voice_tts.py 30–37），由 router 60–61 攤平成這四欄。 */
export interface VoiceOption {
  id: string
  name: string
  /** male／female／neutral；Gemini 用 female／male，Edge 由 edge-tts 的 Gender 轉小寫。 */
  gender: string
  /** Edge 是 locale（zh-TW），Gemini 一律 "multilingual"。 */
  language: string
}

/**
 * `config_schema` 裡的一個欄位。型別目前只有三種（`TTSEngine.get_config_schema`
 * 的 docstring，voice_tts.py 70–80）：
 *   - `select`：從 `voices` 挑（現在三個引擎的 select 欄位都是 `voice`）
 *   - `slider`：`min`／`max`／`step`／`default` 都是數字
 *   - `text`：自由輸入，可能有 `placeholder` 與 `default`
 * 後端沒有 Pydantic model 綁住這份結構，所以欄位一律當成可有可無。
 */
export interface VoiceConfigField {
  type: string
  label?: string
  required?: boolean
  min?: number
  max?: number
  step?: number
  default?: string | number
  placeholder?: string
}

export type VoiceConfigSchema = Record<string, VoiceConfigField>

/**
 * `GET /api/voice/voices` 的回傳（voice_router.py 57–65）。
 *
 * `available_engines` 就是引擎清單的來源——沒有獨立的「列引擎」端點，
 * 它由 `voice_tts.get_available_engines()`（voice_tts.py 385–388）回，
 * 目前寫死 `["edge", "gemini"]`（`google_cloud` 要另外開 billing 所以不列）。
 */
export interface VoicesResponse {
  engine: string
  voices: VoiceOption[]
  config_schema: VoiceConfigSchema
  available_engines?: string[]
}

export interface VoiceScopeGroup {
  id: string
  name: string
  platform: string
}

export interface VoiceScopeAgent {
  id: string
  name: string
}

/** `GET /api/voice/scopes`（voice_router.py 120–124）；`agents` 只有管理員拿得到（110–118）。 */
export interface VoiceScopesResponse {
  is_admin: boolean
  groups: VoiceScopeGroup[]
  agents: VoiceScopeAgent[]
}

/** 存進 `users`／`bot_groups`／`ai_agents` 的 `voice_settings`（voice_router.py 189–192）。 */
export interface VoiceSettingsValue {
  tts_engine: string
  tts_params: Record<string, unknown>
}

/**
 * `GET /api/voice/settings`（voice_router.py 175–179）。
 * `current` 是這個 scope 自己存的值，沒存過是 null；
 * `effective` 是 `resolve_voice_settings` 合併出來的實際生效值
 * （services/mcp/voice_tools.py 41–110），至少會有系統預設。
 */
export interface VoiceSettingsResponse {
  scope: string
  current: VoiceSettingsValue | null
  effective: VoiceSettingsValue
}

export type VoiceScope = "user" | "group" | "agent"

export function getVoices(engine = ""): Promise<VoicesResponse> {
  const query = engine ? `?engine=${encodeURIComponent(engine)}` : ""
  return apiFetch<VoicesResponse>(`/api/voice/voices${query}`)
}

export function getVoiceScopes(): Promise<VoiceScopesResponse> {
  return apiFetch<VoiceScopesResponse>("/api/voice/scopes")
}

/**
 * `scope_id` 是 `Query("")`（voice_router.py 140），不是 optional；不帶就是空字串，
 * 所以 user scope 一律不帶，group／agent 一定要帶。
 */
export function getVoiceSettings(scope: VoiceScope = "user", scopeId = ""): Promise<VoiceSettingsResponse> {
  const params = new URLSearchParams({ scope })
  if (scopeId) params.set("scope_id", scopeId)
  return apiFetch<VoiceSettingsResponse>(`/api/voice/settings?${params.toString()}`)
}

/** `VoiceSettingsBody`（voice_router.py 130–134）。group／agent 非管理員會拿到 403。 */
export function saveVoiceSettings(body: {
  scope: VoiceScope
  scopeId?: string | null
  ttsEngine: string
  ttsParams: Record<string, unknown>
}): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/api/voice/settings", {
    method: "PUT",
    body: JSON.stringify({
      scope: body.scope,
      scope_id: body.scopeId ?? null,
      tts_engine: body.ttsEngine,
      tts_params: body.ttsParams,
    }),
  })
}

/** `DeleteSettingsBody`（voice_router.py 228–231）：DELETE 帶 body，退回上一層繼承。 */
export function deleteVoiceSettings(scope: VoiceScope = "user", scopeId: string | null = null): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/api/voice/settings", {
    method: "DELETE",
    body: JSON.stringify({ scope, scope_id: scopeId }),
  })
}

/**
 * 試聽。回的是音訊 bytes（`media_type="audio/mp4"`，voice_router.py 310–314），
 * 不是 JSON，所以不能走 `apiFetch`；照 `bot.ts` 下載檔案那一套自己帶 Bearer 取 Blob。
 * 429「試聽冷卻中」（286–287）、503「語音功能未安裝」（292–293）、501／500 的 detail 原樣往上丟。
 */
export async function previewVoice(body: {
  engine: string
  params: Record<string, unknown>
  text: string
}): Promise<Blob> {
  const token = getToken()
  const headers = new Headers({ "Content-Type": "application/json" })
  if (token) headers.set("Authorization", `Bearer ${token}`)
  const res = await fetch(`${API_BASE}/api/voice/preview`, {
    method: "POST",
    headers,
    body: JSON.stringify({ engine: body.engine, params: body.params, text: body.text }),
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const data = (await res.json()) as { detail?: unknown }
      if (typeof data.detail === "string") detail = data.detail
    } catch { /* 非 JSON 回應 */ }
    if (res.status === 401) clearSession()
    throw new ApiError(res.status, detail)
  }
  return res.blob()
}

export const voiceKeys = {
  all: ["voice"] as const,
  voices: (engine: string) => ["voice", "voices", engine] as const,
  scopes: () => ["voice", "scopes"] as const,
  settings: (scope: VoiceScope, scopeId: string) => ["voice", "settings", scope, scopeId] as const,
}
