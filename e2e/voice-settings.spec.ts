import { expect, test } from "@playwright/test"
import { adminFixture, mockApi, mockVoice, seedToken, voiceScopeFixtures } from "./helpers"

const GROUP = voiceScopeFixtures.groups[0]
// edge-tts 的 FriendlyName 本身沒有性別，所以下拉會補上「（男聲）」。
const EDGE_FEMALE = "Microsoft HsiaoChen Online (Natural) - Chinese (Taiwan)（女聲）"
const EDGE_MALE = "Microsoft YunJhe Online (Natural) - Chinese (Taiwan)（男聲）"

async function openSettings(page: import("@playwright/test").Page) {
  await page.goto("/settings")
  // CardTitle 是 div 不是 heading（components/ui/card.tsx 35–46），用表單裡的引擎下拉當就緒訊號。
  await expect(page.getByRole("combobox", { name: "引擎" })).toBeVisible()
}

test("沒有自己的設定時，顯示繼承來的「目前生效」摘要", async ({ page }) => {
  await mockApi(page)
  await mockVoice(page)
  await seedToken(page)
  await openSettings(page)

  const summary = page.getByTestId("voice-effective")
  await expect(summary).toContainText("引擎：Edge TTS")
  await expect(summary).toContainText("語音角色：zh-TW-HsiaoChenNeural")
  await expect(summary).toContainText("這一層沒有設定，用的是繼承來的值。")
  // 沒存過就沒有東西可以清
  await expect(page.getByRole("button", { name: "清除" })).toBeDisabled()
})

test("存過的設定會帶進表單，摘要也改成這一層自己的值", async ({ page }) => {
  await mockApi(page)
  await mockVoice(page, {
    stored: { user: { tts_engine: "gemini", tts_params: { voice: "Puck", instructions: "用沉穩的語氣朗讀" } } },
  })
  await seedToken(page)
  await openSettings(page)

  await expect(page.getByTestId("voice-effective")).toContainText("這一層有自己的設定。")
  await expect(page.getByRole("combobox", { name: "引擎" })).toContainText("Gemini")
  await expect(page.getByRole("combobox", { name: "語音角色" })).toContainText("Puck（男聲）")
  await expect(page.getByLabel("朗讀指示")).toHaveValue("用沉穩的語氣朗讀")
  await expect(page.getByRole("button", { name: "清除" })).toBeEnabled()
})

test("切引擎會重抓語音角色，也照新的 config_schema 換一組欄位", async ({ page }) => {
  await mockApi(page)
  await mockVoice(page)
  await seedToken(page)
  const asked: string[] = []
  page.on("request", (r) => {
    const url = new URL(r.url())
    if (url.pathname.endsWith("/api/voice/voices")) asked.push(url.searchParams.get("engine") ?? "")
  })
  await openSettings(page)
  // Edge 的 schema 只有語音角色一欄（voice_tts.py 127–137）
  await expect(page.getByRole("combobox", { name: "語音角色" })).toBeVisible()
  await expect(page.getByLabel("朗讀指示")).toHaveCount(0)

  await page.getByRole("combobox", { name: "引擎" }).click()
  await page.getByRole("option", { name: "Gemini" }).click()

  await expect.poll(() => asked).toContain("gemini")
  // Gemini 多一個文字欄位，而且預設值就填好了（voice_tts.py 343–355）
  await expect(page.getByLabel("朗讀指示")).toHaveValue("用溫柔自然的語氣朗讀")
  await page.getByRole("combobox", { name: "語音角色" }).click()
  // Gemini 的名稱自己就帶性別，不會變成「Kore（女聲）（女聲）」
  await expect(page.getByRole("option", { name: "Kore（女聲）", exact: true })).toBeVisible()
  await expect(page.getByRole("option", { name: EDGE_FEMALE })).toHaveCount(0)
})

test("slider 型別的欄位照 min／max／step 產出，預設值不必動就送得出去", async ({ page }) => {
  await mockApi(page)
  await mockVoice(page, {
    availableEngines: ["edge", "gemini", "google_cloud"],
    stored: { user: { tts_engine: "google_cloud", tts_params: { voice: "cmn-TW-Standard-A" } } },
  })
  await seedToken(page)
  const puts: unknown[] = []
  page.on("request", (r) => {
    if (r.url().endsWith("/api/voice/settings") && r.method() === "PUT") puts.push(r.postDataJSON())
  })
  await openSettings(page)

  const speed = page.getByLabel("語速")
  await expect(speed).toHaveAttribute("type", "range")
  await expect(speed).toHaveAttribute("min", "0.5")
  await expect(speed).toHaveAttribute("max", "2")
  await expect(speed).toHaveAttribute("step", "0.1")
  await expect(speed).toHaveValue("1")

  await speed.fill("1.5")
  await page.getByRole("button", { name: "儲存" }).click()

  await expect.poll(() => puts).toEqual([
    {
      scope: "user",
      scope_id: null,
      tts_engine: "google_cloud",
      tts_params: { voice: "cmn-TW-Standard-A", speed: 1.5, pitch: 0 },
    },
  ])
})

test("儲存送出的是後端要的 snake_case body，存完摘要跟著變", async ({ page }) => {
  await mockApi(page)
  await mockVoice(page)
  await seedToken(page)
  const puts: unknown[] = []
  page.on("request", (r) => {
    if (r.url().endsWith("/api/voice/settings") && r.method() === "PUT") puts.push(r.postDataJSON())
  })
  await openSettings(page)

  await page.getByRole("combobox", { name: "語音角色" }).click()
  await page.getByRole("option", { name: EDGE_MALE }).click()
  await page.getByRole("button", { name: "儲存" }).click()

  await expect(page.getByText("已儲存。")).toBeVisible()
  await expect.poll(() => puts).toEqual([
    { scope: "user", scope_id: null, tts_engine: "edge", tts_params: { voice: "zh-TW-YunJheNeural" } },
  ])
  await expect(page.getByTestId("voice-effective")).toContainText("語音角色：zh-TW-YunJheNeural")
})

test("清除要先確認，確認後退回繼承值", async ({ page }) => {
  await mockApi(page)
  await mockVoice(page, { stored: { user: { tts_engine: "edge", tts_params: { voice: "zh-TW-YunJheNeural" } } } })
  await seedToken(page)
  const deletes: unknown[] = []
  page.on("request", (r) => {
    if (r.url().endsWith("/api/voice/settings") && r.method() === "DELETE") deletes.push(r.postDataJSON())
  })
  await openSettings(page)
  await expect(page.getByTestId("voice-effective")).toContainText("語音角色：zh-TW-YunJheNeural")

  await page.getByRole("button", { name: "清除" }).click()
  await expect(page.getByRole("alertdialog")).toContainText("確定清除這一層的語音設定？")
  await page.getByRole("button", { name: "返回" }).click()
  await expect.poll(() => deletes).toEqual([])

  await page.getByRole("button", { name: "清除" }).click()
  await page.getByRole("button", { name: "確定清除" }).click()

  await expect.poll(() => deletes).toEqual([{ scope: "user", scope_id: null }])
  await expect(page.getByTestId("voice-effective")).toContainText("這一層沒有設定，用的是繼承來的值。")
  await expect(page.getByTestId("voice-effective")).toContainText("語音角色：zh-TW-HsiaoChenNeural")
})

test("試聽成功時掛上音訊播放器", async ({ page }) => {
  await mockApi(page)
  await mockVoice(page)
  await seedToken(page)
  await openSettings(page)

  await expect(page.getByTestId("voice-preview-audio")).toHaveCount(0)
  await page.getByLabel("試聽文字").fill("今天天氣真好")
  await page.getByRole("button", { name: "試聽" }).click()

  const audio = page.getByTestId("voice-preview-audio")
  await expect(audio).toBeVisible()
  await expect(audio).toHaveAttribute("src", /^blob:/)
})

test("試聽冷卻的 429 detail 原樣顯示", async ({ page }) => {
  await mockApi(page)
  await mockVoice(page, { previewStatus: 429, previewDetail: "試聽冷卻中，請稍後再試" })
  await seedToken(page)
  await openSettings(page)

  await page.getByRole("button", { name: "試聽" }).click()

  await expect(page.getByRole("alert")).toContainText("試聽冷卻中，請稍後再試")
  await expect(page.getByTestId("voice-preview-audio")).toHaveCount(0)
})

test("語音功能沒裝時，503 的 detail 也原樣顯示", async ({ page }) => {
  await mockApi(page)
  await mockVoice(page, { previewStatus: 503, previewDetail: "語音功能未安裝" })
  await seedToken(page)
  await openSettings(page)

  await page.getByRole("button", { name: "試聽" }).click()

  await expect(page.getByRole("alert")).toContainText("語音功能未安裝")
})

test("非管理員沒有「套用範圍」選擇", async ({ page }) => {
  await mockApi(page)
  await mockVoice(page)
  await seedToken(page)
  await openSettings(page)

  await expect(page.getByRole("combobox", { name: "套用範圍" })).toHaveCount(0)
  await expect(page.getByRole("combobox", { name: "引擎" })).toBeVisible()
})

test("管理員可以切到群組，切過去會重抓那個 scope 的設定", async ({ page }) => {
  await mockApi(page, { user: { ...adminFixture } })
  await mockVoice(page, {
    isAdmin: true,
    stored: { [`group:${GROUP.id}`]: { tts_engine: "gemini", tts_params: { voice: "Kore" } } },
  })
  await seedToken(page)
  const gets: string[] = []
  page.on("request", (r) => {
    const url = new URL(r.url())
    if (url.pathname.endsWith("/api/voice/settings") && r.method() === "GET") {
      gets.push(`${url.searchParams.get("scope")}:${url.searchParams.get("scope_id") ?? ""}`)
    }
  })
  await openSettings(page)
  await expect(page.getByTestId("voice-effective")).toContainText("這一層沒有設定，用的是繼承來的值。")

  await page.getByRole("combobox", { name: "套用範圍" }).click()
  await page.getByRole("option", { name: `群組：${GROUP.name}` }).click()

  await expect.poll(() => gets).toContain(`group:${GROUP.id}`)
  await expect(page.getByTestId("voice-effective")).toContainText("這一層有自己的設定。")
  await expect(page.getByRole("combobox", { name: "引擎" })).toContainText("Gemini")
  await expect(page.getByRole("combobox", { name: "語音角色" })).toContainText("Kore（女聲）")
  // 管理員的 Agent 也在同一份清單裡（voice_router.py 110–118）
  await page.getByRole("combobox", { name: "套用範圍" }).click()
  await expect(page.getByRole("option", { name: "Agent：小助手" })).toBeVisible()
})
