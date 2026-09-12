import { expect, test, type Page } from "@playwright/test"
import {
  adminFixture,
  mockApi,
  mockBot,
  mockBotSettings,
  seedToken,
  trapUnmockedApi,
  userFixture,
} from "./helpers"

/**
 * Bot 管理的「平台設定」分頁（後端 api/bot_settings.py，四支都是 require_admin，37–41）。
 * 憑證明文永遠不會從後端回來，畫面只有遮罩值；測試用的輸入值全是杜撰字串。
 */
async function setup(
  page: Page,
  opts: {
    admin?: boolean
    test?: Parameters<typeof mockBotSettings>[1]["test"]
    failUpdate?: string
    failDelete?: string
  } = {},
) {
  const unmocked = await trapUnmockedApi(page)
  await mockApi(page, { user: opts.admin === false ? userFixture : adminFixture })
  await mockBot(page)
  const settings = await mockBotSettings(page, {
    test: opts.test,
    failUpdate: opts.failUpdate,
    failDelete: opts.failDelete,
  })
  await seedToken(page)
  return { ...settings, unmocked }
}

function lineCard(page: Page) {
  return page.getByRole("region", { name: "Line 平台設定" })
}

function telegramCard(page: Page) {
  return page.getByRole("region", { name: "Telegram 平台設定" })
}

test("兩個平台的欄位狀態：遮罩值、來源、更新時間", async ({ page }) => {
  const { unmocked } = await setup(page)
  await page.goto("/bot?tab=settings")

  const line = lineCard(page)
  await expect(line.getByText("Channel Secret")).toBeVisible()
  await expect(line.getByText("aaaa...zzzz")).toBeVisible()
  await expect(line.getByText("資料庫", { exact: true })).toBeVisible()
  await expect(line.getByText(/更新於/)).toBeVisible()
  await expect(line.getByText("bbbb...yyyy")).toBeVisible()
  await expect(line.getByText("環境變數", { exact: true })).toBeVisible()

  const telegram = telegramCard(page)
  await expect(telegram.getByText("Bot Token")).toBeVisible()
  await expect(telegram.getByText("未設定", { exact: true })).toBeVisible()
  await expect(telegram.getByText("—", { exact: true })).toBeVisible()
  await expect(telegram.getByText("cccc...xxxx")).toBeVisible()
  await expect(telegram.getByText("100200300")).toBeVisible()

  expect(unmocked).toEqual([])
})

test("更換一個欄位：輸入框是密碼型、只送那個欄位、送完重抓顯示新來源", async ({ page }) => {
  await setup(page)
  await page.goto("/bot?tab=settings")

  const line = lineCard(page)
  await line.getByRole("button", { name: "更換 Channel Secret" }).click()
  const input = line.getByLabel("新的 Channel Secret")
  await expect(input).toHaveAttribute("type", "password")
  await expect(input).toHaveAttribute("autocomplete", "off")
  await input.fill("fake-secret-for-e2e")

  const putReq = page.waitForRequest(
    (r) => r.method() === "PUT" && r.url().endsWith("/api/admin/bot-settings/line"),
  )
  await line.getByRole("button", { name: "儲存 Channel Secret" }).click()
  expect((await putReq).postDataJSON()).toEqual({ channel_secret: "fake-secret-for-e2e" })

  await expect(line.getByText("dddd...wwww")).toBeVisible()
  await expect(input).toHaveCount(0)
  // 明文不會留在畫面或網址上。
  await expect(page.getByText("fake-secret-for-e2e")).toHaveCount(0)
  expect(page.url()).not.toContain("fake-secret")
})

test("更換欄位失敗：後端 detail 原樣顯示，輸入框留著", async ({ page }) => {
  await setup(page, { failUpdate: "憑證格式不正確" })
  await page.goto("/bot?tab=settings")

  const telegram = telegramCard(page)
  await telegram.getByRole("button", { name: "更換 管理員 Chat ID" }).click()
  const input = telegram.getByLabel("新的 管理員 Chat ID")
  await expect(input).toHaveAttribute("type", "text")
  await input.fill("900800700")
  await telegram.getByRole("button", { name: "儲存 管理員 Chat ID" }).click()

  await expect(telegram.getByRole("alert")).toHaveText("憑證格式不正確")
  await expect(input).toBeVisible()
})

test("主動推送開關：翻過去送出 PUT，只帶開關欄位", async ({ page }) => {
  await setup(page)
  await page.goto("/bot?tab=settings")

  const telegram = telegramCard(page)
  const toggle = telegram.getByRole("switch", { name: "主動推送" })
  await expect(toggle).toHaveAttribute("data-state", "checked")

  const putReq = page.waitForRequest(
    (r) => r.method() === "PUT" && r.url().endsWith("/api/admin/bot-settings/telegram"),
  )
  await toggle.click()
  expect((await putReq).postDataJSON()).toEqual({ proactive_push_enabled: false })
  await expect(toggle).toHaveAttribute("data-state", "unchecked")
})

test("測試連線：成功與失敗的訊息都原樣顯示", async ({ page }) => {
  await setup(page, {
    test: {
      line: { success: true, message: "連線成功！Bot 名稱: 測試機器人" },
      telegram: { success: false, message: "未設定 Bot Token" },
    },
  })
  await page.goto("/bot?tab=settings")

  const line = lineCard(page)
  await line.getByRole("button", { name: "測試連線" }).click()
  await expect(line.getByRole("status")).toHaveText("連線成功！Bot 名稱: 測試機器人")

  const telegram = telegramCard(page)
  await telegram.getByRole("button", { name: "測試連線" }).click()
  await expect(telegram.getByRole("alert")).toHaveText("未設定 Bot Token")
})

test("清除資料庫設定：要先確認，取消不送請求；確認後退回環境變數", async ({ page }) => {
  await setup(page)
  const deletes: string[] = []
  page.on("request", (r) => {
    if (r.method() === "DELETE") deletes.push(r.url())
  })
  await page.goto("/bot?tab=settings")

  const line = lineCard(page)
  await line.getByRole("button", { name: "清除資料庫設定" }).click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toContainText("清除後改用 .env 的值")
  await dialog.getByRole("button", { name: "取消" }).click()
  await expect(dialog).toHaveCount(0)
  expect(deletes).toEqual([])

  await line.getByRole("button", { name: "清除資料庫設定" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "確定" }).click()

  await expect.poll(() => deletes.length).toBe(1)
  expect(deletes[0]).toContain("/api/admin/bot-settings/line")
  await expect(line.getByText("aaaa...zzzz")).toHaveCount(0)
  await expect(line.getByText("未設定", { exact: true })).toBeVisible()
  await expect(line.getByText("—", { exact: true })).toBeVisible()
})

test("清除失敗：對話框留著，後端 detail 顯示在對話框裡，欄位狀態沒變", async ({ page }) => {
  await setup(page, { failDelete: "資料庫暫時連不上" })
  await page.goto("/bot?tab=settings")

  const line = lineCard(page)
  await line.getByRole("button", { name: "清除資料庫設定" }).click()
  const dialog = page.getByRole("alertdialog")
  await dialog.getByRole("button", { name: "確定" }).click()

  // 對話框留在畫面上，錯誤就顯示在裡面（而不是關掉之後才在卡片上冒出來）。
  await expect(dialog.getByRole("alert")).toHaveText("資料庫暫時連不上")
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("button", { name: "確定" })).toBeVisible()

  // 對話框開著時，Radix 會把背景內容從無障礙樹拿掉，所以欄位狀態等關掉再驗。
  await dialog.getByRole("button", { name: "取消" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(line.getByText("aaaa...zzzz")).toBeVisible()
  // 關掉之後遮罩沒有留在畫面上吃掉下一次點擊（#26／#29 那個坑）。
  await line.getByRole("button", { name: "測試連線" }).click()
  await expect(line.getByRole("alert")).toBeVisible()
})

test("非管理員：看不到平台設定分頁，直接帶 ?tab=settings 也退回綁定", async ({ page }) => {
  await setup(page, { admin: false })
  const settingsRequests: string[] = []
  page.on("request", (r) => {
    if (r.url().includes("/api/admin/bot-settings")) settingsRequests.push(`${r.method()} ${r.url()}`)
  })
  await page.goto("/bot?tab=settings")

  await expect(page.getByRole("tab", { name: "平台設定" })).toHaveCount(0)
  await expect(page.getByRole("tab", { name: "綁定", selected: true })).toBeVisible()
  await expect(lineCard(page)).toHaveCount(0)
  // 沒有管理員權限就不該打 bot-settings 任何一支。
  expect(settingsRequests).toEqual([])
})
