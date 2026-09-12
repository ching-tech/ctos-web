import { apiFetch } from "./api"

/**
 * 簡報產生。契約對 ching-tech-os：
 * `api/presentation.py` 13–34（`PresentationRequest`）、37–46（`PresentationResponse`）、
 * 48–90（`POST /api/presentation/generate` 的三段驗證與回應組裝）、
 * `services/presentation.py` 410–553（`generate_html_presentation`）。
 *
 * **這支端點會真的做事**：沒給 `outline_json` 時打 AI 生大綱、`include_images` 開著時
 * 去外部圖庫或生圖服務抓圖（`services/presentation.py` 445–453）、跑 marp-cli
 * （timeout 180 秒，477–489）、最後把檔案寫上 NAS（511–537）。所以畫面上要先講清楚，
 * 送出後也要有等待狀態。
 *
 * **權限**：後端 `api/presentation.py` 46–50 只掛 `get_current_session`，
 * **沒有** `require_app_permission("md2ppt")`；登入就打得到。
 * 對應的 app 是 `md2ppt`（`services/permissions.py` 84–85 的工具對照、178 預設 `True`，
 * 名稱「簡報生成」在 417），所以這道閘門只在前端（`routes.tsx` 的 `RequireApp`）。
 */

/** `theme` 的四個合法值（`api/presentation.py` 63 的 `valid_themes`）。順序照畫面排，預設是後端的 `uncover`。 */
export const PRESENTATION_THEMES = ["uncover", "gaia", "gaia-invert", "default"] as const
export type PresentationTheme = (typeof PRESENTATION_THEMES)[number]

/** 主題的一句說明，字取自後端 `PresentationRequest.theme` 的 description（`api/presentation.py` 20–23）。 */
export const PRESENTATION_THEME_LABEL: Record<PresentationTheme, string> = {
  uncover: "深色投影",
  gaia: "暖色調",
  "gaia-invert": "專業藍",
  default: "簡約白",
}

/** `image_source` 的三個值（`api/presentation.py` 26–29 的 description）。後端沒有驗這一欄，認不得的值會讓抓圖靜靜失敗。 */
export const PRESENTATION_IMAGE_SOURCES = ["pexels", "huggingface", "nanobanana"] as const
export type PresentationImageSource = (typeof PRESENTATION_IMAGE_SOURCES)[number]

export const PRESENTATION_IMAGE_SOURCE_LABEL: Record<PresentationImageSource, string> = {
  pexels: "Pexels 圖庫",
  huggingface: "Hugging Face 生圖",
  nanobanana: "Gemini 生圖",
}

/** `output_format` 的兩個合法值（`api/presentation.py` 72 的 `valid_formats`）。 */
export const PRESENTATION_FORMATS = ["html", "pdf"] as const
export type PresentationFormat = (typeof PRESENTATION_FORMATS)[number]

export const PRESENTATION_FORMAT_LABEL: Record<PresentationFormat, string> = {
  html: "HTML（可直接瀏覽）",
  pdf: "PDF（可下載列印）",
}

/** `num_slides: int = Field(5, ge=2, le=20)`（`api/presentation.py` 17）。前端先擋，免得白跑一趟 422。 */
export const NUM_SLIDES_MIN = 2
export const NUM_SLIDES_MAX = 20
export const NUM_SLIDES_DEFAULT = 5

/** 檔案落在 NAS 的哪個資料夾（`services/presentation.py` 28 的 `PRESENTATION_NAS_PATH`）。 */
export const PRESENTATION_NAS_DIR = "ai-presentations"

/** 表單的兩種模式：給主題讓 AI 生大綱，或直接貼大綱 JSON。後端是「`topic` 與 `outline_json` 擇一」（`api/presentation.py` 57–58）。 */
export type PresentationMode = "topic" | "outline"

/** `PresentationRequest`（`api/presentation.py` 13–34）。沒填的欄位交給後端的預設值，不自己補。 */
export interface PresentationRequestBody {
  topic?: string
  num_slides?: number
  theme: PresentationTheme
  include_images: boolean
  image_source: PresentationImageSource
  outline_json?: string
  output_format: PresentationFormat
}

/** 表單目前的值。`numSlides` 只有 `mode === "topic"` 用得到（大綱模式頁數由大綱決定）。 */
export interface PresentationForm {
  mode: PresentationMode
  topic: string
  outlineJson: string
  numSlides: number
  theme: PresentationTheme
  includeImages: boolean
  imageSource: PresentationImageSource
  outputFormat: PresentationFormat
}

/** `PresentationResponse`（`api/presentation.py` 37–46）。`message` 是後端組好的中文句子（84–88），照原樣顯示。 */
export interface PresentationResult {
  success: boolean
  title: string
  slides_count: number
  nas_path: string
  filename: string
  format: string
  message: string
}

/**
 * 把表單值組成請求 body。
 *
 * 兩種模式**只送其中一個欄位**：
 * - 主題模式送 `topic` 與 `num_slides`（後端 `generate_outline(topic, num_slides, theme)`）。
 * - 大綱模式只送 `outline_json`，不送 `topic` 也不送 `num_slides`：
 *   後端拿到 `outline_json` 就整段跳過 AI 生大綱（`services/presentation.py` 437–443），
 *   `num_slides` 根本沒人讀，頁數是 `len(outline["slides"])`（548）。
 *   `topic` 留空即可，驗證那一關有 `outline_json` 就過（`api/presentation.py` 57–58）。
 */
export function buildGenerateBody(form: PresentationForm): PresentationRequestBody {
  const common = {
    theme: form.theme,
    include_images: form.includeImages,
    image_source: form.imageSource,
    output_format: form.outputFormat,
  }
  if (form.mode === "outline") {
    return { ...common, outline_json: form.outlineJson.trim() }
  }
  return { ...common, topic: form.topic.trim(), num_slides: form.numSlides }
}

/**
 * `POST /api/presentation/generate`。
 *
 * 400 的 detail 有三種：「請提供 topic 或 outline_json」、「無效的主題：…」、「無效的輸出格式：…」，
 * 另外 `generate_html_presentation` 丟 `ValueError` 也會變成 400（`api/presentation.py` 92–93）；
 * 其他例外一律 500「生成簡報失敗：…」（94–95）。前端一律把 detail 原樣顯示。
 */
export function generatePresentation(form: PresentationForm): Promise<PresentationResult> {
  return apiFetch<PresentationResult>("/api/presentation/generate", {
    method: "POST",
    body: JSON.stringify(buildGenerateBody(form)),
  })
}

/**
 * 大綱 JSON 的前端驗證：合法就回 null，不合法回一句要顯示的訊息。
 *
 * 後端只有 `json.loads(outline_json)`（`services/presentation.py` 439），
 * 解不開會是 500 而不是 400；而且 `outline.get("slides", [])` 對非物件會直接爆
 * （字串沒有 `.get`），所以這三關前端先擋：能解析、是物件、`slides` 是非空陣列。
 */
export function validateOutlineJson(raw: string): string | null {
  const text = raw.trim()
  if (!text) return "請貼上大綱 JSON。"
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return "這不是合法的 JSON，請檢查括號與逗號。"
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return "大綱要是一個物件，例如 { \"title\": \"標題\", \"slides\": [ … ] }。"
  }
  const slides = (parsed as { slides?: unknown }).slides
  if (!Array.isArray(slides)) return "大綱少了 slides 陣列。"
  if (slides.length === 0) return "slides 至少要有一頁。"
  return null
}

/**
 * 記住上次選的主題與輸出格式（兩個下拉都是選擇題，重打一次很煩）。
 * 主題文字與大綱不存：那是每次都不一樣的內容，留在 localStorage 反而礙事。
 *
 * 讀寫都包 try/catch：無痕視窗或關掉網站資料時 localStorage 會直接丟例外。
 */
const PREFS_KEY = "ctos-web.presentation.prefs"

export interface PresentationPrefs {
  theme: PresentationTheme
  outputFormat: PresentationFormat
}

function isTheme(v: unknown): v is PresentationTheme {
  return (PRESENTATION_THEMES as readonly unknown[]).includes(v)
}

function isFormat(v: unknown): v is PresentationFormat {
  return (PRESENTATION_FORMATS as readonly unknown[]).includes(v)
}

export function loadPresentationPrefs(): Partial<PresentationPrefs> {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<Record<keyof PresentationPrefs, unknown>>
    const prefs: Partial<PresentationPrefs> = {}
    if (isTheme(parsed.theme)) prefs.theme = parsed.theme
    if (isFormat(parsed.outputFormat)) prefs.outputFormat = parsed.outputFormat
    return prefs
  } catch {
    return {}
  }
}

export function savePresentationPrefs(prefs: PresentationPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* 存不進去就算了，不影響產生簡報 */
  }
}
