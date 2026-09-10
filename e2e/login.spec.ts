import { expect, test } from "@playwright/test"
import { API, mockApi, mockKb, seedToken } from "./helpers"

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await mockKb(page)
})

test("未登入進首頁會導到登入頁", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole("tab", { name: "NAS 帳號" })).toBeVisible()
})

test("NAS 分頁登入成功，送 method=nas，落在首頁", async ({ page }) => {
  const req = page.waitForRequest((r) => r.url().endsWith("/api/auth/login"))
  await page.goto("/login")
  await page.getByLabel("NAS 帳號").fill("yazelin")
  await page.getByLabel("密碼").first().fill("pw")
  await page.getByRole("button", { name: "登入" }).first().click()
  expect((await req).postDataJSON().method).toBe("nas")
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText("亞澤").first()).toBeVisible()
})

test("平台帳號分頁送 method=local", async ({ page }) => {
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
  await seedToken(page)
  await page.goto("/login")
  await expect(page).toHaveURL(/\/$/)

  await mockApi(page, { user: null })
  await page.goto("/")
  await expect(page).toHaveURL(/\/login$/)
})

test("token 存在但 /api/user/me 回非 401 錯誤（後端掛掉）不會造成重導迴圈", async ({ page }) => {
  await seedToken(page)
  await page.route(`${API}/api/user/me`, (route) => route.fulfill({ status: 503, json: { detail: "down" } }))
  await page.goto("/")
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole("tab", { name: "NAS 帳號" })).toBeVisible()
  await page.waitForTimeout(1000)
  await expect(page).toHaveURL(/\/login$/)
})
