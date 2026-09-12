import { expect, test } from "@playwright/test"
import { mockApi, mockBot, mockKb, seedToken } from "./helpers"

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await mockKb(page)
  await mockBot(page)
  await seedToken(page)
})

test("從使用者分頁點進明細，顯示欄位、綁定狀態與記憶連結", async ({ page }) => {
  await page.goto("/bot?tab=users")
  await page.getByRole("link", { name: "王小明" }).click()
  await expect(page).toHaveURL(/\/bot\/users\/usr-1$/)

  await expect(page.getByRole("heading", { name: "王小明" })).toBeVisible()
  await expect(page.getByText("U-line-001")).toBeVisible()
  await expect(page.getByText("zh-TW")).toBeVisible()
  // 這支端點不 JOIN users，拿不到 bound_username，所以綁定狀態只能顯示帳號編號。
  await expect(page.getByText("已綁定 CTOS 帳號 #2")).toBeVisible()

  await expect(page.getByRole("link", { name: "查看這位使用者的記憶" })).toHaveAttribute(
    "href",
    "/memory?tab=user&target=usr-1",
  )
  await expect(page.getByRole("link", { name: "回使用者清單" })).toBeVisible()
})

test("從明細封鎖使用者，送 PATCH block 後改顯示已封鎖與原因", async ({ page }) => {
  await page.goto("/bot/users/usr-2")
  await expect(page.getByRole("heading", { name: "陳小華" })).toBeVisible()
  await expect(page.getByText("未綁定")).toBeVisible()

  await page.getByRole("button", { name: "封鎖", exact: true }).click()
  await page.getByLabel("封鎖原因").fill("洗版")

  const req = page.waitForRequest(
    (r) => r.method() === "PATCH" && /\/users\/usr-2\/block$/.test(new URL(r.url()).pathname),
  )
  await page.getByRole("button", { name: "確定封鎖" }).click()
  expect((await req).postDataJSON()).toEqual({ reason: "洗版" })

  await expect(page.getByText("封鎖原因")).toBeVisible()
  await expect(page.getByRole("button", { name: "解除封鎖" })).toBeVisible()
})

test("從黑名單分頁點進來，回去的連結回黑名單", async ({ page }) => {
  await page.goto("/bot?tab=blocklist")
  await page.getByRole("link", { name: "訪客 003" }).click()
  await expect(page).toHaveURL(/\/bot\/users\/usr-3\?from=blocklist$/)
  await expect(page.getByRole("link", { name: "回黑名單" })).toBeVisible()
  await expect(page.getByText("洗版")).toBeVisible()
})

test("不存在的使用者顯示後端的 404 detail", async ({ page }) => {
  await page.goto("/bot/users/usr-nope")
  await expect(page.getByText("User not found")).toBeVisible()
  await expect(page.getByRole("link", { name: "回使用者清單" })).toBeVisible()
})
