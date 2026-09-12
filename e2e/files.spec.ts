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

  await expect(page.getByRole("button", { name: "共用區", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "備份區", exact: true })).toBeVisible()
  await expect(page.getByText("nas.test.invalid／yazelin")).toBeVisible()
  expect(unmocked).toEqual([])
})

test("已經有連線就直接沿用，不再問一次密碼", async ({ page }) => {
  await setup(page, { connections: [{ token: "nas-existing", host: "nas.test.invalid", username: "yazelin" }] })

  await page.goto("/files")
  await expect(page.getByRole("button", { name: "共用區", exact: true })).toBeVisible()
  await expect(page.getByRole("dialog")).toHaveCount(0)
})

test("現成連線已經過期就不沿用，照樣要重新連線", async ({ page }) => {
  // 後端 get_user_connections 不會把過期的剔掉，前端要自己看 expires_at
  await setup(page, {
    connections: [{ token: "nas-stale", host: "nas.test.invalid", username: "yazelin", expires_at: "2020-01-01T00:00:00" }],
  })

  await page.goto("/files")
  await expect(page.getByText("尚未連線 NAS")).toBeVisible()

  await page.getByRole("button", { name: "連線 NAS" }).first().click()
  await connect(page)
  await expect(page.getByRole("button", { name: "共用區", exact: true })).toBeVisible()
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
  await page.getByRole("button", { name: "共用區", exact: true }).click()
  await expect(page).toHaveURL(/[?&]path=%2F%E5%85%B1%E7%94%A8%E5%8D%80$/)
  await expect(page.getByRole("button", { name: "甲一機電", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "工作說明.txt", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "甲一機電", exact: true }).click()
  await expect(page.getByRole("button", { name: "配置圖.png", exact: true })).toBeVisible()

  // 重新整理停在同一層
  await page.reload()
  await expect(page.getByRole("button", { name: "配置圖.png", exact: true })).toBeVisible()

  // 麵包屑回上層
  await page.getByRole("navigation", { name: "路徑" }).getByRole("button", { name: "共用區", exact: true }).click()
  await expect(page.getByRole("button", { name: "甲一機電", exact: true })).toBeVisible()

  // 空資料夾
  await page.getByRole("button", { name: "乙二運輸", exact: true }).click()
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
  await page.getByRole("button", { name: "配置圖.png", exact: true }).click()
  await expect(page.getByRole("region", { name: "檔案預覽" }).getByRole("img", { name: "配置圖.png" })).toBeVisible()
})

test("圖片、文字可以預覽，其他類型只給下載", async ({ page }) => {
  await setup(page, { connections: [{ token: "nas-existing", host: "nas.test.invalid", username: "yazelin" }] })

  await page.goto("/files?path=%2F%E5%85%B1%E7%94%A8%E5%8D%80%2F%E7%94%B2%E4%B8%80%E6%A9%9F%E9%9B%BB")
  const panel = page.getByRole("region", { name: "檔案預覽" })

  await page.getByRole("button", { name: "配置圖.png", exact: true }).click()
  await expect(panel.getByRole("img", { name: "配置圖.png" })).toBeVisible()

  await page.getByRole("button", { name: "說明.md", exact: true }).click()
  await expect(panel.getByText("這是杜撰的測試內容。")).toBeVisible()

  await page.getByRole("button", { name: "模型.dwg", exact: true }).click()
  await expect(panel.getByText("這個檔案類型不提供預覽，請下載後開啟。")).toBeVisible()
  await expect(panel.getByRole("button", { name: "下載" })).toBeVisible()

  await panel.getByRole("button", { name: "關閉預覽" }).click()
  await expect(panel).toHaveCount(0)
})

test("連線過期時自動開對話框，連好之後把原請求重試一次", async ({ page }) => {
  const { nas } = await setup(page, { connections: [{ token: "nas-existing", host: "nas.test.invalid", username: "yazelin" }] })

  await page.goto("/files")
  await expect(page.getByRole("button", { name: "共用區", exact: true })).toBeVisible()

  nas.expireTokens()
  await page.getByRole("button", { name: "共用區", exact: true }).click()

  // 過期被攔下來 → 對話框自己跳出來
  await connect(page)

  // 重連成功後原本那個 browse 被重試，直接看到資料夾內容，不用自己再點一次
  await expect(page.getByRole("button", { name: "甲一機電", exact: true })).toBeVisible()
  await expect(page.getByRole("dialog")).toHaveCount(0)
})

test("中斷連線後回到未連線狀態", async ({ page }) => {
  await setup(page, { connections: [{ token: "nas-existing", host: "nas.test.invalid", username: "yazelin" }] })

  await page.goto("/files")
  await expect(page.getByRole("button", { name: "共用區", exact: true })).toBeVisible()
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

// ============================================================
// 寫入類（上傳、新資料夾、重新命名、刪除、分享連結）
// ============================================================

const CONNECTED = { connections: [{ token: "nas-existing", host: "nas.test.invalid", username: "yazelin" }] }
/** `/共用區/甲一機電` 的網址編碼。 */
const FOLDER_URL = "/files?path=%2F%E5%85%B1%E7%94%A8%E5%8D%80%2F%E7%94%B2%E4%B8%80%E6%A9%9F%E9%9B%BB"

test("上傳多檔後清單更新", async ({ page }) => {
  const { nas } = await setup(page, CONNECTED)
  await page.goto(FOLDER_URL)
  await expect(page.getByRole("button", { name: "配置圖.png", exact: true })).toBeVisible()

  await page.getByLabel("選擇要上傳的檔案").setInputFiles([
    { name: "新圖面.pdf", mimeType: "application/pdf", buffer: Buffer.from("pdf") },
    { name: "備註.txt", mimeType: "text/plain", buffer: Buffer.from("note") },
  ])

  await expect(page.getByRole("button", { name: "新圖面.pdf", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "備註.txt", exact: true })).toBeVisible()
  // 目標資料夾要送目前這一層，不是檔案路徑
  expect(nas.requests.filter((r) => r.path === "/api/nas/upload").map((r) => r.body)).toEqual([
    { path: "/共用區/甲一機電", filename: "新圖面.pdf" },
    { path: "/共用區/甲一機電", filename: "備註.txt" },
  ])
})

test("新資料夾送完整路徑，建好之後出現在清單", async ({ page }) => {
  const { nas } = await setup(page, CONNECTED)
  await page.goto(FOLDER_URL)

  await page.getByRole("button", { name: "新資料夾" }).click()
  await page.getByLabel("資料夾名稱").fill("圖面備份")
  await page.getByRole("button", { name: "建立" }).click()

  await expect(page.getByRole("button", { name: "圖面備份", exact: true })).toBeVisible()
  expect(nas.requests.find((r) => r.path === "/api/nas/mkdir")?.body).toEqual({ path: "/共用區/甲一機電/圖面備份" })
})

test("重新命名送 path 與 new_name，撞名的 409 原樣顯示", async ({ page }) => {
  const { nas } = await setup(page, CONNECTED)
  await page.goto(FOLDER_URL)

  await page.getByRole("button", { name: "模型.dwg 的動作" }).click()
  await page.getByRole("menuitem", { name: "重新命名" }).click()
  await page.getByLabel("新名稱").fill("手冊.pdf") // 已經存在
  await page.getByRole("button", { name: "儲存" }).click()
  await expect(page.getByRole("alert")).toHaveText("目標名稱已存在")

  await page.getByLabel("新名稱").fill("模型-v2.dwg")
  await page.getByRole("button", { name: "儲存" }).click()
  await expect(page.getByRole("button", { name: "模型-v2.dwg", exact: true })).toBeVisible()
  expect(nas.requests.filter((r) => r.path === "/api/nas/rename").at(-1)?.body).toEqual({
    path: "/共用區/甲一機電/模型.dwg",
    new_name: "模型-v2.dwg",
  })
})

test("刪除檔案要確認；刪不是空的資料夾要勾遞迴", async ({ page }) => {
  const { nas } = await setup(page, CONNECTED)
  await page.goto(FOLDER_URL)

  await page.getByRole("button", { name: "手冊.pdf 的動作" }).click()
  await page.getByRole("menuitem", { name: "刪除" }).click()
  await expect(page.getByText("確定要刪除「手冊.pdf」嗎？這個動作無法復原。")).toBeVisible()
  // 檔案沒有遞迴選項
  await expect(page.getByLabel("連同資料夾裡的內容一起刪除")).toHaveCount(0)
  await page.getByRole("button", { name: "刪除", exact: true }).click()
  await expect(page.getByRole("button", { name: "手冊.pdf", exact: true })).toHaveCount(0)
  expect(nas.requests.find((r) => r.path === "/api/nas/file")?.body).toEqual({ path: "/共用區/甲一機電/手冊.pdf", recursive: false })

  // 資料夾：沒勾遞迴時後端擋下來，勾了才刪得掉
  await page.goto("/files?path=%2F%E5%85%B1%E7%94%A8%E5%8D%80")
  await page.getByRole("button", { name: "甲一機電 的動作" }).click()
  await page.getByRole("menuitem", { name: "刪除" }).click()
  await page.getByRole("button", { name: "刪除", exact: true }).click()
  await expect(page.getByRole("alert")).toHaveText("資料夾不是空的，請使用遞迴刪除")

  await page.getByLabel("連同資料夾裡的內容一起刪除").click()
  await page.getByRole("button", { name: "刪除", exact: true }).click()
  await expect(page.getByRole("button", { name: "甲一機電", exact: true })).toHaveCount(0)
  expect(nas.requests.filter((r) => r.path === "/api/nas/file").at(-1)?.body).toEqual({ path: "/共用區/甲一機電", recursive: true })
})

test("沒有 share-manager 權限就沒有分享連結", async ({ page }) => {
  await setup(page, CONNECTED) // userFixture 的 apps 沒有 share-manager
  await page.goto(FOLDER_URL)

  await page.getByRole("button", { name: "手冊.pdf 的動作" }).click()
  await expect(page.getByRole("menuitem", { name: "重新命名" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "分享連結" })).toHaveCount(0)
})

test("有 share-manager 權限時，可分享路徑底下的檔案能建連結，resource_id 是掛載點路徑", async ({ page }) => {
  const unmocked = await trapUnmockedApi(page)
  await mockApi(page, {
    user: { ...userFixture, permissions: { ...userFixture.permissions, apps: { ...userFixture.permissions.apps, "share-manager": true } } },
  })
  const nas = await mockNas(page, CONNECTED)
  await seedToken(page)

  // 不在設定的可分享前綴底下（/共用區 這一層）就沒有分享選項
  await page.goto("/files?path=%2F%E5%85%B1%E7%94%A8%E5%8D%80")
  await page.getByRole("button", { name: "工作說明.txt 的動作" }).click()
  await expect(page.getByRole("menuitem", { name: "分享連結" })).toHaveCount(0)
  await page.keyboard.press("Escape")

  await page.goto(FOLDER_URL)
  await page.getByRole("button", { name: "手冊.pdf 的動作" }).click()
  await page.getByRole("menuitem", { name: "分享連結" }).click()
  await page.getByRole("button", { name: "建立連結" }).click()

  await expect(page.getByLabel("分享連結")).toHaveValue("https://ching-tech.ddns.net/ctos/s/nas-share-1")
  expect(nas.requests.find((r) => r.path === "/api/share")?.body).toEqual({
    resource_type: "nas_file",
    resource_id: "/mnt/nas/projects/手冊.pdf",
    expires_in: "24h",
  })
  expect(unmocked).toEqual([])
})

test("根目錄與搜尋結果不出現寫入類動作", async ({ page }) => {
  await setup(page, CONNECTED)

  await page.goto("/files")
  await expect(page.getByRole("button", { name: "新資料夾" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "共用區 的動作" })).toHaveCount(0)

  await page.goto("/files?path=%2F%E5%85%B1%E7%94%A8%E5%8D%80")
  await page.getByLabel("搜尋").fill("圖")
  await page.getByRole("button", { name: "搜尋" }).click()
  await expect(page.getByRole("button", { name: "配置圖.png", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "配置圖.png 的動作" })).toHaveCount(0)
})
