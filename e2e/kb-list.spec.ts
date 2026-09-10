import { expect, test } from "@playwright/test"
import { mockApi, mockKb, seedToken } from "./helpers"

test.beforeEach(async ({ page }) => { await mockApi(page); await mockKb(page); await seedToken(page) })

test("清單列出全部並顯示中文標籤與總數", async ({ page }) => {
  await page.goto("/kb")
  await expect(page.getByText("共 3 筆")).toBeVisible()
  const first = page.getByRole("link", { name: /泵浦保養 SOP/ })
  await expect(first).toBeVisible()
  await expect(first).toContainText("全域")
  await expect(first).toContainText("知識")
  await expect(first).toContainText("技術")
})

test("搜尋送 q、顯示 snippet、寫進網址", async ({ page }) => {
  await page.goto("/kb")
  const req = page.waitForRequest((r) => r.url().includes("/api/knowledge?") && r.url().includes("q="))
  await page.getByLabel("搜尋").fill("報價")
  await page.getByLabel("搜尋").press("Enter")
  expect(new URL((await req).url()).searchParams.get("q")).toBe("報價")
  await expect(page.getByText("共 1 筆")).toBeVisible()
  await expect(page.getByText(/含 報價 的片段/)).toBeVisible()
  await expect(page).toHaveURL(/q=%E5%A0%B1%E5%83%B9|q=報價/)
})

test("scope 篩選送參數，重新整理保留", async ({ page }) => {
  await page.goto("/kb?scope=personal")
  await expect(page.getByText("共 1 筆")).toBeVisible()
  await expect(page.getByRole("link", { name: /客戶報價流程/ })).toBeVisible()
  await page.reload()
  await expect(page.getByText("共 1 筆")).toBeVisible()
})

test("空結果與新增按鈕", async ({ page }) => {
  await page.goto("/kb?q=zzz-none")
  await expect(page.getByText("沒有符合的知識")).toBeVisible()
  await page.getByRole("link", { name: "新增知識" }).click()
  await expect(page).toHaveURL(/\/kb\/new$/)
})
