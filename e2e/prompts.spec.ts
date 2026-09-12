import { expect, test } from "@playwright/test"
import { aiManagementUserFixture, mockAiManagement, mockApi, seedToken, trapUnmockedApi, userFixture } from "./helpers"

async function setup(page: Parameters<typeof mockApi>[0], opts: Parameters<typeof mockAiManagement>[1] = {}) {
  const unmocked = await trapUnmockedApi(page)
  await mockApi(page, { user: { ...aiManagementUserFixture } })
  const mock = await mockAiManagement(page, opts)
  await seedToken(page)
  return { ...mock, unmocked }
}

test("清單列出 Prompt，搜尋就地過濾", async ({ page }) => {
  const { unmocked } = await setup(page)
  await page.goto("/prompts")
  // 桌機是表格、手機是卡片，兩份都在 DOM 裡，只比對看得見的那一份。
  const shown = (text: string) => page.getByText(text).filter({ visible: true })

  await expect(shown("web-chat-default")).toHaveCount(1)
  await expect(shown("linebot-group")).toHaveCount(1)
  await expect(shown("summarizer")).toHaveCount(1)

  await page.getByLabel("搜尋").fill("linebot")
  await expect(shown("linebot-group")).toHaveCount(1)
  await expect(page.getByText("summarizer")).toHaveCount(0)
  expect(unmocked).toEqual([])
})

test("明細顯示內容與變數表", async ({ page }) => {
  await setup(page)
  await page.goto("/prompts/pr-1")

  await expect(page.getByRole("heading", { name: "預設對話助手" })).toBeVisible()
  await expect(page.getByTestId("prompt-content")).toContainText("先講結論再補理由")
  await expect(page.getByRole("cell", { name: "user_name" })).toBeVisible()
  await expect(page.getByRole("cell", { name: "使用者顯示名稱" })).toBeVisible()
  // 不是 bot prompt，不該出現警示
  await expect(page.getByTestId("bot-prompt-alert")).toHaveCount(0)
})

test("bot prompt 在明細與編輯頁都有醒目提示", async ({ page }) => {
  await setup(page)
  await page.goto("/prompts/pr-2")
  await expect(page.getByTestId("bot-prompt-alert")).toContainText("linebot-group")

  await page.getByRole("link", { name: "編輯" }).click()
  await expect(page).toHaveURL(/\/prompts\/pr-2\/edit$/)
  await expect(page.getByTestId("bot-prompt-alert")).toBeVisible()
})

test("新增 Prompt 送 POST 並導到明細", async ({ page }) => {
  const { requests } = await setup(page)
  await page.goto("/prompts/new")

  await page.getByLabel("名稱").fill("demo-prompt")
  await page.getByLabel("顯示名").fill("示範提示詞")
  await page.getByLabel("分類").click()
  await page.getByRole("option", { name: "task", exact: true }).click()
  await page.getByLabel("內容").fill("照著做就好。")
  await page.getByLabel("說明").fill("示範用")
  await page.getByLabel("變數（JSON 物件）").fill('{"topic": "主題"}')
  await page.getByRole("button", { name: "儲存" }).click()

  await expect(page).toHaveURL(/\/prompts\/pr-100$/)
  const post = requests.find((r) => r.method === "POST" && r.path.endsWith("/api/ai/prompts"))
  expect(post?.body).toEqual({
    name: "demo-prompt",
    display_name: "示範提示詞",
    category: "task",
    content: "照著做就好。",
    description: "示範用",
    variables: { topic: "主題" },
  })
})

test("編輯只送變動的欄位", async ({ page }) => {
  const { requests } = await setup(page)
  await page.goto("/prompts/pr-1/edit")

  await page.getByLabel("說明").fill("改過的說明")
  await page.getByRole("button", { name: "儲存" }).click()

  await expect(page).toHaveURL(/\/prompts\/pr-1$/)
  const put = requests.find((r) => r.method === "PUT")
  expect(put?.body).toEqual({ description: "改過的說明" })
})

test("變數 JSON 不合法時擋下來，不送請求", async ({ page }) => {
  const { requests } = await setup(page)
  await page.goto("/prompts/pr-1/edit")

  await page.getByLabel("變數（JSON 物件）").fill("{")
  await page.getByRole("button", { name: "儲存" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "JSON 格式不正確" })).toBeVisible()
  expect(requests.filter((r) => r.method === "PUT")).toHaveLength(0)

  // 陣列也不行：後端收的是 dict
  await page.getByLabel("變數（JSON 物件）").fill("[1, 2]")
  await page.getByRole("button", { name: "儲存" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "必須是 JSON 物件" })).toBeVisible()
  expect(requests.filter((r) => r.method === "PUT")).toHaveLength(0)
})

test("刪除要先確認，確認後回清單", async ({ page }) => {
  const { requests } = await setup(page)
  await page.goto("/prompts/pr-3")

  await page.getByRole("button", { name: "刪除", exact: true }).click()
  await expect(page.getByRole("alertdialog")).toContainText("確定刪除")
  await page.getByRole("button", { name: "返回" }).click()
  expect(requests.filter((r) => r.method === "DELETE")).toHaveLength(0)

  await page.getByRole("button", { name: "刪除", exact: true }).click()
  await page.getByRole("button", { name: "確定刪除" }).click()
  await expect(page).toHaveURL(/\/prompts$/)
  await expect(page.getByText("summarizer")).toHaveCount(0)
})

test("被 Agent 引用的 Prompt 刪不掉，400 的 detail 原樣顯示", async ({ page }) => {
  await setup(page)
  await page.goto("/prompts/pr-1")

  await page.getByRole("button", { name: "刪除", exact: true }).click()
  await page.getByRole("button", { name: "確定刪除" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "此 Prompt 正被 Agent 使用，無法刪除" })).toBeVisible()
})

test("沒有 prompt-editor 權限時進不去", async ({ page }) => {
  await trapUnmockedApi(page)
  await mockApi(page, { user: { ...userFixture } })
  await seedToken(page)
  await page.goto("/prompts")
  await expect(page.getByRole("heading", { name: "此功能需要管理員開放" })).toBeVisible()
})

test("清空可為空的欄位不會送 null，欄位旁邊講明清不掉", async ({ page }) => {
  const { requests } = await setup(page)
  await page.goto("/prompts/pr-1/edit")

  // pr-1 的說明原本有值，清掉之後後端的 PUT 是 `is not None`，送 null 等於沒送（#252）
  await page.getByLabel("說明").fill("")
  await expect(page.getByTestId("clear-unsupported-note")).toBeVisible()

  // 同時改一個真的送得出去的欄位，確認 PUT 只帶那一個
  await page.getByLabel("顯示名").fill("改過的顯示名")
  await page.getByRole("button", { name: "儲存" }).click()

  await expect(page).toHaveURL(/\/prompts\/pr-1$/)
  const put = requests.find((r) => r.method === "PUT")
  expect(put?.body).toEqual({ display_name: "改過的顯示名" })
  expect(Object.keys(put?.body as object)).not.toContain("description")
})
