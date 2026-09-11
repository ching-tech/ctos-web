import { expect, test } from "@playwright/test"
import { adminFixture, makeAiLogs, mockAiLog, mockApi, mockKb, seedToken } from "./helpers"

test.beforeEach(async ({ page }) => {
  // fixture 一般使用者 ai-log 權限預設關閉，這支測試的是 AI Log 頁面本身；用 adminFixture（全權限）避免被 RequireApp 擋下。
  await mockApi(page, { user: adminFixture })
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
  await page.getByRole("button", { name: "解析結果（原始 JSON）" }).click()
  await expect(page.getByText('"answer": "每三個月"')).toBeVisible()
})

test("失敗紀錄顯示錯誤訊息", async ({ page }) => {
  await page.goto("/ai-log/log-03") // fixture 中 success=false 且 error_message 「模型逾時」
  await expect(page.getByText("模型逾時")).toBeVisible()
})

test("明細頁顯示工具呼叫時間軸與使用的工具", async ({ page }) => {
  await page.goto("/ai-log/log-01")
  const card = page.getByRole("region", { name: "工具呼叫" }) // Card 用 <section aria-labelledby> 或 aria-label="工具呼叫"
  const steps = card.getByRole("listitem")
  await expect(steps).toHaveCount(2)
  await expect(steps.nth(0)).toContainText("第 1 步")
  await expect(steps.nth(0)).toContainText("ToolSearch")
  await expect(steps.nth(0)).toContainText("24 ms")
  await expect(steps.nth(1)).toContainText("run_skill_script(base/list_files)")
  await steps.nth(0).getByRole("button", { name: "輸入" }).click()
  await expect(steps.nth(0)).toContainText('"query": "泵浦"')
  await steps.nth(1).getByRole("button", { name: "輸出" }).click()
  await expect(steps.nth(1)).toContainText("a.txt")
  await expect(page.getByText("使用的工具")).toBeVisible()
  await expect(page.getByText("run_skill_script(base/list_files)").first()).toBeVisible()
})

test("沒有工具呼叫的紀錄不顯示時間軸", async ({ page }) => {
  await page.goto("/ai-log/log-02")
  await expect(page.getByRole("region", { name: "工具呼叫" })).toHaveCount(0)
})

test("選「未記錄使用者」，清單與統計請求都帶 user_id=0，網址帶 user=0", async ({ page }) => {
  await page.goto("/ai-log")
  const listReq = page.waitForRequest((r) => r.url().includes("/api/ai/logs?") && r.url().includes("user_id=0"))
  const statsReq = page.waitForRequest((r) => r.url().includes("/api/ai/logs/stats?") && r.url().includes("user_id=0"))
  await page.getByLabel("使用者").click()
  await page.getByRole("option", { name: "未記錄使用者" }).click()
  await listReq
  await statsReq
  await expect(page).toHaveURL(/user=0/)
  // log-01／log-04 有綁定使用者，其餘 10 筆是「未記錄使用者」
  await expect(page.getByText("共 10 筆")).toBeVisible()
})

test("選某使用者，兩個請求都帶對應 user_id", async ({ page }) => {
  await page.goto("/ai-log")
  const listReq = page.waitForRequest((r) => r.url().includes("/api/ai/logs?") && r.url().includes("user_id=2"))
  const statsReq = page.waitForRequest((r) => r.url().includes("/api/ai/logs/stats?") && r.url().includes("user_id=2"))
  await page.getByLabel("使用者").click()
  await page.getByRole("option", { name: "亞澤" }).click()
  await listReq
  await statsReq
  await expect(page).toHaveURL(/user=2/)
  await expect(page.getByText("共 1 筆")).toBeVisible()
})

test("使用者篩選選回「全部」，請求不帶 user_id", async ({ page }) => {
  await page.goto("/ai-log?user=2")
  const req = page.waitForRequest((r) => r.url().includes("/api/ai/logs?") && !r.url().includes("user_id"))
  await page.getByLabel("使用者").click()
  await page.getByRole("option", { name: "全部" }).click()
  await req
  await expect(page).not.toHaveURL(/user=/)
  await expect(page.getByText("共 12 筆")).toBeVisible()
})

test("直接開 /ai-log?user=0，選單預設選中「未記錄使用者」", async ({ page }) => {
  await page.goto("/ai-log?user=0")
  await expect(page.getByLabel("使用者")).toHaveText("未記錄使用者")
  await expect(page.getByText("共 10 筆")).toBeVisible()
})

test("清單使用者欄顯示 username，未綁定顯示 —", async ({ page }) => {
  await page.goto("/ai-log?user=2")
  const userCells = page.locator("table tbody tr td:nth-child(9)")
  await expect(userCells).toHaveCount(1)
  await expect(userCells.first()).toHaveText("亞澤")

  await page.goto("/ai-log?user=0")
  const emptyCells = page.locator("table tbody tr td:nth-child(9)")
  await expect(emptyCells.first()).toHaveText("—")
})

test("明細頁使用者列顯示 username，未綁定顯示 —", async ({ page }) => {
  await page.goto("/ai-log/log-01") // fixture user_id=2, username=yazelin
  await expect(page.locator("dt", { hasText: "使用者" }).locator("..")).toContainText("yazelin")

  await page.goto("/ai-log/log-02") // 未綁定使用者
  await expect(page.locator("dt", { hasText: "使用者" }).locator("..")).toContainText("—")
})
