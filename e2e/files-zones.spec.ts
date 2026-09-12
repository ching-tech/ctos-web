import { expect, test, type Page } from "@playwright/test"
import { API, mockApi, mockFilesZones, mockNas, seedToken, trapUnmockedApi } from "./helpers"

/**
 * 檔案頁的本機儲存區（`?zone=ctos|shared|temp|local`）。
 *
 * NAS 那半邊在 `files.spec.ts`；這一支只管 `/api/files/{zone}/…` 三支唯讀端點。
 */
async function setup(page: Page) {
  const unmocked = await trapUnmockedApi(page)
  await mockApi(page)
  await mockNas(page)
  const zones = await mockFilesZones(page)
  await seedToken(page)
  return { zones, unmocked }
}

test("切換儲存區寫進網址，列出根目錄；離開時回到 NAS 那一半", async ({ page }) => {
  const { zones, unmocked } = await setup(page)

  await page.goto("/files")
  await expect(page.getByText("尚未連線 NAS")).toBeVisible()

  await page.getByRole("button", { name: "暫存", exact: true }).click()
  await expect(page).toHaveURL(/[?&]zone=temp/)
  // 本機儲存區不需要 NAS 連線：連線列與空狀態都不該出現
  await expect(page.getByText("尚未連線 NAS")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "連線 NAS" })).toHaveCount(0)
  await expect(page.getByText("暫存檔案")).toBeVisible()

  await expect(page.getByRole("button", { name: "示範資料夾", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "說明.md", exact: true })).toBeVisible()

  // 根目錄的路徑段是 %2F：後端 path 為空會回 400，單點段又會被瀏覽器的 URL 正規化吃掉
  expect(zones.requests.at(-1)?.pathname).toBe(`${new URL(API).pathname}/api/files/temp/%2F/list`)
  expect(zones.requests.at(-1)?.hasAuthHeader).toBe(true)

  await page.getByRole("button", { name: "NAS", exact: true }).click()
  await expect(page).not.toHaveURL(/zone=/)
  await expect(page.getByText("尚未連線 NAS")).toBeVisible()
  expect(unmocked).toEqual([])
})

test("進子目錄、麵包屑回上層，重新整理停在同一層", async ({ page }) => {
  await setup(page)

  await page.goto("/files?zone=temp")
  await page.getByRole("button", { name: "示範資料夾", exact: true }).click()
  await expect(page).toHaveURL(/[?&]path=%2F%E7%A4%BA%E7%AF%84%E8%B3%87%E6%96%99%E5%A4%BE/)
  await expect(page.getByRole("button", { name: "備註.txt", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "子資料夾", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "子資料夾", exact: true }).click()
  await expect(page.getByRole("button", { name: "內層.txt", exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole("button", { name: "內層.txt", exact: true })).toBeVisible()

  await page.getByRole("navigation", { name: "路徑" }).getByRole("button", { name: "示範資料夾", exact: true }).click()
  await expect(page.getByRole("button", { name: "備註.txt", exact: true })).toBeVisible()

  await page.getByRole("navigation", { name: "路徑" }).getByRole("button", { name: "根目錄" }).click()
  await expect(page.getByRole("button", { name: "說明.md", exact: true })).toBeVisible()
})

test("圖片與文字可以預覽，下載是一條帶 token 的連結", async ({ page }) => {
  const { zones } = await setup(page)

  await page.goto("/files?zone=temp&path=%2F%E7%A4%BA%E7%AF%84%E8%B3%87%E6%96%99%E5%A4%BE")
  const panel = page.getByRole("region", { name: "檔案預覽" })
  const base = new URL(API).pathname

  // 圖片：直接用帶 ?token= 的網址當 src（header 設不了的地方後端才收 query token）
  await page.getByRole("button", { name: "圖示.png", exact: true }).click()
  const img = panel.getByRole("img", { name: "圖示.png" })
  await expect(img).toBeVisible()
  await expect(img).toHaveAttribute("src", `${API}/api/files/temp/%E7%A4%BA%E7%AF%84%E8%B3%87%E6%96%99%E5%A4%BE/%E5%9C%96%E7%A4%BA.png?token=tok-seeded`)
  await expect(panel.getByRole("link", { name: "下載" })).toHaveAttribute(
    "href",
    `${API}/api/files/temp/%E7%A4%BA%E7%AF%84%E8%B3%87%E6%96%99%E5%A4%BE/%E5%9C%96%E7%A4%BA.png/download?token=tok-seeded`,
  )

  // 文字：走 header 取回內容，token 不進網址
  await page.getByRole("button", { name: "備註.txt", exact: true }).click()
  await expect(panel.getByText("杜撰的暫存區文字。")).toBeVisible()
  const textReq = zones.requests.filter((r) => r.pathname === `${base}/api/files/temp/%E7%A4%BA%E7%AF%84%E8%B3%87%E6%96%99%E5%A4%BE/%E5%82%99%E8%A8%BB.txt`).at(-1)
  expect(textReq?.hasAuthHeader).toBe(true)
  expect(textReq?.search).toBe("")

  // 不支援預覽的類型只給下載
  await page.getByRole("button", { name: "封存.zip", exact: true }).click()
  await expect(panel.getByText("這個檔案類型不提供預覽，請下載後開啟。")).toBeVisible()
  await expect(panel.getByRole("link", { name: "下載" })).toBeVisible()
})

test("本機儲存區沒有寫入動作，搜尋停用並講明原因", async ({ page }) => {
  await setup(page)

  await page.goto("/files?zone=temp&path=%2F%E7%A4%BA%E7%AF%84%E8%B3%87%E6%96%99%E5%A4%BE")
  await expect(page.getByRole("button", { name: "備註.txt", exact: true })).toBeVisible()

  // 這組端點只有讀：上傳、新資料夾、每列的動作選單都不該出現
  await expect(page.getByLabel("選擇要上傳的檔案")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "新資料夾" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "備註.txt 的動作" })).toHaveCount(0)

  const search = page.getByLabel("搜尋")
  await expect(search).toBeDisabled()
  await expect(search).toHaveAttribute("placeholder", "本機儲存區沒有搜尋")
  await expect(page.getByRole("button", { name: "搜尋" })).toBeDisabled()
})

test("空資料夾顯示空狀態，404 與 400 的 detail 原樣顯示", async ({ page }) => {
  await setup(page)

  // 這台開發機沒有掛載 /mnt/nas/ctos，後端回的就是空樹或 404；fixture 用空樹
  await page.goto("/files?zone=ctos")
  await expect(page.getByText("CTOS 系統檔案")).toBeVisible()
  await expect(page.getByText("這個資料夾是空的")).toBeVisible()

  await page.goto("/files?zone=temp&path=%2F%E4%B8%8D%E5%AD%98%E5%9C%A8")
  await expect(page.getByRole("alert")).toHaveText("目錄不存在：不存在")

  // 反向代理若把根目錄的 %2F 改掉（併掉斜線、拿掉單點段），後端收到的 path 就是空的
  await page.route(`${API}/api/files/temp/**`, (route) => route.fulfill({ status: 400, json: { detail: "請指定目錄路徑" } }))
  await page.goto("/files?zone=temp")
  await expect(page.getByRole("alert")).toHaveText("請指定目錄路徑")
})
