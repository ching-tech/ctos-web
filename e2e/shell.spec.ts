import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { adminFixture, mockAiLog, mockApi, mockBot, mockKb, mockProjects, seedToken } from "./helpers"

const MODULES = ["首頁", "AI 助手", "知識庫", "專案", "Bot 管理", "設定"]

async function openSidebarIfMobile(page: Page, testInfo: TestInfo) {
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: /Toggle Sidebar/i }).click()
  }
}

test("側邊欄列出模組，一般使用者看不到使用者管理", async ({ page }, testInfo) => {
  await mockApi(page)
  await mockKb(page)
  await mockAiLog(page)
  await mockBot(page)
  await mockProjects(page)
  await seedToken(page)
  await page.goto("/")
  await openSidebarIfMobile(page, testInfo)
  const nav = page.getByRole("navigation").first()
  for (const m of MODULES) await expect(nav.getByRole("link", { name: m })).toBeVisible()
  await expect(nav.getByRole("link", { name: "使用者管理" })).toHaveCount(0)
  await expect(nav.getByRole("link", { name: "AI Log" })).toHaveCount(0) // fixture ai-log=false
})

test("首頁顯示知識庫最近更新", async ({ page }) => {
  await mockApi(page)
  await mockKb(page)
  await mockAiLog(page)
  await mockBot(page)
  await mockProjects(page)
  await seedToken(page)
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "知識庫最近更新" })).toBeVisible()
  await expect(page.getByRole("link", { name: /泵浦保養 SOP/ })).toBeVisible()
})

test("admin 看得到使用者管理，點模組會切換右欄", async ({ page }, testInfo) => {
  await mockApi(page, { user: adminFixture })
  await mockKb(page)
  await mockAiLog(page)
  await mockBot(page)
  await mockProjects(page)
  await seedToken(page)
  await page.goto("/")
  await openSidebarIfMobile(page, testInfo)
  const nav = page.getByRole("navigation").first()
  await expect(nav.getByRole("link", { name: "使用者管理" })).toBeVisible()
  await nav.getByRole("link", { name: "專案" }).click()
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByRole("heading", { name: "專案" })).toBeVisible()
  await expect(page.getByRole("link", { name: "台北捷運監控案" })).toBeVisible()
})

test("登出回到登入頁並清掉 token", async ({ page }, testInfo) => {
  await mockApi(page)
  await mockKb(page)
  await mockAiLog(page)
  await mockBot(page)
  await mockProjects(page)
  await seedToken(page)
  await page.goto("/")
  await openSidebarIfMobile(page, testInfo)
  await page.getByRole("button", { name: "登出" }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(() => localStorage.getItem("ctos-web.token"))).toBeNull()
})

test("頁面不可橫向捲動", async ({ page }) => {
  await mockApi(page)
  await seedToken(page)
  await page.goto("/settings")
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
})
