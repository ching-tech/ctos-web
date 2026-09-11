import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { adminFixture, mockAdmin, mockApi, mockKb, seedToken } from "./helpers"

async function openSidebarIfMobile(page: Page, testInfo: TestInfo) {
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: /Toggle Sidebar/i }).click()
  }
}

test("一般使用者：側邊欄沒有 AI Log，直接開受限路由看到擋下頁", async ({ page }, testInfo) => {
  await mockApi(page) // userFixture：ai-log=false、非 admin
  await mockKb(page)
  await mockAdmin(page)
  await seedToken(page)

  await page.goto("/")
  await openSidebarIfMobile(page, testInfo)
  const nav = page.getByRole("navigation").first()
  await expect(nav.getByRole("link", { name: "AI Log" })).toHaveCount(0)

  await page.goto("/ai-log")
  await expect(page.getByRole("heading", { name: "此功能需要管理員開放" })).toBeVisible()

  await page.goto("/admin/users")
  await expect(page.getByRole("heading", { name: "此頁只有管理員能使用" })).toBeVisible()
})

test("admin：側邊欄看得到 AI Log 與使用者管理，使用者管理頁可切換權限", async ({ page }, testInfo) => {
  await mockApi(page, { user: adminFixture })
  await mockKb(page)
  await mockAdmin(page)
  await seedToken(page)

  await page.goto("/")
  await openSidebarIfMobile(page, testInfo)
  const nav = page.getByRole("navigation").first()
  await expect(nav.getByRole("link", { name: "AI Log" })).toBeVisible()
  await expect(nav.getByRole("link", { name: "使用者管理" })).toBeVisible()

  await page.goto("/admin/users")
  await expect(page.getByText("共 2 位使用者")).toBeVisible()
  await expect(page.getByRole("cell", { name: "admin" })).toBeVisible()
  await expect(page.getByRole("cell", { name: "yazelin" })).toBeVisible()

  const yazelinRow = page.getByRole("row", { name: /yazelin/ })
  await yazelinRow.getByRole("button", { name: "權限" }).click()

  const sheet = page.getByRole("dialog")
  await expect(sheet.getByText("權限設定")).toBeVisible()
  const aiLogSwitch = sheet.getByRole("switch", { name: "AI Log" })
  await expect(aiLogSwitch).not.toBeChecked()

  const patchReq = page.waitForRequest(
    (r) => r.method() === "PATCH" && r.url().includes("/api/admin/users/2/permissions"),
  )
  await aiLogSwitch.click()
  const req = await patchReq
  expect(req.postDataJSON()).toEqual({ apps: { "ai-log": true } })

  await page.keyboard.press("Escape")
  await expect(sheet).toHaveCount(0)
  await expect(page.getByRole("cell", { name: "yazelin" })).toBeVisible()

  // admin 自己那列一律全開且開關 disabled（不可調整）
  const adminRow = page.getByRole("row", { name: /^admin / })
  await adminRow.getByRole("button", { name: "權限" }).click()
  const adminAiLogSwitch = sheet.getByRole("switch", { name: "AI Log" })
  await expect(adminAiLogSwitch).toBeChecked()
  await expect(adminAiLogSwitch).toBeDisabled()
})
