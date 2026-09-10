import { expect, test } from "@playwright/test"
import { mockApi, seedToken, userFixture } from "./helpers"

test("已綁定顯示 NAS 帳號，可解除綁定", async ({ page }) => {
  await mockApi(page)
  await seedToken(page)
  await page.goto("/settings")
  await expect(page.getByText("已綁定：yazelin")).toBeVisible()
  await page.getByRole("button", { name: "解除綁定" }).click()
  await expect(page.getByLabel("NAS 帳號")).toBeVisible()
})

test("未綁定可綁定；錯誤訊息來自後端", async ({ page }) => {
  await mockApi(page, { user: { ...userFixture, nas_username: null } })
  await seedToken(page)
  await page.goto("/settings")
  await page.getByLabel("NAS 帳號").fill("yazelin")
  await page.getByLabel("NAS 密碼").fill("wrong")
  await page.getByRole("button", { name: "綁定" }).click()
  await expect(page.getByRole("alert")).toContainText("NAS 帳號或密碼錯誤")

  await page.getByLabel("NAS 密碼").fill("ok")
  await page.getByRole("button", { name: "綁定" }).click()
  await expect(page.getByText("已綁定：yazelin")).toBeVisible()
})

test("帳號卡顯示角色與密碼狀態", async ({ page }) => {
  await mockApi(page)
  await seedToken(page)
  await page.goto("/settings")
  await expect(page.getByText("使用者", { exact: true })).toBeVisible()
  await expect(page.getByText("已設定平台密碼")).toBeVisible()
})
