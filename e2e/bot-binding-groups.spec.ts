import { expect, test } from "@playwright/test"
import { API, mockApi, mockBot, mockKb, mockProjects, seedToken } from "./helpers"

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await mockKb(page)
  await mockBot(page)
  await mockProjects(page)
  await seedToken(page)
})

test("綁定分頁：Line 已綁定顯示名稱，Telegram 未綁定顯示產生驗證碼", async ({ page }) => {
  await page.goto("/bot")
  // 側邊欄頁尾的使用者選單也叫「亞澤」，桌面寬度下兩個都在，必須限定在綁定分頁裡。
  await expect(page.getByRole("tabpanel", { name: "綁定" }).getByText("亞澤")).toBeVisible()
  await expect(page.getByRole("button", { name: "解除綁定" })).toBeVisible()
  await expect(page.getByRole("button", { name: "產生驗證碼" })).toBeVisible()
})

test("Telegram 產生驗證碼顯示 123456", async ({ page }) => {
  await page.goto("/bot")
  await page.getByRole("button", { name: "產生驗證碼" }).click()
  await expect(page.getByText("123456")).toBeVisible()
})

test("Line 解除綁定送 DELETE 帶 platform_type=line，成功後改顯示產生驗證碼", async ({ page }) => {
  await page.goto("/bot")
  const req = page.waitForRequest(
    (r) => r.method() === "DELETE" && r.url().includes("/api/bot/binding") && r.url().includes("platform_type=line"),
  )
  await page.getByRole("button", { name: "解除綁定" }).click()
  await page.getByRole("button", { name: "確定" }).click()
  await req
  await expect(page.getByRole("button", { name: "產生驗證碼" })).toHaveCount(2)
})

test("群組分頁列出兩筆", async ({ page }) => {
  await page.goto("/bot?tab=groups")
  await expect(page.getByText("共 2 個群組")).toBeVisible()
  await expect(page.locator("table tbody tr")).toHaveCount(2)
  await expect(page.getByRole("link", { name: "擎添業務群" })).toBeVisible()
  await expect(page.getByRole("link", { name: "退場測試群" })).toBeVisible()
})

test("群組分頁：平台篩選 Telegram 送 platform_type=telegram 剩一筆", async ({ page }) => {
  await page.goto("/bot?tab=groups")
  const req = page.waitForRequest(
    (r) => r.url().includes("/api/bot/groups?") && r.url().includes("platform_type=telegram"),
  )
  await page.getByLabel("平台").click()
  await page.getByRole("option", { name: "Telegram" }).click()
  await req
  await expect(page.locator("table tbody tr")).toHaveCount(1)
  await expect(page.getByRole("link", { name: "退場測試群" })).toBeVisible()
})

test("群組分頁：切換 AI 回覆送 PATCH allow_ai_response:false", async ({ page }) => {
  await page.goto("/bot?tab=groups")
  const row = page.locator("table tbody tr").filter({ hasText: "擎添業務群" })
  const req = page.waitForRequest(
    (r) => r.method() === "PATCH" && r.url().includes("/api/bot/groups/grp-1"),
  )
  await row.getByRole("switch", { name: "AI 回覆" }).click()
  const body = (await req).postDataJSON() as { allow_ai_response: boolean }
  expect(body).toEqual({ allow_ai_response: false })
})

test("群組明細：綁定專案下拉預設選中目前綁定的專案，並顯示連到專案明細的連結", async ({ page }) => {
  await page.goto("/bot/groups/grp-1")
  const select = page.getByRole("combobox", { name: "綁定專案" })
  await expect(select).toHaveText("乙二站區監控案")
  await expect(page.getByRole("link", { name: "乙二站區監控案" })).toHaveAttribute("href", "/projects/proj-1")
})

test("群組明細：已完成／已取消的專案排在選單後段並標狀態", async ({ page }) => {
  await page.goto("/bot/groups/grp-1")
  await page.getByRole("combobox", { name: "綁定專案" }).click()
  const options = page.getByRole("option")
  await expect(options).toHaveText(["未綁定", "乙二站區監控案", "倉儲自動化評估", "廠務空調更新（已完成）"])
})

test("群組明細：改選另一個專案送 POST project_id，成功後改顯示新專案名", async ({ page }) => {
  await page.goto("/bot/groups/grp-1")
  const req = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/api/bot/groups/grp-1/bind-project"),
  )
  await page.getByRole("combobox", { name: "綁定專案" }).click()
  await page.getByRole("option", { name: "倉儲自動化評估" }).click()
  expect((await req).postDataJSON()).toEqual({ project_id: "proj-3" })
  await expect(page.getByRole("link", { name: "倉儲自動化評估" })).toHaveAttribute("href", "/projects/proj-3")
})

test("群組明細：選「未綁定」送 DELETE，成功後不再顯示專案連結", async ({ page }) => {
  await page.goto("/bot/groups/grp-1")
  const req = page.waitForRequest(
    (r) => r.method() === "DELETE" && r.url().endsWith("/api/bot/groups/grp-1/bind-project"),
  )
  await page.getByRole("combobox", { name: "綁定專案" }).click()
  await page.getByRole("option", { name: "未綁定" }).click()
  await req
  await expect(page.getByRole("combobox", { name: "綁定專案" })).toHaveText("未綁定")
  await expect(page.getByRole("link", { name: "乙二站區監控案" })).toHaveCount(0)
})

test("群組明細：專案清單載入失敗時下拉停用並顯示提示，不影響其他明細內容", async ({ page }) => {
  await page.route(
    (url) => url.href.startsWith(`${API}/api/projects?`),
    (route) => route.fulfill({ status: 403, json: { detail: "沒有權限" } }),
  )
  await page.goto("/bot/groups/grp-1")
  await expect(page.getByRole("heading", { name: "擎添業務群" })).toBeVisible()
  await expect(page.getByText("無法載入專案清單")).toBeVisible()
  await expect(page.getByRole("combobox", { name: "綁定專案" })).toBeDisabled()
})

test("六個分頁籤在頁面內橫向捲動，頁面本身不橫向捲動", async ({ page }) => {
  await page.goto("/bot")
  for (const name of ["綁定", "群組", "使用者", "黑名單", "訊息", "檔案"]) {
    await expect(page.getByRole("tab", { name })).toBeVisible()
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
})
