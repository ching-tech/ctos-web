import { expect, test } from "@playwright/test"
import { makeAiLogs, mockAiLog, mockApi, mockKb, seedToken } from "./helpers"

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await mockKb(page)
  await mockAiLog(page)
  await seedToken(page)
})

test("統計卡與表格", async ({ page }) => {
  await page.goto("/ai-log")
  await expect(page.getByText("呼叫次數")).toBeVisible()
  await expect(page.getByText("12", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("75%")).toBeVisible() // 9 成功 / 12
  await expect(page.getByRole("link", { name: /泵浦|log-01|群組助理/ }).first()).toBeVisible()
  await expect(page.getByText("共 12 筆")).toBeVisible()
})

test("篩選送對參數並重設頁碼", async ({ page }) => {
  await page.goto("/ai-log?page=2")
  const req = page.waitForRequest((r) => r.url().includes("/api/ai/logs?") && r.url().includes("success=false"))
  await page.getByLabel("結果").click()
  await page.getByRole("option", { name: "失敗" }).click()
  const u = new URL((await req).url())
  expect(u.searchParams.get("page")).toBe("1")
  await expect(page.getByText("共 3 筆")).toBeVisible()
  await expect(page).toHaveURL(/success=false/)
})

test("日期與 agent 篩選會帶到統計", async ({ page }) => {
  await page.goto("/ai-log")
  const req = page.waitForRequest((r) => r.url().includes("/api/ai/logs/stats?") && r.url().includes("start_date="))
  await page.getByLabel("起日").fill("2026-09-05")
  const u = new URL((await req).url())
  const startDate = u.searchParams.get("start_date")
  expect(startDate).not.toBeNull()
  expect(new Date(startDate!).getTime()).toBe(new Date("2026-09-05T00:00:00").getTime())
})

test("頁面不橫向捲動", async ({ page }) => {
  await page.goto("/ai-log")
  await expect(page.getByText("共 12 筆")).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
})

test("分頁", async ({ page }) => {
  await page.goto("/ai-log")
  await expect(page.getByRole("button", { name: "上一頁" })).toBeDisabled()
  await expect(page.getByRole("button", { name: "下一頁" })).toBeDisabled() // 12 < 50
})

test("60 筆時分頁按鈕可用，換頁後表格內容改變", async ({ page }) => {
  await mockAiLog(page, { logs: makeAiLogs(60) })
  await page.goto("/ai-log")
  await expect(page.getByText("共 60 筆")).toBeVisible()
  await expect(page.getByRole("button", { name: "上一頁" })).toBeDisabled()
  const nextBtn = page.getByRole("button", { name: "下一頁" })
  await expect(nextBtn).toBeEnabled()
  await expect(page.locator('a[href="/ai-log/log-001"]')).toBeVisible()
  await nextBtn.click()
  await expect(page).toHaveURL(/page=2/)
  await expect(page.locator('a[href="/ai-log/log-051"]')).toBeVisible()
  await expect(nextBtn).toBeDisabled()
  await expect(page.getByRole("button", { name: "上一頁" })).toBeEnabled()
})

test("明細頁顯示輸入、回應與解析結果", async ({ page }) => {
  await page.goto("/ai-log/log-01")
  await expect(page.getByText("請幫我查泵浦保養週期")).toBeVisible()
  await expect(page.getByText("每三個月").first()).toBeVisible()
  await page.getByRole("button", { name: "系統提示" }).click()
  await expect(page.getByText("你是擎添的助理")).toBeVisible()
})

test("失敗紀錄顯示錯誤訊息", async ({ page }) => {
  await page.goto("/ai-log/log-03") // fixture 中 success=false 且 error_message 「模型逾時」
  await expect(page.getByText("模型逾時")).toBeVisible()
})
