import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { API, mockAiLog, mockApi, mockBot, mockKb, mockProjects, seedToken } from "./helpers"

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await mockKb(page)
  await mockAiLog(page)
  await mockBot(page)
  await mockProjects(page)
})

async function openSidebarIfMobile(page: Page, testInfo: TestInfo) {
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: /Toggle Sidebar/i }).click()
  }
}

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

test("其他端點（非 /api/user/me）回 401 清掉 session 不會造成重導迴圈", async ({ page }, testInfo) => {
  await seedToken(page)
  // 註冊在 beforeEach 的 mockApi 之後，會蓋掉它原本對這支端點的處理。
  await page.route(`${API}/api/user/me/nas-binding`, (route) => {
    if (route.request().method() !== "DELETE") return route.fallback()
    return route.fulfill({ status: 401, json: { detail: "expired" } })
  })

  await page.goto("/settings")
  await page.getByRole("button", { name: "解除綁定" }).click()
  await page.waitForTimeout(300)

  // AuthProvider 收到 clearSession 的事件會立刻把 user 設回 null，RequireAuth
  // 因此馬上重新渲染並導去 /login，通常不需要再點連結；為了同時保護「還沒同步、
  // 要等下一次互動才重新檢查」這種情況，這裡補點一次側邊欄的「首頁」連結。
  if (!/\/login$/.test(new URL(page.url()).pathname)) {
    await openSidebarIfMobile(page, testInfo)
    await page.getByRole("navigation").first().getByRole("link", { name: "首頁" }).click()
  }

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole("tab", { name: "NAS 帳號" })).toBeVisible()
  await page.waitForTimeout(1000)
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(() => localStorage.getItem("ctos-web.token"))).toBeNull()
})
