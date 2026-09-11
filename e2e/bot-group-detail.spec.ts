import { expect, test } from "@playwright/test"
import { mockApi, mockBot, mockKb, seedToken } from "./helpers"

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await mockKb(page)
  await mockBot(page)
  await seedToken(page)
})

test("明細顯示名稱、平台、成員數、狀態、最近訊息，AI 回覆切換送 PATCH", async ({ page }) => {
  await page.goto("/bot/groups/grp-1")

  await expect(page.getByRole("heading", { name: "擎添業務群" })).toBeVisible()
  await expect(page.getByText("Line")).toBeVisible()
  await expect(page.getByText("12")).toBeVisible()
  await expect(page.getByText("使用中")).toBeVisible()

  await expect(page.getByText("最近訊息")).toBeVisible()
  await expect(page.getByText("早安")).toBeVisible()
  await expect(page.getByText("Bot", { exact: true })).toBeVisible()
  await expect(page.getByText("已為您查詢完成")).toBeVisible()

  const req = page.waitForRequest(
    (r) => r.method() === "PATCH" && r.url().includes("/api/bot/groups/grp-1"),
  )
  await page.getByRole("switch", { name: "AI 回覆" }).click()
  const body = (await req).postDataJSON() as { allow_ai_response: boolean }
  expect(body).toEqual({ allow_ai_response: false })
})

test("已離開的群組顯示狀態與離開時間", async ({ page }) => {
  await page.goto("/bot/groups/grp-2")

  await expect(page.getByRole("heading", { name: "退場測試群" })).toBeVisible()
  await expect(page.getByText("已離開")).toBeVisible()
  await expect(page.getByText("離開時間")).toBeVisible()
})

test("刪除群組：確定後回群組清單且清單少一筆", async ({ page }) => {
  await page.goto("/bot/groups/grp-1")

  await page.getByRole("button", { name: "刪除群組" }).click()
  await expect(page.getByText("確定刪除這個群組？")).toBeVisible()
  await expect(page.getByText("刪除群組將同時刪除所有訊息記錄")).toBeVisible()
  await page.getByRole("button", { name: "確定" }).click()

  await expect(page).toHaveURL(/\/bot\?tab=groups/)
  await expect(page.getByText("共 1 個群組")).toBeVisible()
})

test("不存在的群組顯示找不到提示", async ({ page }) => {
  await page.goto("/bot/groups/grp-unknown")

  await expect(page.getByText("找不到這個群組")).toBeVisible()
  await expect(page.getByRole("link", { name: "回群組清單" })).toBeVisible()
})
