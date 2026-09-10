import { expect, test } from "@playwright/test"
import { mockApi, mockKb, seedToken } from "./helpers"

test.beforeEach(async ({ page }) => { await mockApi(page); await mockKb(page); await seedToken(page, "TK") })

test("渲染 Markdown、圖片帶 token、metadata 與附件", async ({ page }) => {
  await page.goto("/kb/kb-001")
  await expect(page.getByRole("heading", { level: 1, name: "泵浦保養 SOP" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "保養步驟" })).toBeVisible()   // fixture content 的 # 標題
  const img = page.locator("article img").first()
  await expect(img).toHaveAttribute("src", /\/api\/knowledge\/assets\/images\/kb-001-a\.png\?token=TK$/)
  await expect(page.getByText("全域")).toBeVisible()
  const dl = page.getByRole("link", { name: /manual\.pdf/ })
  await expect(dl).toHaveAttribute("href", /\/api\/knowledge\/attachments\/kb-001\/manual\.pdf\?token=TK$/)
})

test("上傳附件後清單出現新檔；刪除附件要確認", async ({ page }) => {
  await page.goto("/kb/kb-002")
  await page.getByLabel("上傳附件").setInputFiles({ name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("hi") })
  await expect(page.getByRole("link", { name: /note\.txt/ })).toBeVisible()
  await page.getByRole("button", { name: "刪除附件" }).first().click()
  await page.getByRole("button", { name: "確定" }).click()
  await expect(page.getByRole("link", { name: /note\.txt/ })).toHaveCount(0)
})

test("刪除知識要確認，成功後回清單", async ({ page }) => {
  await page.goto("/kb/kb-003")
  await page.getByRole("button", { name: "刪除" , exact: true }).click()
  await page.getByRole("button", { name: "確定" }).click()
  await expect(page).toHaveURL(/\/kb$/)
  await expect(page.getByText("共 2 筆")).toBeVisible()
})

test("找不到顯示提示", async ({ page }) => {
  await page.goto("/kb/kb-999")
  await expect(page.getByText("找不到這篇知識")).toBeVisible()
})
