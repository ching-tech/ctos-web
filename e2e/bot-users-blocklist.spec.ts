import { expect, test } from "@playwright/test"
import { mockApi, mockBot, mockKb, seedToken } from "./helpers"

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await mockKb(page)
  await mockBot(page)
  await seedToken(page)
})

test("使用者分頁：列出三位，顯示 CTOS 綁定名稱／未綁定／已封鎖", async ({ page }) => {
  await page.goto("/bot?tab=users")

  await expect(page.getByText("共 3 位使用者")).toBeVisible()
  await expect(page.locator("table tbody tr")).toHaveCount(3)

  const boundRow = page.locator("table tbody tr").filter({ hasText: "王小明" })
  await expect(boundRow.getByText("亞澤")).toBeVisible()

  const unboundRow = page.locator("table tbody tr").filter({ hasText: "陳小華" })
  await expect(unboundRow.getByText("未綁定")).toBeVisible()

  const blockedRow = page.locator("table tbody tr").filter({ hasText: "訪客 003" })
  await expect(blockedRow.getByText("已封鎖")).toBeVisible()
})

test("使用者分頁：封鎖未封鎖的使用者，輸入原因後送 PATCH block", async ({ page }) => {
  await page.goto("/bot?tab=users")

  const unboundRow = page.locator("table tbody tr").filter({ hasText: "陳小華" })
  await unboundRow.getByRole("button", { name: "封鎖" }).click()

  await expect(page.getByText("封鎖使用者")).toBeVisible()
  await page.getByLabel("封鎖原因").fill("洗版")

  const req = page.waitForRequest(
    (r) => r.method() === "PATCH" && /\/users\/usr-2\/block$/.test(new URL(r.url()).pathname),
  )
  await page.getByRole("button", { name: "確定封鎖" }).click()
  const body = (await req).postDataJSON() as { reason: string | null }
  expect(body).toEqual({ reason: "洗版" })

  await expect(unboundRow.getByText("已封鎖")).toBeVisible()
})

test("使用者分頁：平台篩選 Telegram 送 platform_type=telegram", async ({ page }) => {
  await page.goto("/bot?tab=users")
  const req = page.waitForRequest(
    (r) => r.url().includes("/api/bot/users-with-binding?") && r.url().includes("platform_type=telegram"),
  )
  await page.getByLabel("平台").click()
  await page.getByRole("option", { name: "Telegram" }).click()
  await req
  await expect(page.locator("table tbody tr")).toHaveCount(1)
  await expect(page.getByText("陳小華")).toBeVisible()
})

test("黑名單分頁：列出已封鎖使用者與原因，解除封鎖後清單變空", async ({ page }) => {
  await page.goto("/bot?tab=blocklist")

  await expect(page.getByText("共 1 位")).toBeVisible()
  await expect(page.getByText("訪客 003")).toBeVisible()
  await expect(page.getByText("洗版")).toBeVisible()

  await page.getByRole("button", { name: "解除封鎖" }).click()
  await expect(page.getByText("確定解除封鎖？")).toBeVisible()

  const req = page.waitForRequest(
    (r) => r.method() === "PATCH" && /\/users\/usr-3\/unblock$/.test(new URL(r.url()).pathname),
  )
  await page.getByRole("button", { name: "確定" }).click()
  await req

  await expect(page.getByText("黑名單是空的")).toBeVisible()
})
