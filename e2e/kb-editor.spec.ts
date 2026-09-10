import { expect, test } from "@playwright/test"
import { adminFixture, mockApi, mockKb, seedToken } from "./helpers"

test.beforeEach(async ({ page }) => { await mockApi(page); await mockKb(page); await seedToken(page) })

test("新增：送出正確 body，成功後到新頁", async ({ page }) => {
  await page.goto("/kb/new")
  const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/knowledge"))
  await page.getByLabel("標題").fill("新的 SOP")
  await page.getByLabel("內容").fill("# 第一步\n\n內容")
  await page.getByRole("button", { name: "儲存" }).click()
  const body = (await req).postDataJSON()
  expect(body).toMatchObject({ title: "新的 SOP", scope: "personal", type: "knowledge", category: "technical", author: "yazelin" })
  await expect(page).toHaveURL(/\/kb\/kb-004$/)
  await expect(page.getByRole("heading", { level: 1, name: "新的 SOP" })).toBeVisible()
})

test("編輯：只送有改的欄位", async ({ page }) => {
  await page.goto("/kb/kb-001/edit")
  await expect(page.getByLabel("標題")).toHaveValue("泵浦保養 SOP")
  const req = page.waitForRequest((r) => r.method() === "PUT" && r.url().endsWith("/api/knowledge/kb-001"))
  await page.getByLabel("標題").fill("泵浦保養 SOP v2")
  await page.getByRole("button", { name: "儲存" }).click()
  expect((await req).postDataJSON()).toEqual({ title: "泵浦保養 SOP v2" })
  await expect(page).toHaveURL(/\/kb\/kb-001$/)
})

test("預覽切換會渲染 Markdown；標題空白不送出", async ({ page }) => {
  await page.goto("/kb/new")
  await page.getByLabel("內容").fill("## 預覽標題")
  await page.getByRole("button", { name: "預覽" }).click()
  await expect(page.getByRole("heading", { name: "預覽標題" })).toBeVisible()
  await page.getByRole("button", { name: "儲存" }).click()
  await expect(page).toHaveURL(/\/kb\/new$/)
})

test("一般使用者的範圍選單只有「個人」，看不到「全域」", async ({ page }) => {
  await page.goto("/kb/new")
  await page.getByRole("combobox", { name: "範圍" }).click()
  await expect(page.getByRole("option", { name: "個人" })).toBeVisible()
  await expect(page.getByRole("option", { name: "全域" })).toHaveCount(0)
})

test("管理員的範圍選單可以選「全域」", async ({ page }) => {
  await mockApi(page, { user: adminFixture })
  await page.goto("/kb/new")
  await page.getByRole("combobox", { name: "範圍" }).click()
  await expect(page.getByRole("option", { name: "全域" })).toBeVisible()
})
