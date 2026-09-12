import { expect, test, type Page } from "@playwright/test"
import { mockApi, mockNas, seedToken, trapUnmockedApi, userFixture } from "./helpers"

async function setup(page: Page, opts: Parameters<typeof mockNas>[1] = {}) {
  const unmocked = await trapUnmockedApi(page)
  await mockApi(page)
  const nas = await mockNas(page, opts)
  await seedToken(page)
  return { nas, unmocked }
}

/** 連線對話框：帳號沿用登入者的 NAS 帳號，host 用 build 時的 VITE_NAS_HOST。 */
async function connect(page: Page, password = "pw") {
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "連線 NAS" })).toBeVisible()
  await expect(dialog.getByLabel("主機位址")).toHaveValue("nas.test.invalid")
  await dialog.getByLabel("密碼").fill(password)
  await dialog.getByRole("button", { name: "連線" }).click()
}

test("沒有現成連線時顯示空狀態，連線後列出共享資料夾", async ({ page }) => {
  const { unmocked } = await setup(page)

  await page.goto("/files")
  await expect(page.getByText("尚未連線 NAS")).toBeVisible()

  await page.getByRole("button", { name: "連線 NAS" }).first().click()
  await connect(page)

  await expect(page.getByRole("button", { name: "共用區" })).toBeVisible()
  await expect(page.getByRole("button", { name: "備份區" })).toBeVisible()
  await expect(page.getByText("nas.test.invalid／yazelin")).toBeVisible()
  expect(unmocked).toEqual([])
})

test("已經有連線就直接沿用，不再問一次密碼", async ({ page }) => {
  await setup(page, { connections: [{ token: "nas-existing", host: "nas.test.invalid", username: "yazelin" }] })

  await page.goto("/files")
  await expect(page.getByRole("button", { name: "共用區" })).toBeVisible()
  await expect(page.getByRole("dialog")).toHaveCount(0)
})

test("連線失敗時原樣顯示後端訊息：帳密錯誤是 200 加 error，連不到是 503", async ({ page }) => {
  await setup(page)

  await page.goto("/files")
  await page.getByRole("button", { name: "連線 NAS" }).first().click()
  await connect(page, "wrong")
  await expect(page.getByRole("alert")).toHaveText("NAS 帳號或密碼錯誤")

  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("主機位址").fill("unreachable.test.invalid")
  await dialog.getByLabel("密碼").fill("pw")
  await dialog.getByRole("button", { name: "連線" }).click()
  await expect(page.getByRole("alert")).toHaveText("無法連線至 NAS unreachable.test.invalid")
})

test("進資料夾、麵包屑回上層，網址帶 path 重新整理停在同一層", async ({ page }) => {
  await setup(page, { connections: [{ token: "nas-existing", host: "nas.test.invalid", username: "yazelin" }] })

  await page.goto("/files")
  await page.getByRole("button", { name: "共用區" }).click()
  await expect(page).toHaveURL(/[?&]path=%2F%E5%85%B1%E7%94%A8%E5%8D%80$/)
  await expect(page.getByRole("button", { name: "甲一機電" })).toBeVisible()
  await expect(page.getByRole("button", { name: "工作說明.txt" })).toBeVisible()

  await page.getByRole("button", { name: "甲一機電" }).click()
  await expect(page.getByRole("button", { name: "配置圖.png" })).toBeVisible()

  // 重新整理停在同一層
  await page.reload()
  await expect(page.getByRole("button", { name: "配置圖.png" })).toBeVisible()

  // 麵包屑回上層
  await page.getByRole("navigation", { name: "路徑" }).getByRole("button", { name: "共用區" }).click()
  await expect(page.getByRole("button", { name: "甲一機電" })).toBeVisible()

  // 空資料夾
  await page.getByRole("button", { name: "乙二運輸" }).click()
  await expect(page.getByText("這個資料夾是空的")).toBeVisible()
})

test("在目前路徑搜尋，結果列出可點的完整路徑", async ({ page }) => {
  await setup(page, { connections: [{ token: "nas-existing", host: "nas.test.invalid", username: "yazelin" }] })

  await page.goto("/files?path=%2F%E5%85%B1%E7%94%A8%E5%8D%80")
  await page.getByLabel("搜尋").fill("圖")
  await page.getByRole("button", { name: "搜尋" }).click()

  // 後端搜尋結果的 path 不含 share 名稱，前端要把 share 接回去才點得進去
  // （桌面表格與手機卡片都會渲染，另一份被 CSS 藏起來，所以只挑看得見的那一份）
  await expect(page.getByText("/共用區/甲一機電/配置圖.png").filter({ visible: true })).toHaveCount(1)
  await page.getByRole("button", { name: "配置圖.png" }).click()
  await expect(page.getByRole("region", { name: "檔案預覽" }).getByRole("img", { name: "配置圖.png" })).toBeVisible()
})

test("圖片、文字可以預覽，其他類型只給下載", async ({ page }) => {
  await setup(page, { connections: [{ token: "nas-existing", host: "nas.test.invalid", username: "yazelin" }] })

  await page.goto("/files?path=%2F%E5%85%B1%E7%94%A8%E5%8D%80%2F%E7%94%B2%E4%B8%80%E6%A9%9F%E9%9B%BB")
  const panel = page.getByRole("region", { name: "檔案預覽" })

  await page.getByRole("button", { name: "配置圖.png" }).click()
  await expect(panel.getByRole("img", { name: "配置圖.png" })).toBeVisible()

  await page.getByRole("button", { name: "說明.md" }).click()
  await expect(panel.getByText("這是杜撰的測試內容。")).toBeVisible()

  await page.getByRole("button", { name: "模型.dwg" }).click()
  await expect(panel.getByText("這個檔案類型不提供預覽，請下載後開啟。")).toBeVisible()
  await expect(panel.getByRole("button", { name: "下載" })).toBeVisible()

  await panel.getByRole("button", { name: "關閉預覽" }).click()
  await expect(panel).toHaveCount(0)
})

test("連線過期時自動開對話框，連好之後把原請求重試一次", async ({ page }) => {
  const { nas } = await setup(page, { connections: [{ token: "nas-existing", host: "nas.test.invalid", username: "yazelin" }] })

  await page.goto("/files")
  await expect(page.getByRole("button", { name: "共用區" })).toBeVisible()

  nas.expireTokens()
  await page.getByRole("button", { name: "共用區" }).click()

  // 過期被攔下來 → 對話框自己跳出來
  await connect(page)

  // 重連成功後原本那個 browse 被重試，直接看到資料夾內容，不用自己再點一次
  await expect(page.getByRole("button", { name: "甲一機電" })).toBeVisible()
  await expect(page.getByRole("dialog")).toHaveCount(0)
})

test("中斷連線後回到未連線狀態", async ({ page }) => {
  await setup(page, { connections: [{ token: "nas-existing", host: "nas.test.invalid", username: "yazelin" }] })

  await page.goto("/files")
  await expect(page.getByRole("button", { name: "共用區" })).toBeVisible()
  await page.getByRole("button", { name: "中斷" }).click()
  await expect(page.getByText("尚未連線 NAS")).toBeVisible()
})

test("沒有 file-manager 權限時直接開 /files 會被擋下", async ({ page }) => {
  await trapUnmockedApi(page)
  await mockApi(page, {
    user: { ...userFixture, permissions: { ...userFixture.permissions, apps: { ...userFixture.permissions.apps, "file-manager": false } } },
  })
  await seedToken(page)

  await page.goto("/files")
  await expect(page.getByRole("heading", { name: "此功能需要管理員開放" })).toBeVisible()
})
