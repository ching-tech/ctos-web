import { expect, test } from "@playwright/test"
import { mockApi, seedToken } from "./helpers"

test("未登入進首頁會導到登入頁", async ({ page }) => {
  await mockApi(page)
  await page.goto("/")
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole("tab", { name: "NAS 帳號" })).toBeVisible()
})

test("NAS 分頁登入成功，送 method=nas，落在首頁", async ({ page }) => {
  await mockApi(page)
  const req = page.waitForRequest((r) => r.url().endsWith("/api/auth/login"))
  await page.goto("/login")
  await page.getByLabel("NAS 帳號").fill("yazelin")
  await page.getByLabel("密碼").first().fill("pw")
  await page.getByRole("button", { name: "登入" }).first().click()
  expect((await req).postDataJSON().method).toBe("nas")
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText("亞澤")).toBeVisible()
})

test("平台帳號分頁送 method=local", async ({ page }) => {
  await mockApi(page)
  await page.goto("/login")
  await page.getByRole("tab", { name: "平台帳號" }).click()
  const req = page.waitForRequest((r) => r.url().endsWith("/api/auth/login"))
  await page.getByLabel("帳號", { exact: true }).fill("yazelin")
  await page.getByLabel("密碼").last().fill("pw")
  await page.getByRole("button", { name: "登入" }).last().click()
  expect((await req).postDataJSON().method).toBe("local")
  await expect(page).toHaveURL(/\/$/)
})

test("帳密錯誤顯示後端訊息", async ({ page }) => {
  await mockApi(page, { loginOk: false })
  await page.goto("/login")
  await page.getByLabel("NAS 帳號").fill("x")
  await page.getByLabel("密碼").first().fill("y")
  await page.getByRole("button", { name: "登入" }).first().click()
  await expect(page.getByRole("alert")).toContainText("帳號或密碼錯誤")
  await expect(page).toHaveURL(/\/login$/)
})

test("已有 token 進登入頁會導回首頁；token 失效導回登入頁", async ({ page }) => {
  await mockApi(page)
  await seedToken(page)
  await page.goto("/login")
  await expect(page).toHaveURL(/\/$/)

  await mockApi(page, { user: null })
  await page.goto("/")
  await expect(page).toHaveURL(/\/login$/)
})
