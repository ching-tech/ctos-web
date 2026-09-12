import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { mockApi, mockBot, mockKb, mockMemory, seedToken, userFixture } from "./helpers"

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await mockKb(page)
  await mockBot(page)
  await mockMemory(page)
  await seedToken(page)
})

/** 手機寬度時左側清單收在抽屜裡，先按開再選；桌面直接點。 */
async function selectTarget(page: Page, testInfo: TestInfo, listLabel: string, name: string) {
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: listLabel }).click()
  }
  await page.getByRole("button", { name }).click()
}

test("群組分頁：選群組列出它的記憶，停用的標出來", async ({ page }, testInfo) => {
  await page.goto("/memory")

  await expect(page.getByText("從左邊挑一個群組")).toBeVisible()

  await selectTarget(page, testInfo, "群組清單", "擎添業務群")

  await expect(page.getByText("出貨前先報數量")).toBeVisible()
  await expect(page.getByText("報價一律附工期")).toBeVisible()
  await expect(page.getByText("已停用，bot 不會讀到")).toBeVisible()
  await expect(page.getByText("由 王小明 建立")).toBeVisible()
  // 內容長的先折起來，按「展開」才看得到全文。
  await page.getByRole("button", { name: "展開" }).click()
  await expect(page.getByRole("button", { name: "收合" })).toBeVisible()
  expect(new URL(page.url()).searchParams.get("target")).toBe("grp-1")
})

test("群組分頁：沒有記憶的群組顯示空狀態", async ({ page }, testInfo) => {
  await page.goto("/memory")
  await selectTarget(page, testInfo, "群組清單", "退場測試群")
  await expect(page.getByText("這個群組還沒有記憶")).toBeVisible()
})

test("新增記憶：POST 只送 title 與 content，新的排在最前面", async ({ page }, testInfo) => {
  await page.goto("/memory")
  await selectTarget(page, testInfo, "群組清單", "擎添業務群")

  await page.getByRole("button", { name: "新增記憶" }).click()
  await page.getByLabel("標題").fill("收工前回報進度")
  await page.getByLabel("內容").fill("每天收工前在群組回報今天做到哪。")

  const req = page.waitForRequest(
    (r) => r.method() === "POST" && new URL(r.url()).pathname.endsWith("/groups/grp-1/memories"),
  )
  await page.getByRole("button", { name: "儲存" }).click()
  expect((await req).postDataJSON()).toEqual({
    title: "收工前回報進度",
    content: "每天收工前在群組回報今天做到哪。",
  })

  await expect(page.getByText("收工前回報進度")).toBeVisible()
})

test("編輯記憶：對話框帶出原值，PUT 送 title 與 content", async ({ page }, testInfo) => {
  await page.goto("/memory")
  await selectTarget(page, testInfo, "群組清單", "擎添業務群")

  await page.getByRole("button", { name: "編輯「出貨前先報數量」" }).click()
  await expect(page.getByLabel("標題")).toHaveValue("出貨前先報數量")
  await page.getByLabel("內容").fill("出貨前先在群組回報品項、數量與預計出車時間。")

  const req = page.waitForRequest(
    (r) => r.method() === "PUT" && new URL(r.url()).pathname.endsWith("/memories/mem-1"),
  )
  await page.getByRole("button", { name: "儲存" }).click()
  expect((await req).postDataJSON()).toEqual({
    title: "出貨前先報數量",
    content: "出貨前先在群組回報品項、數量與預計出車時間。",
  })

  await expect(page.getByText("出貨前先在群組回報品項、數量與預計出車時間。")).toBeVisible()
})

test("停用記憶：開關送 PUT is_active=false，畫面標成已停用", async ({ page }, testInfo) => {
  await page.goto("/memory")
  await selectTarget(page, testInfo, "群組清單", "擎添業務群")

  const req = page.waitForRequest(
    (r) => r.method() === "PUT" && new URL(r.url()).pathname.endsWith("/memories/mem-1"),
  )
  await page.getByRole("switch", { name: "啟用「出貨前先報數量」" }).click()
  expect((await req).postDataJSON()).toEqual({ is_active: false })

  await expect(page.getByText("已停用，bot 不會讀到")).toHaveCount(2)
})

test("停用失敗：後端 500 的 detail 顯示出來，開關回到原狀", async ({ page }, testInfo) => {
  await mockMemory(page, { failUpdateOnce: true })
  await page.goto("/memory")
  await selectTarget(page, testInfo, "群組清單", "擎添業務群")

  await page.getByRole("switch", { name: "啟用「出貨前先報數量」" }).click()
  await expect(page.getByRole("alert")).toContainText("資料庫暫時連不上")
  await expect(page.getByRole("switch", { name: "啟用「出貨前先報數量」" })).toBeChecked()
})

test("刪除記憶：確認後才送 DELETE，卡片消失", async ({ page }, testInfo) => {
  await page.goto("/memory")
  await selectTarget(page, testInfo, "群組清單", "擎添業務群")

  await page.getByRole("button", { name: "刪除「報價一律附工期」" }).click()
  await expect(page.getByText("確定刪除「報價一律附工期」？")).toBeVisible()

  // 先按「返回」不會送出任何請求。
  await page.getByRole("button", { name: "返回" }).click()
  await expect(page.getByText("報價一律附工期")).toBeVisible()

  await page.getByRole("button", { name: "刪除「報價一律附工期」" }).click()
  const req = page.waitForRequest(
    (r) => r.method() === "DELETE" && new URL(r.url()).pathname.endsWith("/memories/mem-2"),
  )
  await page.getByRole("button", { name: "確定刪除" }).click()
  await req

  await expect(page.getByText("報價一律附工期")).toHaveCount(0)
  await expect(page.getByText("出貨前先報數量")).toBeVisible()
})

test("個人分頁：換到個人選使用者，打的是 /users/{id}/memories", async ({ page }, testInfo) => {
  await page.goto("/memory")

  const req = page.waitForRequest((r) => new URL(r.url()).pathname.endsWith("/users/usr-1/memories"))
  await page.getByRole("tab", { name: "個人" }).click()
  await selectTarget(page, testInfo, "使用者清單", "王小明")
  await req

  await expect(page.getByText("稱呼")).toBeVisible()
  await expect(page.getByText("叫我小明就好，不用加職稱。")).toBeVisible()
  expect(new URL(page.url()).searchParams.get("tab")).toBe("user")
})

test("個人分頁：搜尋就地過濾當頁使用者", async ({ page }, testInfo) => {
  await page.goto("/memory?tab=user")
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "使用者清單" }).click()
  }
  await page.getByRole("textbox", { name: "搜尋使用者" }).fill("陳")
  await expect(page.getByRole("button", { name: "王小明" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "陳小華" })).toBeVisible()
})

test("對象不存在：顯示後端的 404 detail", async ({ page }) => {
  await page.goto("/memory?target=grp-missing")
  await expect(page.getByRole("alert")).toContainText("Group not found")
})

test("沒有 memory-manager 權限：側邊欄沒有「記憶」，直開路由被擋下", async ({ page }, testInfo) => {
  const noMemoryUser = {
    ...userFixture,
    permissions: { ...userFixture.permissions, apps: { ...userFixture.permissions.apps, "memory-manager": false } },
  }
  await mockApi(page, { user: noMemoryUser })

  await page.goto("/")
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: /Toggle Sidebar/i }).click()
  }
  await expect(page.getByRole("navigation").first().getByRole("link", { name: "記憶" })).toHaveCount(0)

  await page.goto("/memory")
  await expect(page.getByRole("heading", { name: "此功能需要管理員開放" })).toBeVisible()
})
