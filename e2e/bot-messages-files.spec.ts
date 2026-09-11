import { expect, test } from "@playwright/test"
import { makeBotMessages, mockApi, mockBot, mockKb, seedToken } from "./helpers"

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await mockKb(page)
  await mockBot(page)
  await seedToken(page)
})

test("訊息分頁：列出 6 則，Bot／非文字／文字內容與 AI 已處理標示分別正確", async ({ page }) => {
  await page.goto("/bot?tab=messages")

  await expect(page.getByText("共 6 則")).toBeVisible()

  const botItem = page.locator("li").filter({ hasText: "已為您查詢完成" })
  await expect(botItem.getByText("Bot", { exact: true })).toBeVisible()

  await expect(page.getByText("[image]")).toBeVisible()

  const textItem = page.locator("li").filter({ hasText: "早安" })
  await expect(textItem).toBeVisible()
  await expect(textItem.getByText("AI 已處理")).toBeVisible()

  // 負控制：非文字、未經 AI 處理的訊息不應顯示「AI 已處理」標籤。
  const imageItem = page.locator("li").filter({ hasText: "[image]" })
  await expect(imageItem.getByText("AI 已處理")).toHaveCount(0)
})

test("訊息分頁：60 筆時可翻頁，送出 page=2", async ({ page }) => {
  await mockBot(page, { messages: makeBotMessages(60) })
  await page.goto("/bot?tab=messages")

  await expect(page.getByText("共 60 則")).toBeVisible()
  const nextBtn = page.getByRole("button", { name: "下一頁" })
  await expect(nextBtn).toBeEnabled()

  const req = page.waitForRequest((r) => r.url().includes("/api/bot/messages?") && r.url().includes("page=2"))
  await nextBtn.click()
  await req
  await expect(page).toHaveURL(/page=2/)
})

test("檔案分頁：列出兩筆，檔名與大小顯示正確", async ({ page }) => {
  await page.goto("/bot?tab=files")

  await expect(page.getByText("共 2 個檔案")).toBeVisible()
  await expect(page.locator("table tbody tr")).toHaveCount(2)

  const imageRow = page.locator("table tbody tr").filter({ hasText: "現場照片.jpg" })
  await expect(imageRow.getByText(/KB/)).toBeVisible()

  const docRow = page.locator("table tbody tr").filter({ hasText: "保養手冊.pdf" })
  await expect(docRow.getByText(/MB/)).toBeVisible()
})

test("檔案分頁：篩選 image 送 file_type=image，只剩一筆", async ({ page }) => {
  await page.goto("/bot?tab=files")

  const req = page.waitForRequest((r) => r.url().includes("/api/bot/files?") && r.url().includes("file_type=image"))
  await page.getByLabel("檔案類型").click()
  await page.getByRole("option", { name: "image", exact: true }).click()
  await req

  await expect(page.locator("table tbody tr")).toHaveCount(1)
  await expect(page.getByText("現場照片.jpg")).toBeVisible()
})

test("檔案分頁：刪除一筆後剩一筆", async ({ page }) => {
  await page.goto("/bot?tab=files")

  const row = page.locator("table tbody tr").filter({ hasText: "保養手冊.pdf" })
  await row.getByRole("button", { name: "刪除" }).click()
  await expect(page.getByText("確定刪除？")).toBeVisible()

  const req = page.waitForRequest((r) => r.method() === "DELETE" && /\/files\/file-2$/.test(new URL(r.url()).pathname))
  await page.getByRole("button", { name: "確定" }).click()
  await req

  await expect(page.getByText("共 1 個檔案")).toBeVisible()
})

test("檔案分頁：下載送出帶 Authorization 的請求", async ({ page }) => {
  await page.goto("/bot?tab=files")

  const row = page.locator("table tbody tr").filter({ hasText: "現場照片.jpg" })
  const req = page.waitForRequest((r) => /\/files\/file-1\/download$/.test(new URL(r.url()).pathname))
  await row.getByRole("button", { name: "下載" }).click()
  const request = await req

  expect(request.headers()["authorization"]).toBeTruthy()
})
