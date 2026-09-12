import { expect, test } from "@playwright/test"
import { mockApi, seedToken, userFixture } from "./helpers"

test("變更密碼成功後清空表單並提示", async ({ page }) => {
  await mockApi(page)
  await seedToken(page)
  await page.goto("/settings")

  await page.getByLabel("目前密碼").fill("old12345")
  await page.getByLabel("新密碼", { exact: true }).fill("new12345")
  await page.getByLabel("確認新密碼").fill("new12345")
  await page.getByRole("button", { name: "變更密碼" }).click()

  await expect(page.getByRole("status")).toContainText("密碼已更新。")
  await expect(page.getByLabel("目前密碼")).toHaveValue("")
  await expect(page.getByLabel("新密碼", { exact: true })).toHaveValue("")
  await expect(page.getByLabel("確認新密碼")).toHaveValue("")
})

test("目前密碼錯：後端 200 加 success:false，把 error 顯示出來", async ({ page }) => {
  await mockApi(page)
  await seedToken(page)
  await page.goto("/settings")

  await page.getByLabel("目前密碼").fill("wrong12345")
  await page.getByLabel("新密碼", { exact: true }).fill("new12345")
  await page.getByLabel("確認新密碼").fill("new12345")
  await page.getByRole("button", { name: "變更密碼" }).click()

  await expect(page.getByRole("alert")).toContainText("目前密碼錯誤")
})

test("兩次新密碼不一致由前端擋下，不打後端", async ({ page }) => {
  await mockApi(page)
  await seedToken(page)
  const posted: string[] = []
  page.on("request", (r) => {
    if (r.url().endsWith("/api/auth/change-password")) posted.push(r.url())
  })
  await page.goto("/settings")

  await page.getByLabel("目前密碼").fill("old12345")
  await page.getByLabel("新密碼", { exact: true }).fill("new12345")
  await page.getByLabel("確認新密碼").fill("new12346")
  await page.getByRole("button", { name: "變更密碼" }).click()

  await expect(page.getByRole("alert")).toContainText("兩次輸入的新密碼不一樣。")
  expect(posted).toHaveLength(0)
})

test("NAS 使用者沒有目前密碼欄，送出的 body 不帶 current_password", async ({ page }) => {
  await mockApi(page, { user: { ...userFixture, has_password: false } })
  await seedToken(page)
  const bodies: unknown[] = []
  page.on("request", (r) => {
    if (r.url().endsWith("/api/auth/change-password")) bodies.push(r.postDataJSON())
  })
  await page.goto("/settings")

  await expect(page.getByText("你目前用 NAS 帳號登入，設定平台密碼後兩種都能登。")).toBeVisible()
  await expect(page.getByLabel("目前密碼")).toHaveCount(0)

  await page.getByLabel("新密碼", { exact: true }).fill("new12345")
  await page.getByLabel("確認新密碼").fill("new12345")
  await page.getByRole("button", { name: "設定密碼" }).click()

  await expect(page.getByRole("status")).toContainText("平台密碼已設定，之後可以用平台帳號登入。")
  expect(bodies).toEqual([{ new_password: "new12345" }])
})
