import { expect, test } from "@playwright/test"
import { mockApi, mockBot, mockKb, seedToken } from "./helpers"

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await mockKb(page)
  await mockBot(page)
  await seedToken(page)
})

test("綁定分頁：Line 已綁定顯示名稱，Telegram 未綁定顯示產生驗證碼", async ({ page }) => {
  await page.goto("/bot")
  await expect(page.getByText("亞澤")).toBeVisible()
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

test("六個分頁籤在頁面內橫向捲動，頁面本身不橫向捲動", async ({ page }) => {
  await page.goto("/bot")
  for (const name of ["綁定", "群組", "使用者", "黑名單", "訊息", "檔案"]) {
    await expect(page.getByRole("tab", { name })).toBeVisible()
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
})
