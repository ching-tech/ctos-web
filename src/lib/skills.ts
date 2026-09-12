import { apiFetch } from "./api"

/**
 * Skills 設定：對應 ching-tech-os `api/skills.py`（整支掛 `require_admin`，
 * 只有 `POST /{name}/scripts/{script}/run` 是 `get_current_session`（527–528），
 * 那一支等於讓網頁跑伺服器腳本，這裡不做 UI，畫面只列出 scripts 名稱）。
 *
 * 欄位以 `skills/__init__.py` 的 `Skill` dataclass（55–75）與各端點的 return 為準。
 */

/** `Skill.source`（`skills/__init__.py` 74）：native｜imported｜claude-code，載入時還會給 external。字串照後端原樣顯示。 */
export type SkillSource = string

/**
 * `GET /api/skills` 的每一筆（`api/skills.py` 181–206）。
 *
 * `requires_app` 可以是單一字串、清單或 null，清單語意是**任一**
 * （`skills/__init__.py` 的 `has_required_app` 103–105：`any(...)`，不是 all）。
 */
export interface SkillSummary {
  name: string
  description: string
  requires_app: string | string[] | null
  tools_count: number
  has_prompt: boolean
  references: string[]
  scripts: string[]
  scripts_count: number
  assets: string[]
  source: SkillSource
  license: string
  compatibility: string
  has_module: boolean
}

export interface SkillListResponse {
  skills: SkillSummary[]
}

/** `get_scripts_info` → `ScriptRunner.list_scripts`（`skills/script_runner.py` 93–97）。 */
export interface SkillScriptInfo {
  name: string
  path: string
  description: string
}

/**
 * `GET /api/skills/{name}`（`api/skills.py` 208–243）：清單那些欄位再加下面這些，
 * 但**沒有** `scripts_count`（清單才有）。找不到是 404，detail 為 `Skill '<name>' not found`。
 *
 * `meta` 是 skill 目錄裡的 `_meta.json`（`services/hub_meta.py` 86–102），
 * 只有從 Hub 裝進來的才有，讀不到時後端給 null，沒有 skill_dir 時給 `{}`。
 */
export interface SkillDetail extends Omit<SkillSummary, "scripts_count"> {
  allowed_tools: string[]
  mcp_servers: string[]
  prompt: string
  script_tools: SkillScriptInfo[]
  metadata: Record<string, unknown> | null
  contributes: unknown
  meta: Record<string, unknown> | null
}

/**
 * `SkillUpdateRequest`（`api/skills.py` 145–149）。三個欄位都可選，
 * 後端用 `model_dump(exclude_unset=True)` 分辨「沒送」與「送 null」（271），
 * **一個欄位都沒送會 400「No fields to update」**（273–274），所以沒變動就不要送。
 */
export interface SkillUpdate {
  requires_app?: string | string[] | null
  allowed_tools?: string[]
  mcp_servers?: string[]
}

/** `PUT` 成功只回這四個欄位（`api/skills.py` 281–286），不是完整的 detail。 */
export interface SkillUpdateResponse {
  name: string
  requires_app: string | string[] | null
  allowed_tools: string[]
  mcp_servers: string[]
}

/** Hub 來源（`api/skills.py` 17 的 `HubSource` Literal）。 */
export type HubSourceId = "clawhub" | "skillhub"

/** `GET /api/skills/hub/sources`（169–179）：ClawHub 永遠在，SkillHub 看 feature flag。 */
export interface HubSourceInfo {
  id: HubSourceId
  name: string
  enabled: boolean
}

/**
 * `POST /hub/search` 的結果列（307–364）。後端把 Hub 的 JSON 原樣轉發，
 * 只保證補上 `source`，其餘欄位名稱兩家 Hub 不一致（舊桌面 `agent-settings.js`
 * 1294–1301 就是逐個 fallback），所以全部可選。
 */
export interface HubSearchResult {
  /** ClawHub 給的全域唯一 id（形如 `clawhub:kd7bm…`）。同一個 slug 可能有好幾個作者各發一份，只有這個是唯一的。 */
  id?: string
  slug?: string
  name?: string
  displayName?: string
  summary?: string
  description?: string
  /** 實測 ClawHub 的搜尋結果這一欄是 null，版本要由後端在 install 時抓 latest。 */
  version?: string | null
  score?: number
  /** ClawHub 給的是 epoch 毫秒，不是字串。 */
  updatedAt?: string | number
  source?: HubSourceId
  owner?: { handle?: string; displayName?: string } | null
  ownerHandle?: string
}

/** 指定 source 時只有 `query` 與 `results`（337）；不指定時多 `sources` 與 `errors`（360–364）。 */
export interface HubSearchResponse {
  query: string
  results: HubSearchResult[]
  sources?: string[]
  errors?: string[] | null
}

/** `POST /hub/inspect`（368–404）。`content` 是 ZIP 裡的 SKILL.md，抓不到時是空字串。 */
export interface HubInspectResponse {
  slug: string
  source: HubSourceId
  content: string
  skill: Record<string, unknown>
  owner: Record<string, unknown>
  latestVersion: Record<string, unknown>
}

/** `POST /hub/install`（410–520）。已安裝會 409，detail 是「Skill '<name>' 已安裝。如需更新請先移除。」 */
export interface HubInstallResponse {
  installed: string
  version: string
  source: HubSourceId
  path: string
  description: string
  scripts_count: number
}

/** `GET /{name}/files/{path}`（599–610）與 `/references/{path}`（614–625）都回這個形狀。 */
export interface SkillFileResponse {
  path: string
  content: string
}

/** `POST /api/skills/reload`（297–302）回重新載入的 skill 數量。 */
export interface SkillReloadResponse {
  reloaded: number
}

/** `DELETE /api/skills/{name}`（287–295）。 */
export interface SkillDeleteResponse {
  removed: string
}

function skillPath(name: string, suffix = ""): string {
  return `/api/skills/${encodeURIComponent(name)}${suffix}`
}

export function listSkills(): Promise<SkillListResponse> {
  return apiFetch<SkillListResponse>("/api/skills")
}

export function getSkill(name: string): Promise<SkillDetail> {
  return apiFetch<SkillDetail>(skillPath(name))
}

export function updateSkill(name: string, patch: SkillUpdate): Promise<SkillUpdateResponse> {
  return apiFetch<SkillUpdateResponse>(skillPath(name), { method: "PUT", body: JSON.stringify(patch) })
}

export function deleteSkill(name: string): Promise<SkillDeleteResponse> {
  return apiFetch<SkillDeleteResponse>(skillPath(name), { method: "DELETE" })
}

export function reloadSkills(): Promise<SkillReloadResponse> {
  return apiFetch<SkillReloadResponse>("/api/skills/reload", { method: "POST" })
}

export function listHubSources(): Promise<{ sources: HubSourceInfo[] }> {
  return apiFetch<{ sources: HubSourceInfo[] }>("/api/skills/hub/sources")
}

/** `source` 給 null（或不給）＝兩家一起搜，後端併結果（339–364）。 */
export function hubSearch(query: string, source: HubSourceId | null = null): Promise<HubSearchResponse> {
  return apiFetch<HubSearchResponse>("/api/skills/hub/search", {
    method: "POST",
    body: JSON.stringify({ query, source }),
  })
}

export function hubInspect(slug: string, source: HubSourceId): Promise<HubInspectResponse> {
  return apiFetch<HubInspectResponse>("/api/skills/hub/inspect", {
    method: "POST",
    body: JSON.stringify({ slug, source }),
  })
}

/** `version` 不給就裝 Hub 上的 latest（`api/skills.py` 448）。 */
export function hubInstall(name: string, source: HubSourceId, version?: string | null): Promise<HubInstallResponse> {
  const body: { name: string; source: HubSourceId; version?: string } = { name, source }
  if (version) body.version = version
  return apiFetch<HubInstallResponse>("/api/skills/hub/install", { method: "POST", body: JSON.stringify(body) })
}

/** 讀 skill 目錄底下的檔案（references/、scripts/、assets/ 都走這支）。 */
export function getSkillFile(name: string, path: string): Promise<SkillFileResponse> {
  return apiFetch<SkillFileResponse>(skillPath(name, `/files/${path.split("/").map(encodeURIComponent).join("/")}`))
}

/** 舊的 references 專用端點，後端標「向下相容」；讀不到時 detail 是「Reference not found」。 */
export function getSkillReference(name: string, path: string): Promise<SkillFileResponse> {
  return apiFetch<SkillFileResponse>(
    skillPath(name, `/references/${path.split("/").map(encodeURIComponent).join("/")}`),
  )
}

/**
 * 把 `requires_app` 正規化成 app id 清單，對齊後端的 `required_apps`
 * （`skills/__init__.py` 77–90）：null、空字串、空清單都是「不需要」，
 * 清單裡的空字串與非字串直接丟掉（SKILL.md 是人手寫的）。
 */
export function requiredApps(requiresApp: string | string[] | null | undefined): string[] {
  if (requiresApp == null) return []
  if (typeof requiresApp === "string") return requiresApp ? [requiresApp] : []
  if (Array.isArray(requiresApp)) return requiresApp.filter((a): a is string => typeof a === "string" && a !== "")
  return []
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/**
 * 算出要送的 patch：只放真的變了的欄位，全都沒變回 null（呼叫端就不要送，
 * 否則後端 400「No fields to update」）。
 *
 * `requires_app` 有值時一律送清單，因為清單語意是「任一」而且後端兩種都收
 * （`SkillUpdateRequest` 145）；清空時送 null，對齊「沒有宣告就通過」。
 * 比對只看正規化後的內容，所以把單一字串 `"erp"` 改成 `["erp"]` 不算變動。
 */
export function skillUpdatePatch(
  original: Pick<SkillDetail, "requires_app" | "allowed_tools" | "mcp_servers">,
  draft: { requires_app: string[]; allowed_tools: string[]; mcp_servers: string[] },
): SkillUpdate | null {
  const patch: SkillUpdate = {}
  if (!sameList(requiredApps(original.requires_app), draft.requires_app)) {
    patch.requires_app = draft.requires_app.length > 0 ? draft.requires_app : null
  }
  if (!sameList(original.allowed_tools, draft.allowed_tools)) patch.allowed_tools = draft.allowed_tools
  if (!sameList(original.mcp_servers, draft.mcp_servers)) patch.mcp_servers = draft.mcp_servers
  return Object.keys(patch).length > 0 ? patch : null
}

export const skillKeys = {
  all: ["skills"] as const,
  list: () => ["skills", "list"] as const,
  detail: (name: string) => ["skills", "detail", name] as const,
  file: (name: string, path: string) => ["skills", "file", name, path] as const,
  hubSources: () => ["skills", "hub", "sources"] as const,
}
