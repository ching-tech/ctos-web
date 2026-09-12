import { expect, test, type Page } from "@playwright/test"
import { adminFixture, makeLoginRecords, mockApi, mockLoginRecords, seedToken } from "./helpers"

// 桌機表格與手機卡片同時在 DOM 裡，只有其中一份看得見；一律只挑看得見的那一份。
function visible(page: Page, selector: string) {
  return page.locator(selector).filter({ visible: true })
}

/** fixture 裡 user_id=2 的三筆（501 成功、502 失敗、503 成功）是一般使用者看得到的全部。 */
test.describe("一般使用者", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await mockLoginRecords(page)
    await seedToken(page)
  })

  test("統計卡照 stats 端點的欄位顯示", async ({ page }) => {
    await page.goto("/login-records")
    await expect(page.getByTestId("stat-total")).toHaveText("3")
    await expect(page.getByTestId("stat-rate")).toHaveText("67%")
    await expect(page.getByText("2 成功／1 失敗")).toBeVisible()
    await expect(page.getByTestId("stat-failure")).toHaveText("1")
    // 192.0.2.10 兩筆、198.51.100.7 一筆
    await expect(page.getByTestId("stat-ips")).toHaveText("2")
    await expect(page.getByTestId("stat-devices")).toHaveText("2")
  })

  test("天數選單寫進網址並重新查統計", async ({ page }) => {
    await page.goto("/login-records")
    const req = page.waitForRequest((r) => r.url().includes("/api/login-records/stats?") && r.url().includes("days=7"))
    await page.getByLabel("統計天數").click()
    await page.getByRole("option", { name: "最近 7 天" }).click()
    await req
    await expect(page).toHaveURL(/days=7/)
  })

  test("清單只有自己的紀錄，標題旁講明，而且沒有使用者名稱篩選", async ({ page }) => {
    await page.goto("/login-records")
    await expect(page.getByText("只顯示你自己的登入紀錄")).toBeVisible()
    await expect(page.getByLabel("使用者名稱")).toHaveCount(0)
    await expect(page.getByText("共 3 筆")).toBeVisible()
    await expect(visible(page, 'a[href="/login-records/501"]')).toBeVisible()
    // 504 是管理員的紀錄，非管理員看不到
    await expect(visible(page, 'a[href="/login-records/504"]')).toHaveCount(0)
  })

  test("失敗的那一筆標出結果與原因", async ({ page }) => {
    await page.goto("/login-records")
    await expect(page.getByText("密碼錯誤").filter({ visible: true })).toBeVisible()
    await expect(page.getByText("失敗", { exact: true }).filter({ visible: true }).first()).toBeVisible()
  })

  test("結果、IP 與日期區間都寫進網址", async ({ page }) => {
    await page.goto("/login-records")
    await page.getByLabel("結果").click()
    await page.getByRole("option", { name: "失敗" }).click()
    await expect(page).toHaveURL(/success=false/)
    await expect(page.getByText("共 1 筆")).toBeVisible()
    await expect(visible(page, 'a[href="/login-records/502"]')).toBeVisible()

    await page.getByRole("button", { name: "清除篩選" }).click()
    await expect(page.getByText("共 3 筆")).toBeVisible()

    const ipReq = page.waitForRequest(
      (r) => r.url().includes("/api/login-records?") && r.url().includes("ip_address=198.51.100.7"),
    )
    await page.getByLabel("IP 位址").fill("198.51.100.7")
    await page.getByRole("button", { name: "搜尋" }).click()
    await ipReq
    await expect(page).toHaveURL(/ip=198.51.100.7/)
    await expect(page.getByText("共 1 筆")).toBeVisible()
    await expect(visible(page, 'a[href="/login-records/503"]')).toBeVisible()

    await page.getByRole("button", { name: "清除篩選" }).click()
    const dateReq = page.waitForRequest(
      (r) => r.url().includes("/api/login-records?") && r.url().includes("start_date="),
    )
    await page.getByLabel("起日").fill("2026-09-12")
    const startDate = new URL((await dateReq).url()).searchParams.get("start_date")
    // TZ 固定 Asia/Taipei（playwright.config.ts），本地日 00:00 轉 UTC 要退八小時。
    expect(startDate).toBe("2026-09-11T16:00:00.000Z")
    await expect(page).toHaveURL(/from=2026-09-12/)
  })

  test("明細頁列出全部欄位，經緯度有值才顯示", async ({ page }) => {
    await page.goto("/login-records")
    await visible(page, 'a[href="/login-records/501"]').click()
    await expect(page).toHaveURL(/\/login-records\/501$/)
    // 側邊欄的使用者選單也有帳號，明細的斷言限定在主要內容區。
    await expect(page.getByRole("main").getByText("yazelin", { exact: true })).toBeVisible()
    await expect(page.getByText("192.0.2.10", { exact: true })).toBeVisible()
    await expect(page.getByText("臺灣／桃園", { exact: true })).toBeVisible()
    await expect(page.getByText("24.993600, 121.301000")).toBeVisible()
    await expect(page.getByText("fp-desktop-aaa")).toBeVisible()
    await expect(page.getByText("sess-501")).toBeVisible()
    await expect(page.getByText("桌機", { exact: true })).toBeVisible()
    await expect(page.getByText(/Chrome\/141\.0/)).toBeVisible()

    // 502 沒有經緯度，那一列整個不出現；失敗原因會顯示
    await page.getByRole("link", { name: "回清單" }).click()
    await visible(page, 'a[href="/login-records/502"]').click()
    await expect(page.getByText("經緯度")).toHaveCount(0)
    await expect(page.getByText("密碼錯誤")).toBeVisible()
  })

  test("看不到的紀錄回 404 的空狀態", async ({ page }) => {
    await page.goto("/login-records/504")
    await expect(page.getByText("找不到這筆登入紀錄")).toBeVisible()
  })

  test("分頁", async ({ page }) => {
    await mockLoginRecords(page, { records: makeLoginRecords(45) })
    await page.goto("/login-records")
    await expect(page.getByText("共 45 筆")).toBeVisible()
    await expect(page.getByText("第 1／3 頁")).toBeVisible()
    await expect(visible(page, 'a[href="/login-records/2001"]')).toBeVisible()
    await page.getByRole("button", { name: "下一頁" }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(visible(page, 'a[href="/login-records/2021"]')).toBeVisible()
  })
})

test.describe("管理員", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { user: { ...adminFixture } })
    await mockLoginRecords(page, { admin: true })
    await seedToken(page)
  })

  test("看得到全部紀錄，沒有「只顯示你自己」的提示", async ({ page }) => {
    await page.goto("/login-records")
    await expect(page.getByText("只顯示你自己的登入紀錄")).toHaveCount(0)
    await expect(page.getByText("共 6 筆")).toBeVisible()
    await expect(page.getByTestId("stat-total")).toHaveText("6")
    await expect(visible(page, 'a[href="/login-records/504"]')).toBeVisible()
  })

  test("使用者名稱篩選寫進網址", async ({ page }) => {
    await page.goto("/login-records")
    const req = page.waitForRequest(
      (r) => r.url().includes("/api/login-records?") && r.url().includes("username=admin"),
    )
    await page.getByLabel("使用者名稱").fill("admin")
    await page.getByRole("button", { name: "搜尋" }).click()
    await req
    await expect(page).toHaveURL(/username=admin/)
    await expect(page.getByText("共 2 筆")).toBeVisible()
    await expect(visible(page, 'a[href="/login-records/504"]')).toBeVisible()
    await expect(visible(page, 'a[href="/login-records/501"]')).toHaveCount(0)
  })

  test("沒有 user_id 的失敗紀錄也看得到明細", async ({ page }) => {
    await page.goto("/login-records/505")
    await expect(page.getByText("no-such-user", { exact: true })).toBeVisible()
    await expect(page.getByText("帳號不存在")).toBeVisible()
    await expect(page.getByText("198.51.100.200", { exact: true })).toBeVisible()
  })
})
