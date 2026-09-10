import { expect, test } from "@playwright/test"
import { mockApi, mockKb, seedToken } from "./helpers"

test.beforeEach(async ({ page }) => { await mockApi(page); await mockKb(page); await seedToken(page) })

test("分享：送 expires_in 與密碼，顯示連結可複製", async ({ page, context, isMobile }) => {
  test.skip(isMobile === true, "clipboard 權限在行動裝置瀏覽器不可用")
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.goto("/kb/kb-001")
  await page.getByRole("button", { name: "分享" }).click()
  await page.getByRole("radio", { name: "7 天" }).check()
  await page.getByLabel("密碼（選填）").fill("1234")
  const req = page.waitForRequest((r) => r.url().endsWith("/api/share"))
  await page.getByRole("button", { name: "建立連結" }).click()
  expect((await req).postDataJSON()).toMatchObject({ resource_type: "knowledge", resource_id: "kb-001", expires_in: "7d", password: "1234" })
  await expect(page.getByLabel("分享連結")).toHaveValue(/public\.html\?token=s1/)
  await page.getByRole("button", { name: "複製" }).click()
  await expect(page.getByText("已複製")).toBeVisible()
})

test("版本歷史：列出版本並可看舊版內容", async ({ page }) => {
  await page.goto("/kb/kb-001")
  await page.getByRole("button", { name: "版本歷史" }).click()
  await expect(page.getByText("第一版")).toBeVisible() // fixture entries[1].message
  await page.getByRole("button", { name: /第一版/ }).click()
  await expect(page.getByRole("heading", { name: /舊版/ })).toBeVisible()
})
