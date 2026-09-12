import { expect, test, type Page } from "@playwright/test"
import { adminFixture, makeMessages, messageFixtures, mockApi, mockMessages, mockUserList, seedToken } from "./helpers"

// 桌機表格與手機卡片同時在 DOM 裡，只有其中一份看得見；一律只挑看得見的那一份。
function visible(page: Page, selector: string) {
  return page.locator(selector).filter({ visible: true })
}

test.describe("已登入", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await mockMessages(page)
    await seedToken(page)
  })

  test("鈴鐺顯示未讀數並連到未讀清單", async ({ page }) => {
    await page.goto("/")
    const bell = page.getByRole("link", { name: /訊息中心/ })
    await expect(bell).toHaveAttribute("href", "/messages?is_read=false")
    // fixture 有 4 筆未讀（101–104）
    await expect(page.getByTestId("unread-badge")).toHaveText("4")
    await bell.click()
    await expect(page).toHaveURL(/\/messages\?is_read=false$/)
    await expect(page.getByLabel("已讀狀態")).toContainText("未讀")
    await expect(page.getByText("共 4 筆")).toBeVisible()
  })

  test("清單顯示標題、嚴重程度與時間", async ({ page }) => {
    await page.goto("/messages")
    await expect(page.getByText("共 7 筆")).toBeVisible()
    await expect(visible(page, 'a[href="/messages/101"]')).toHaveText("資料庫磁碟空間低於 5%")
    await expect(visible(page, 'a[href="/messages/106"]')).toHaveText("服務啟動完成")
  })

  test("嚴重程度多選寫進網址並重複帶參數", async ({ page }) => {
    await page.goto("/messages")
    const req = page.waitForRequest(
      (r) => r.url().includes("/api/messages?") && r.url().includes("severity=error") && r.url().includes("severity=critical"),
    )
    await page.getByRole("button", { name: "嚴重程度" }).click()
    await page.getByRole("menuitemcheckbox", { name: "錯誤" }).click()
    await page.getByRole("menuitemcheckbox", { name: "嚴重" }).click()
    await page.keyboard.press("Escape")
    const params = new URL((await req).url()).searchParams
    expect(params.getAll("severity")).toEqual(["error", "critical"])
    await expect(page).toHaveURL(/severity=error&severity=critical/)
    await expect(page.getByText("共 2 筆")).toBeVisible()
  })

  test("來源、已讀狀態與搜尋都寫進網址", async ({ page }) => {
    await page.goto("/messages")
    await page.getByRole("button", { name: "來源" }).click()
    await page.getByRole("menuitemcheckbox", { name: "安全" }).click()
    await page.keyboard.press("Escape")
    await expect(page).toHaveURL(/source=security/)
    await expect(page.getByText("共 2 筆")).toBeVisible()

    await page.getByLabel("搜尋").fill("異常")
    await page.getByRole("button", { name: "搜尋" }).click()
    await expect(page).toHaveURL(/search=%E7%95%B0%E5%B8%B8/)
    await expect(page.getByText("共 1 筆")).toBeVisible()
    await expect(visible(page, 'a[href="/messages/103"]')).toBeVisible()

    await page.getByRole("button", { name: "清除篩選" }).click()
    await expect(page).toHaveURL(/\/messages$/)
    await expect(page.getByText("共 7 筆")).toBeVisible()
  })

  test("非管理員看不到使用者篩選下拉", async ({ page }) => {
    await page.goto("/messages")
    await expect(page.getByText("共 7 筆")).toBeVisible()
    await expect(page.getByLabel("使用者", { exact: true })).toHaveCount(0)
  })

  test("勾選標為已讀後鈴鐺未讀數變少", async ({ page }) => {
    await page.goto("/messages")
    await expect(page.getByTestId("unread-badge")).toHaveText("4")
    await visible(page, '[aria-label="選取「物料同步作業失敗」"]').click()
    const markBtn = page.getByRole("button", { name: /^標為已讀/ })
    await expect(markBtn).toHaveText("標為已讀（1）")
    await markBtn.click()
    await expect(page.getByTestId("unread-badge")).toHaveText("3")
    await expect(markBtn).toBeDisabled()
  })

  test("全部標為已讀要先確認，確認後未讀歸零", async ({ page }) => {
    await page.goto("/messages")
    await expect(page.getByTestId("unread-badge")).toHaveText("4")
    await page.getByRole("button", { name: "全部標為已讀" }).click()
    await expect(page.getByRole("alertdialog")).toContainText("確定把全部訊息標為已讀？")
    await page.getByRole("button", { name: "返回" }).click()
    await expect(page.getByTestId("unread-badge")).toHaveText("4")

    await page.getByRole("button", { name: "全部標為已讀" }).click()
    await page.getByRole("button", { name: "確定", exact: true }).click()
    await expect(page.getByTestId("unread-badge")).toHaveCount(0)
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
  })

  test("未讀數超過 99 顯示 99+", async ({ page }) => {
    // makeMessages 的奇數筆未讀，250 筆就是 125 筆未讀
    await mockMessages(page, { messages: makeMessages(250) })
    await page.goto("/")
    await expect(page.getByTestId("unread-badge")).toHaveText("99+")
  })

  test("分頁", async ({ page }) => {
    await mockMessages(page, { messages: makeMessages(45) })
    await page.goto("/messages")
    await expect(page.getByText("共 45 筆")).toBeVisible()
    await expect(page.getByText("第 1／3 頁")).toBeVisible()
    await expect(page.getByRole("button", { name: "上一頁" })).toBeDisabled()
    await expect(visible(page, 'a[href="/messages/1001"]')).toBeVisible()
    await page.getByRole("button", { name: "下一頁" }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(visible(page, 'a[href="/messages/1021"]')).toBeVisible()
  })

  test("明細頁顯示內容與附加資料，並自動標為已讀", async ({ page }) => {
    await page.goto("/messages")
    await expect(page.getByTestId("unread-badge")).toHaveText("4")
    await visible(page, 'a[href="/messages/101"]').click()
    await expect(page).toHaveURL(/\/messages\/101$/)
    await expect(page.getByRole("heading", { name: "資料庫磁碟空間低於 5%" })).toBeVisible()
    await expect(page.getByText("資料分割區剩餘 4.2%。")).toBeVisible()
    await expect(page.getByText("嚴重", { exact: true }).first()).toBeVisible()
    await page.getByRole("button", { name: "附加資料" }).click()
    await expect(page.getByText('"free_percent": 4.2')).toBeVisible()
    // 後端讀明細不會順手標已讀，前端補送 mark-read；鈴鐺應從 4 掉到 3
    await expect(page.getByTestId("unread-badge")).toHaveText("3")
  })

  test("明細頁內容保留換行", async ({ page }) => {
    await page.goto("/messages/101")
    const white = await page
      .getByText("資料分割區剩餘 4.2%。")
      .evaluate((el) => getComputedStyle(el).whiteSpace)
    expect(white).toBe("pre-wrap")
  })

  test("找不到的訊息顯示提示與回清單連結", async ({ page }) => {
    await page.goto("/messages/999")
    await expect(page.getByText("找不到這則訊息")).toBeVisible()
    await page.getByRole("link", { name: "回清單" }).click()
    await expect(page).toHaveURL(/\/messages$/)
  })

  test("頁面不橫向捲動", async ({ page }) => {
    await page.goto("/messages")
    await expect(page.getByText("共 7 筆")).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow).toBe(false)
  })

  test("桌機看表格、手機看卡片", async ({ page }, testInfo) => {
    await page.goto("/messages")
    await expect(page.getByText("共 7 筆")).toBeVisible()
    const table = page.getByRole("table")
    if (testInfo.project.name === "mobile") {
      await expect(table).toBeHidden()
      await expect(visible(page, "ul > li")).toHaveCount(messageFixtures.length)
    } else {
      await expect(table).toBeVisible()
      await expect(table.getByRole("row")).toHaveCount(messageFixtures.length + 1)
    }
  })
})

test.describe("管理員", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockMessages(page)
    await mockUserList(page)
    await seedToken(page)
  })

  test("使用者下拉選人後 GET 帶 user_id、寫進網址", async ({ page }) => {
    await page.goto("/messages")
    await expect(page.getByText("共 7 筆")).toBeVisible()

    const req = page.waitForRequest((r) => r.url().includes("/api/messages?") && r.url().includes("user_id=2"))
    await page.getByRole("combobox", { name: "使用者" }).click()
    await page.getByRole("option", { name: "亞澤" }).click()
    await req
    await expect(page).toHaveURL(/user_id=2/)
    // fixture 裡 user_id=2 的訊息只有 103–105 三筆（user_id 嚴格相等，不像 restrict_to_user 把
    // 全系統訊息也算進來，services/message.py 142–146）。
    await expect(page.getByText("共 3 筆")).toBeVisible()
  })

  test("全部標為已讀帶著所選使用者篩選", async ({ page }) => {
    await page.goto("/messages?user_id=2")
    await expect(page.getByText("共 3 筆")).toBeVisible()

    await page.getByRole("button", { name: "全部標為已讀" }).click()
    await expect(page.getByRole("alertdialog")).toContainText("亞澤")

    const req = page.waitForRequest(
      (r) => r.url().includes("/api/messages/mark-read") && r.url().includes("user_id=2"),
    )
    await page.getByRole("button", { name: "確定", exact: true }).click()
    await req
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
  })
})

test("未登入看不到訊息中心", async ({ page }) => {
  await mockApi(page)
  await mockMessages(page)
  await page.goto("/messages")
  await expect(page).toHaveURL(/\/login$/)
})
