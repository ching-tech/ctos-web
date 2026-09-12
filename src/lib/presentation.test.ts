import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import {
  buildGenerateBody,
  generatePresentation,
  loadPresentationPrefs,
  NUM_SLIDES_DEFAULT,
  savePresentationPrefs,
  validateOutlineJson,
  type PresentationForm,
} from "./presentation"
import { setToken } from "./token"

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  setToken("T")
})
afterEach(() => vi.unstubAllGlobals())

const baseForm: PresentationForm = {
  mode: "topic",
  topic: "  泵浦保養三步驟  ",
  outlineJson: "",
  numSlides: NUM_SLIDES_DEFAULT,
  theme: "uncover",
  includeImages: true,
  imageSource: "pexels",
  outputFormat: "html",
}

function okResponse(json: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(json), { status }))
}

describe("buildGenerateBody", () => {
  it("主題模式送 topic 與 num_slides，不送 outline_json", () => {
    const body = buildGenerateBody({ ...baseForm, numSlides: 8 })
    expect(body).toEqual({
      topic: "泵浦保養三步驟",
      num_slides: 8,
      theme: "uncover",
      include_images: true,
      image_source: "pexels",
      output_format: "html",
    })
    expect("outline_json" in body).toBe(false)
  })

  it("大綱模式只送 outline_json，topic 與 num_slides 都不送", () => {
    const body = buildGenerateBody({
      ...baseForm,
      mode: "outline",
      outlineJson: '  {"title":"標題","slides":[{"title":"第一頁"}]}  ',
      numSlides: 12,
      theme: "default",
      outputFormat: "pdf",
    })
    expect(body).toEqual({
      outline_json: '{"title":"標題","slides":[{"title":"第一頁"}]}',
      theme: "default",
      include_images: true,
      image_source: "pexels",
      output_format: "pdf",
    })
    expect("topic" in body).toBe(false)
    expect("num_slides" in body).toBe(false)
  })

  it("不配圖時 include_images 為 false，image_source 照樣帶（後端讀得到但用不到）", () => {
    const body = buildGenerateBody({ ...baseForm, includeImages: false, imageSource: "nanobanana" })
    expect(body.include_images).toBe(false)
    expect(body.image_source).toBe("nanobanana")
  })
})

describe("generatePresentation", () => {
  it("POST 到 /api/presentation/generate，body 就是 buildGenerateBody 的結果", async () => {
    const fn = okResponse({
      success: true,
      title: "泵浦保養三步驟",
      slides_count: 5,
      nas_path: "ai-presentations/泵浦保養三步驟_20260912_101500.html",
      filename: "泵浦保養三步驟_20260912_101500.html",
      format: "html",
      message: "已生成《泵浦保養三步驟》HTML 簡報，共 5 頁",
    })
    vi.stubGlobal("fetch", fn)

    const result = await generatePresentation(baseForm)
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/presentation/generate`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual(buildGenerateBody(baseForm))
    expect(result.nas_path).toBe("ai-presentations/泵浦保養三步驟_20260912_101500.html")
    expect(result.slides_count).toBe(5)
  })

  it("400 的 detail 原樣丟出來", async () => {
    vi.stubGlobal("fetch", okResponse({ detail: "無效的主題：marp，可用主題：default, gaia, gaia-invert, uncover" }, 400))
    await expect(generatePresentation({ ...baseForm })).rejects.toMatchObject({
      status: 400,
      detail: "無效的主題：marp，可用主題：default, gaia, gaia-invert, uncover",
    })
  })
})

describe("validateOutlineJson", () => {
  it("合法的大綱回 null", () => {
    expect(validateOutlineJson('{"title":"標題","slides":[{"title":"第一頁"}]}')).toBeNull()
  })

  it("空白、壞 JSON、非物件、少 slides、空 slides 各有訊息", () => {
    expect(validateOutlineJson("   ")).toBe("請貼上大綱 JSON。")
    expect(validateOutlineJson("{title:")).toBe("這不是合法的 JSON，請檢查括號與逗號。")
    expect(validateOutlineJson("[1,2]")).toContain("大綱要是一個物件")
    expect(validateOutlineJson('"字串"')).toContain("大綱要是一個物件")
    expect(validateOutlineJson('{"title":"標題"}')).toBe("大綱少了 slides 陣列。")
    expect(validateOutlineJson('{"slides":[]}')).toBe("slides 至少要有一頁。")
  })
})

describe("偏好", () => {
  it("存了就讀得回來", () => {
    savePresentationPrefs({ theme: "gaia-invert", outputFormat: "pdf" })
    expect(loadPresentationPrefs()).toEqual({ theme: "gaia-invert", outputFormat: "pdf" })
  })

  it("沒存過回空物件，認不得的值直接丟掉", () => {
    expect(loadPresentationPrefs()).toEqual({})
    localStorage.setItem("ctos-web.presentation.prefs", JSON.stringify({ theme: "marp", outputFormat: "pptx" }))
    expect(loadPresentationPrefs()).toEqual({})
  })

  it("localStorage 壞掉時讀寫都不丟例外", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked") },
      setItem: () => { throw new Error("blocked") },
      removeItem: () => { throw new Error("blocked") },
    })
    expect(loadPresentationPrefs()).toEqual({})
    expect(() => savePresentationPrefs({ theme: "uncover", outputFormat: "html" })).not.toThrow()
  })
})
