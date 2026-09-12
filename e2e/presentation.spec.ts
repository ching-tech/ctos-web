import { expect, test, type TestInfo } from "@playwright/test"
import {
  mockApi,
  mockPresentation,
  presentationResultFixture,
  presentationUserFixture,
  seedToken,
  trapUnmockedApi,
} from "./helpers"

/** 手機版側邊欄收在抽屜裡，要先按開才看得到選單。 */
async function openSidebar(page: import("@playwright/test").Page, testInfo: TestInfo) {
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: /Toggle Sidebar/i }).click()
}

/** header 的主題切換鈕 aria-label 是「切換主題」，`getByLabel("主題")` 會一起撞上，所以用 role 加精確名稱。 */
function topicBox(page: import("@playwright/test").Page) {
  return page.getByRole("textbox", { name: "主題", exact: true })
}

const OUTLINE = '{"title":"泵浦保養三步驟","slides":[{"layout":"title","title":"泵浦保養三步驟"},{"layout":"content","title":"停機斷電"}]}'

test.describe("主題模式", () => {
  test("表單值原樣組成 body 送出", async ({ page }) => {
    const unmocked = await trapUnmockedApi(page)
    await mockApi(page, { user: presentationUserFixture })
    await mockPresentation(page)
    await seedToken(page)
    await page.goto("/presentation")

    // 送出前先講清楚這一趟會真的做事
    await expect(page.getByText("送出會真的產生一份檔案")).toBeVisible()

    await topicBox(page).fill("泵浦保養三步驟")

    // 頁數 slider：預設 5，右鍵三下到 8
    const slider = page.getByRole("slider", { name: "頁數" })
    await slider.focus()
    for (let i = 0; i < 3; i += 1) await slider.press("ArrowRight")
    await expect(page.getByText("頁數：8 頁")).toBeVisible()

    await page.getByRole("radio", { name: "default" }).click()
    await page.getByRole("switch", { name: "自動配圖" }).click()
    await page.getByRole("radio", { name: "PDF（可下載列印）" }).click()

    const request = page.waitForRequest((r) => r.url().endsWith("/api/presentation/generate"))
    await page.getByRole("button", { name: "產生簡報" }).click()
    const sent = (await request).postDataJSON()

    expect(sent).toEqual({
      topic: "泵浦保養三步驟",
      num_slides: 8,
      theme: "default",
      include_images: false,
      image_source: "pexels",
      output_format: "pdf",
    })
    expect(unmocked).toEqual([])
  })

  test("主題空白時送不出去", async ({ page }) => {
    await mockApi(page, { user: presentationUserFixture })
    await mockPresentation(page)
    await seedToken(page)
    await page.goto("/presentation")

    await expect(page.getByRole("button", { name: "產生簡報" })).toBeDisabled()
    await topicBox(page).fill("泵浦保養三步驟")
    await expect(page.getByRole("button", { name: "產生簡報" })).toBeEnabled()
  })

  test("關掉配圖之後圖片來源不能選", async ({ page }) => {
    await mockApi(page, { user: presentationUserFixture })
    await mockPresentation(page)
    await seedToken(page)
    await page.goto("/presentation")

    await expect(page.getByRole("radio", { name: "Pexels 圖庫" })).toBeEnabled()
    await page.getByRole("switch", { name: "自動配圖" }).click()
    await expect(page.getByRole("radio", { name: "Pexels 圖庫" })).toBeDisabled()
  })
})

test.describe("大綱模式", () => {
  test("JSON 不合法就擋下來，一個請求都不送", async ({ page }) => {
    await mockApi(page, { user: presentationUserFixture })
    await mockPresentation(page)
    await seedToken(page)

    const sentPaths: string[] = []
    page.on("request", (r) => {
      if (r.url().includes("/api/presentation/generate")) sentPaths.push(r.url())
    })

    await page.goto("/presentation")
    await page.getByRole("tab", { name: "用大綱 JSON" }).click()

    await page.getByRole("textbox", { name: "大綱 JSON" }).fill("{ 這不是 JSON")
    await page.getByRole("button", { name: "產生簡報" }).click()
    await expect(page.getByText("這不是合法的 JSON，請檢查括號與逗號。")).toBeVisible()

    await page.getByRole("textbox", { name: "大綱 JSON" }).fill('{"title":"標題"}')
    await page.getByRole("button", { name: "產生簡報" }).click()
    await expect(page.getByText("大綱少了 slides 陣列。")).toBeVisible()

    expect(sentPaths).toEqual([])
  })

  test("合法的大綱只送 outline_json，不送 topic 也不送 num_slides", async ({ page }) => {
    const unmocked = await trapUnmockedApi(page)
    await mockApi(page, { user: presentationUserFixture })
    await mockPresentation(page)
    await seedToken(page)
    await page.goto("/presentation")

    await page.getByRole("tab", { name: "用大綱 JSON" }).click()
    await page.getByRole("textbox", { name: "大綱 JSON" }).fill(OUTLINE)

    const request = page.waitForRequest((r) => r.url().endsWith("/api/presentation/generate"))
    await page.getByRole("button", { name: "產生簡報" }).click()
    const sent = (await request).postDataJSON()

    expect(sent).toEqual({
      outline_json: OUTLINE,
      theme: "uncover",
      include_images: true,
      image_source: "pexels",
      output_format: "html",
    })
    expect(unmocked).toEqual([])
  })
})

test("成功後列出標題、頁數、格式、檔名與 NAS 路徑", async ({ page }) => {
  await mockApi(page, { user: presentationUserFixture })
  await mockPresentation(page, { delayMs: 300 })
  await seedToken(page)
  await page.goto("/presentation")

  await topicBox(page).fill("泵浦保養三步驟")
  await page.getByRole("button", { name: "產生簡報" }).click()

  // 等待狀態要講明白要等一段時間
  await expect(page.getByRole("button", { name: "產生中……" })).toBeDisabled()
  await expect(page.getByRole("status")).toContainText("通常要一到三分鐘")

  await expect(page.getByText(presentationResultFixture.message)).toBeVisible()
  await expect(page.getByText("5 頁", { exact: true })).toBeVisible()
  await expect(page.getByText("html", { exact: true })).toBeVisible()
  await expect(page.getByText(presentationResultFixture.filename, { exact: true })).toBeVisible()
  await expect(page.getByText(presentationResultFixture.nas_path)).toBeVisible()
  await expect(page.getByRole("button", { name: "複製路徑" })).toBeVisible()
})

test("後端 400 的 detail 原樣顯示", async ({ page }) => {
  await mockApi(page, { user: presentationUserFixture })
  await mockPresentation(page, {
    error: { status: 400, detail: "無效的主題：marp，可用主題：default, gaia, gaia-invert, uncover" },
  })
  await seedToken(page)
  await page.goto("/presentation")

  await topicBox(page).fill("泵浦保養三步驟")
  await page.getByRole("button", { name: "產生簡報" }).click()

  await expect(page.getByRole("alert").filter({ hasText: "產生失敗" })).toContainText(
    "無效的主題：marp，可用主題：default, gaia, gaia-invert, uncover",
  )
  // 失敗不留成功卡
  await expect(page.getByRole("button", { name: "複製路徑" })).toHaveCount(0)
})

test("沒有 md2ppt 權限的人進 /presentation 被擋下，側邊欄也沒有這一項", async ({ page }, testInfo) => {
  await mockApi(page) // userFixture 的 apps 沒有 md2ppt
  await mockPresentation(page)
  await seedToken(page)

  await page.goto("/presentation")
  await expect(page.getByRole("heading", { name: "此功能需要管理員開放" })).toBeVisible()
  await expect(page.getByRole("button", { name: "產生簡報" })).toHaveCount(0)

  await page.goto("/")
  await openSidebar(page, testInfo)
  await expect(page.getByRole("navigation").first().getByRole("link", { name: "簡報" })).toHaveCount(0)
})

test("有權限的人側邊欄看得到「簡報」", async ({ page }, testInfo) => {
  await mockApi(page, { user: presentationUserFixture })
  await mockPresentation(page)
  await seedToken(page)

  await page.goto("/")
  await openSidebar(page, testInfo)
  await page.getByRole("navigation").first().getByRole("link", { name: "簡報" }).click()
  await expect(page).toHaveURL(/\/presentation$/)
  await expect(page.getByText("送出會真的產生一份檔案")).toBeVisible()
})
