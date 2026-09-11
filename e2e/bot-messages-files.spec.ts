import { expect, test } from "@playwright/test"
import { makeBotMessages, mockApi, mockBot, mockKb, seedToken } from "./helpers"

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await mockKb(page)
  await mockBot(page)
  await seedToken(page)
})

test("訊息分頁：列出 6 則，Bot／非文字／文字內容顯示正確", async ({ page }) => {
  await page.goto("/bot?tab=messages")

  await expect(page.getByText("共 6 則")).toBeVisible()

  const botItem = page.locator("li").filter({ hasText: "已為您查詢完成" })
  await expect(botItem.getByText("Bot", { exact: true })).toBeVisible()

  await expect(page.getByText("[image]")).toBeVisible()

  const textItem = page.locator("li").filter({ hasText: "早安" })
  await expect(textItem).toBeVisible()

  // 負控制：舊桌面沒有「AI 已處理」標籤，新版拿掉了，任何訊息都不該顯示。
  await expect(page.getByText("AI 已處理")).toHaveCount(0)
})

test("訊息分頁：選擇對話篩選送 group_id，只剩該群組的訊息", async ({ page }) => {
  await page.goto("/bot?tab=messages")

  const req = page.waitForRequest((r) => r.url().includes("/api/bot/messages?") && r.url().includes("group_id=grp-2"))
  await page.getByLabel("對話").click()
  await page.getByRole("option", { name: "退場測試群" }).click()
  await req

  await expect(page).toHaveURL(/group=grp-2/)
  await expect(page.getByText("共 1 則")).toBeVisible()
  await expect(page.getByText("測試訊息")).toBeVisible()
  await expect(page.getByText("早安")).toHaveCount(0)
})

test("訊息分頁：平台設 Telegram 時，對話篩選只列出該平台的群組", async ({ page }) => {
  const req = page.waitForRequest((r) => r.url().includes("/api/bot/groups?") && r.url().includes("platform_type=telegram"))
  await page.goto("/bot?tab=messages&platform=telegram")
  await req

  await page.getByLabel("對話").click()
  await expect(page.getByRole("option", { name: "退場測試群" })).toBeVisible()
  await expect(page.getByRole("option", { name: "擎添業務群" })).toHaveCount(0)
})

test("訊息分頁：60 筆時可翻頁，送出 page=2", async ({ page }) => {
  await mockBot(page, { messages: makeBotMessages(60) })
  await page.goto("/bot?tab=messages")

  await expect(page.getByText("共 60 則")).toBeVisible()
  const nextBtn = page.getByRole("button", { name: "下一頁" })
  await expect(nextBtn).toBeEnabled()

  const req = page.waitForRequest((r) => r.url().includes("/api/bot/messages?") && r.url().includes("page=2"))
  await nextBtn.click()
  await req
  await expect(page).toHaveURL(/page=2/)
})

test("檔案分頁：列出三筆，檔名、大小與 NAS 標示顯示正確", async ({ page }) => {
  await page.goto("/bot?tab=files")

  await expect(page.getByText("共 3 個檔案")).toBeVisible()
  await expect(page.locator("table tbody tr")).toHaveCount(3)

  const imageRow = page.locator("table tbody tr").filter({ hasText: "現場照片.jpg" })
  await expect(imageRow.getByText(/KB/)).toBeVisible()
  await expect(imageRow.getByText("NAS", { exact: true })).toBeVisible()

  const docRow = page.locator("table tbody tr").filter({ hasText: "保養手冊.pdf" })
  await expect(docRow.getByText(/MB/)).toBeVisible()
})

test("檔案分頁：沒有 nas_path 的檔案顯示「已過期」且不提供下載", async ({ page }) => {
  await page.goto("/bot?tab=files")

  const expiredRow = page.locator("table tbody tr").filter({ hasText: "驗收錄影.mp4" })
  await expect(expiredRow.getByText("已過期")).toBeVisible()
  await expect(expiredRow.getByRole("button", { name: "下載" })).toHaveCount(0)
  await expect(expiredRow.getByRole("button", { name: "刪除" })).toBeVisible()
})

test("檔案分頁：篩選圖片送 file_type=image，只剩一筆", async ({ page }) => {
  await page.goto("/bot?tab=files")

  const req = page.waitForRequest((r) => r.url().includes("/api/bot/files?") && r.url().includes("file_type=image"))
  await page.getByLabel("檔案類型").click()
  await page.getByRole("option", { name: "圖片", exact: true }).click()
  await req

  await expect(page.locator("table tbody tr")).toHaveCount(1)
  await expect(page.getByText("現場照片.jpg")).toBeVisible()
})

test("檔案分頁：選擇群組篩選送 group_id，只剩該群組的檔案", async ({ page }) => {
  await page.goto("/bot?tab=files")

  const req = page.waitForRequest((r) => r.url().includes("/api/bot/files?") && r.url().includes("group_id=grp-2"))
  await page.getByRole("combobox", { name: "群組" }).click()
  await page.getByRole("option", { name: "退場測試群" }).click()
  await req

  await expect(page).toHaveURL(/group=grp-2/)
  await expect(page.locator("table tbody tr")).toHaveCount(1)
  await expect(page.getByText("驗收錄影.mp4")).toBeVisible()
})

test("檔案分頁：刪除一筆後剩兩筆", async ({ page }) => {
  await page.goto("/bot?tab=files")

  const row = page.locator("table tbody tr").filter({ hasText: "保養手冊.pdf" })
  await row.getByRole("button", { name: "刪除" }).click()
  await expect(page.getByText("確定刪除？")).toBeVisible()

  const req = page.waitForRequest((r) => r.method() === "DELETE" && /\/files\/file-2$/.test(new URL(r.url()).pathname))
  await page.getByRole("button", { name: "確定" }).click()
  await req

  await expect(page.getByText("共 2 個檔案")).toBeVisible()
})

test("檔案分頁：下載送出帶 Authorization 的請求", async ({ page }) => {
  await page.goto("/bot?tab=files")

  const row = page.locator("table tbody tr").filter({ hasText: "現場照片.jpg" })
  const req = page.waitForRequest((r) => /\/files\/file-1\/download$/.test(new URL(r.url()).pathname))
  await row.getByRole("button", { name: "下載" }).click()
  const request = await req

  expect(request.headers()["authorization"]).toBeTruthy()
})

test("檔案分頁：圖片列有「預覽」，文件列沒有", async ({ page }) => {
  await page.goto("/bot?tab=files")

  const imageRow = page.locator("table tbody tr").filter({ hasText: "現場照片.jpg" })
  await expect(imageRow.getByRole("button", { name: "預覽" })).toBeVisible()

  const docRow = page.locator("table tbody tr").filter({ hasText: "保養手冊.pdf" })
  await expect(docRow.getByRole("button", { name: "預覽" })).toHaveCount(0)
})

test("檔案分頁：點預覽開啟圖片對話框，帶 Authorization 下載並顯示圖片，可關閉", async ({ page }) => {
  // 記錄 revokeObjectURL 被叫幾次，關閉對話框後必須釋放預覽用的 blob URL
  await page.addInitScript(() => {
    const w = window as unknown as { __revoked: string[] }
    w.__revoked = []
    const orig = URL.revokeObjectURL.bind(URL)
    URL.revokeObjectURL = (url: string) => {
      w.__revoked.push(url)
      orig(url)
    }
  })
  await page.goto("/bot?tab=files")

  const imageRow = page.locator("table tbody tr").filter({ hasText: "現場照片.jpg" })
  const req = page.waitForRequest((r) => /\/files\/file-1\/download$/.test(new URL(r.url()).pathname))
  await imageRow.getByRole("button", { name: "預覽" }).click()
  const request = await req
  expect(request.headers()["authorization"]).toBeTruthy()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("現場照片.jpg")).toBeVisible()
  const img = dialog.locator("img")
  await expect(img).toBeVisible()
  await expect(img).toHaveAttribute("src", /^blob:/)
  const blobUrl = await img.getAttribute("src")

  await page.getByRole("button", { name: "Close" }).click()
  await expect(dialog).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __revoked: string[] }).__revoked))
    .toContain(blobUrl)
})
