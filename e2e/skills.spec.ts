import { expect, test, type Page, type TestInfo } from "@playwright/test"
import {
  adminFixture,
  duplicateSlugHubFixtures,
  mockApi,
  mockConfigApps,
  mockSkills,
  seedToken,
  skillDetailFixtures,
  trapUnmockedApi,
} from "./helpers"

/** 清單在 md 以下換成卡片；表格列與卡片各自只有一種會進可及性樹，用 role 分流（照 shares.spec.ts）。 */
function skillItem(page: Page, testInfo: TestInfo, name: string) {
  const role = testInfo.project.name === "mobile" ? "listitem" : "row"
  return page.getByRole(role).filter({ hasText: name })
}

const REFERENCE_FILES = {
  "inventory-helper/references/庫存查詢.md": "## 庫存查詢\n\n先確認倉別再查。",
  "inventory-helper/references/調撥規則.txt": "同倉不可調撥。",
}

test.describe("清單", () => {
  test("列出 skill，需要的 app 清單每個都列出來", async ({ page }, testInfo) => {
    const unmocked = await trapUnmockedApi(page)
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page)
    await mockSkills(page)
    await seedToken(page)
    await page.goto("/skills")

    await expect(page.getByText("共 3 個")).toBeVisible()

    const inventory = skillItem(page, testInfo, "inventory-helper")
    await expect(inventory.getByRole("link", { name: "inventory-helper" })).toHaveAttribute("href", "/skills/inventory-helper")
    await expect(inventory.getByText("查庫存餘額與調撥紀錄的助手說明。")).toBeVisible()
    await expect(inventory.getByText("物料管理", { exact: true })).toBeVisible()
    await expect(inventory.getByText("native", { exact: true })).toBeVisible()

    // requires_app 是清單時兩個 app 都要看得到（語意是「任一」）。
    const vendor = skillItem(page, testInfo, "vendor-brief")
    await expect(vendor.getByText("廠商管理", { exact: true })).toBeVisible()
    await expect(vendor.getByText("專案管理", { exact: true })).toBeVisible()

    // requires_app 為 null 顯示「不限」。
    await expect(skillItem(page, testInfo, "pdf-toolkit").getByText("不限")).toBeVisible()

    expect(unmocked).toEqual([])
  })

  test("搜尋就地過濾名稱與說明", async ({ page }, testInfo) => {
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page)
    const store = await mockSkills(page)
    await seedToken(page)
    await page.goto("/skills")
    await expect(page.getByText("共 3 個")).toBeVisible()
    const listCalls = store.listCalls

    await page.getByRole("textbox", { name: "搜尋 skill" }).fill("pdf")
    await expect(page.getByText("共 1 個")).toBeVisible()
    await expect(skillItem(page, testInfo, "inventory-helper")).toHaveCount(0)

    // 說明也在比對範圍內。
    await page.getByRole("textbox", { name: "搜尋 skill" }).fill("往來對象")
    await expect(skillItem(page, testInfo, "vendor-brief")).toBeVisible()

    await page.getByRole("textbox", { name: "搜尋 skill" }).fill("查無此物")
    await expect(page.getByText("沒有符合的 skill")).toBeVisible()

    // 就地過濾：後端沒有關鍵字參數，不該為了搜尋再抓一次清單。
    expect(store.listCalls).toBe(listCalls)
  })

  test("重新載入回報數量並重抓清單", async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page)
    const store = await mockSkills(page)
    await seedToken(page)
    await page.goto("/skills")
    await expect(page.getByText("共 3 個")).toBeVisible()
    const listCalls = store.listCalls

    await page.getByRole("button", { name: "重新載入" }).click()
    await expect(page.getByRole("status")).toContainText("已重新載入 3 個 skill")
    expect(store.reloadCalls).toBe(1)
    await expect.poll(() => store.listCalls).toBeGreaterThan(listCalls)
  })
})

test.describe("明細", () => {
  test("顯示提示詞、腳本只列不執行，references 點了才顯示內容", async ({ page }) => {
    const unmocked = await trapUnmockedApi(page)
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page)
    await mockSkills(page, { files: REFERENCE_FILES })
    await seedToken(page)
    await page.goto("/skills/inventory-helper")

    await expect(page.getByRole("heading", { name: "inventory-helper", level: 1 })).toBeVisible()
    // prompt 走知識庫那支 Markdown 元件，內文的 `##` 會降一階成 h3。
    await expect(page.getByRole("heading", { name: "查庫存" })).toBeVisible()
    await expect(page.getByText("MIT", { exact: true })).toBeVisible()

    // 腳本只列名稱，沒有執行鈕（`POST /{name}/scripts/{script}/run` 不做 UI）。
    await expect(page.getByText("scripts/stock_check.py")).toBeVisible()
    await expect(page.getByText("盤點差異表")).toBeVisible()
    await expect(page.getByRole("button", { name: /執行/ })).toHaveCount(0)

    // 沒點之前不抓檔案內容。
    await expect(page.getByText("先確認倉別再查。")).toHaveCount(0)
    await page.getByRole("button", { name: "references/庫存查詢.md" }).click()
    await expect(page.getByText("先確認倉別再查。")).toBeVisible()

    // 非 .md 用 pre 原樣顯示。
    await page.getByRole("button", { name: "references/調撥規則.txt" }).click()
    await expect(page.getByText("同倉不可調撥。")).toBeVisible()

    expect(unmocked).toEqual([])
  })

  test("安裝資訊只有從 Hub 裝的才有，摺疊起來", async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page)
    await mockSkills(page)
    await seedToken(page)

    await page.goto("/skills/inventory-helper")
    await expect(page.getByText("沒有安裝資訊（不是從 Hub 裝的）")).toBeVisible()

    await page.goto("/skills/pdf-toolkit")
    await expect(page.getByText("沒有提示詞")).toBeVisible()
    await expect(page.getByText("1.4.0")).toHaveCount(0)
    await page.getByRole("button", { name: "展開" }).click()
    await expect(page.getByText("1.4.0")).toBeVisible()
  })

  test("找不到的 skill 顯示後端的 404 detail", async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page)
    await mockSkills(page)
    await seedToken(page)
    await page.goto("/skills/nope")
    await expect(page.getByRole("alert")).toContainText("Skill 'nope' not found")
  })
})

test.describe("編輯", () => {
  test("requires_app 多選送的是清單", async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page)
    const store = await mockSkills(page)
    await seedToken(page)
    await page.goto("/skills/inventory-helper")

    await expect(page.getByRole("checkbox", { name: "物料管理" })).toBeChecked()
    await page.getByRole("checkbox", { name: "廠商管理" }).check()
    await page.getByRole("button", { name: "儲存" }).click()

    await expect(page.getByRole("status")).toContainText("已儲存")
    expect(store.puts).toEqual([
      { name: "inventory-helper", body: { requires_app: ["inventory-management", "vendor-management"] } },
    ])
  })

  test("清空 requires_app 送 null", async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page)
    const store = await mockSkills(page)
    await seedToken(page)
    await page.goto("/skills/inventory-helper")

    await page.getByRole("checkbox", { name: "物料管理" }).uncheck()
    await page.getByRole("button", { name: "儲存" }).click()

    await expect(page.getByRole("status")).toContainText("已儲存")
    expect(store.puts).toEqual([{ name: "inventory-helper", body: { requires_app: null } }])
  })

  test("允許的工具用標籤增刪，只送有變的那一個欄位", async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page)
    const store = await mockSkills(page)
    await seedToken(page)
    await page.goto("/skills/inventory-helper")

    await page.getByRole("button", { name: "移除 Grep" }).click()
    await page.getByRole("textbox", { name: "新增工具" }).fill("Bash")
    await page.getByRole("button", { name: "新增" }).first().click()
    await page.getByRole("button", { name: "儲存" }).click()

    await expect(page.getByRole("status")).toContainText("已儲存")
    expect(store.puts).toEqual([{ name: "inventory-helper", body: { allowed_tools: ["Read", "Bash"] } }])
  })

  test("一個欄位都沒變就不送，免得吃後端的 400", async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page)
    const store = await mockSkills(page)
    await seedToken(page)
    await page.goto("/skills/inventory-helper")

    await expect(page.getByRole("checkbox", { name: "物料管理" })).toBeChecked()
    await page.getByRole("button", { name: "儲存" }).click()
    await expect(page.getByRole("status")).toContainText("沒有變動，不需要儲存")
    expect(store.puts).toEqual([])

    // 勾了又取消，回到原狀一樣不送。
    await page.getByRole("checkbox", { name: "廠商管理" }).check()
    await page.getByRole("checkbox", { name: "廠商管理" }).uncheck()
    await page.getByRole("button", { name: "儲存" }).click()
    await expect(page.getByRole("status")).toContainText("沒有變動，不需要儲存")
    expect(store.puts).toEqual([])
  })

  test("後端 app 清單沒宣告的 id 要留住，改別的欄位不會把它洗掉", async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page)
    // `debug-skill` 的 SKILL.md 寫的就是 `admin`，那不在 `GET /api/config/apps` 的 21 筆裡。
    const store = await mockSkills(page, {
      skills: [{ ...skillDetailFixtures[0], name: "debug-skill", requires_app: "admin" }],
    })
    await seedToken(page)
    await page.goto("/skills/debug-skill")

    // 後端沒給名字就顯示 id 本身，而且要是勾起來的。
    await expect(page.getByRole("checkbox", { name: "admin" })).toBeChecked()

    // 只改工具，requires_app 不該被送出、也不該被清掉。
    await page.getByRole("button", { name: "移除 Grep" }).click()
    await page.getByRole("button", { name: "儲存" }).click()
    await expect(page.getByRole("status")).toContainText("已儲存")
    expect(store.puts).toEqual([{ name: "debug-skill", body: { allowed_tools: ["Read"] } }])
    await expect(page.getByRole("checkbox", { name: "admin" })).toBeChecked()
  })

  test("app 清單抓不到時只剩已選的那些，頁面照樣能用", async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page, "fail")
    const store = await mockSkills(page)
    await seedToken(page)
    await page.goto("/skills/inventory-helper")

    // 沒有名字可查就顯示 app id，而且原本的值還在。
    await expect(page.getByRole("checkbox", { name: "inventory-management" })).toBeChecked()
    await expect(page.getByRole("checkbox", { name: "物料管理" })).toHaveCount(0)

    await page.getByRole("checkbox", { name: "inventory-management" }).uncheck()
    await page.getByRole("button", { name: "儲存" }).click()
    await expect(page.getByRole("status")).toContainText("已儲存")
    expect(store.puts).toEqual([{ name: "inventory-helper", body: { requires_app: null } }])
  })

  test("後端擋下來時 detail 原樣顯示", async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page)
    await mockSkills(page, { updateError: "SKILL.md 沒有 frontmatter，無法寫回" })
    await seedToken(page)
    await page.goto("/skills/inventory-helper")

    await page.getByRole("checkbox", { name: "廠商管理" }).check()
    await page.getByRole("button", { name: "儲存" }).click()
    await expect(page.getByRole("status")).toContainText("SKILL.md 沒有 frontmatter，無法寫回")
  })
})

test.describe("刪除", () => {
  test("要先確認，確認後回清單且那一筆不見了", async ({ page }, testInfo) => {
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page)
    const store = await mockSkills(page)
    await seedToken(page)
    await page.goto("/skills/pdf-toolkit")

    await page.getByRole("button", { name: "刪除" }).click()
    await expect(page.getByText("確定移除「pdf-toolkit」？")).toBeVisible()
    await page.getByRole("button", { name: "返回" }).click()
    expect(store.deleted).toEqual([])

    await page.getByRole("button", { name: "刪除" }).click()
    await page.getByRole("button", { name: "確定移除" }).click()

    await expect(page).toHaveURL(/\/skills$/)
    await expect(page.getByText("共 2 個")).toBeVisible()
    await expect(skillItem(page, testInfo, "pdf-toolkit")).toHaveCount(0)
    expect(store.deleted).toEqual(["pdf-toolkit"])
  })
})

test.describe("Hub", () => {
  test("搜尋、檢視、安裝，安裝完重抓清單", async ({ page }, testInfo) => {
    const unmocked = await trapUnmockedApi(page)
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page)
    const store = await mockSkills(page)
    await seedToken(page)
    await page.goto("/skills")
    await expect(page.getByText("共 3 個")).toBeVisible()

    await page.getByRole("button", { name: "從 Hub 安裝" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()

    // 來源下拉的選項來自 `GET /hub/sources`。
    await page.getByRole("combobox", { name: "來源" }).click()
    await expect(page.getByRole("option", { name: "ClawHub" })).toBeVisible()
    await expect(page.getByRole("option", { name: "SkillHub" })).toBeVisible()
    await page.getByRole("option", { name: "ClawHub" }).click()

    await page.getByRole("textbox", { name: "搜尋 Hub" }).fill("invoice")
    await page.getByRole("button", { name: "搜尋" }).click()

    await expect(page.getByText("發票辨識")).toBeVisible()
    // 指定來源時只回那一家。
    await expect(page.getByText("會議紀錄")).toHaveCount(0)

    await page.getByRole("button", { name: "檢視" }).click()
    await expect(page.getByText("invoice-reader 的 SKILL.md")).toBeVisible()
    await expect(page.getByText("示範內容。")).toBeVisible()

    const listCalls = store.listCalls
    await page.getByRole("button", { name: "安裝", exact: true }).click()
    await page.getByRole("button", { name: "確定安裝" }).click()

    await expect(page.getByRole("alert")).toContainText("已安裝 invoice-reader 2.1.0")
    expect(store.installed).toEqual([{ name: "invoice-reader", source: "clawhub", version: "2.1.0" }])
    await expect.poll(() => store.listCalls).toBeGreaterThan(listCalls)

    await page.getByRole("button", { name: "關閉" }).click()
    await expect(page.getByText("共 4 個")).toBeVisible()
    await expect(skillItem(page, testInfo, "invoice-reader")).toBeVisible()

    expect(unmocked).toEqual([])
  })

  test("不指定來源時兩家一起搜，其中一家掛掉的訊息顯示出來", async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page)
    await mockSkills(page, { hubErrors: ["SkillHub: 連線逾時"] })
    await seedToken(page)
    await page.goto("/skills")

    await page.getByRole("button", { name: "從 Hub 安裝" }).click()
    await page.getByRole("textbox", { name: "搜尋 Hub" }).fill("筆記")
    await page.getByRole("button", { name: "搜尋" }).click()

    await expect(page.getByText("發票辨識")).toBeVisible()
    await expect(page.getByText("會議紀錄")).toBeVisible()
    await expect(page.getByRole("alert")).toContainText("SkillHub: 連線逾時")
  })

  test("同一個 slug 不同作者：安裝確認只出現在按下去的那一列", async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page)
    const store = await mockSkills(page, { hubResults: duplicateSlugHubFixtures })
    await seedToken(page)
    await page.goto("/skills")

    await page.getByRole("button", { name: "從 Hub 安裝" }).click()
    await page.getByRole("textbox", { name: "搜尋 Hub" }).fill("pdf")
    await page.getByRole("button", { name: "搜尋" }).click()

    // 兩列的 slug 一樣，作者不一樣。
    await expect(page.getByText("作者 甲作者")).toBeVisible()
    await expect(page.getByText("作者 乙作者")).toBeVisible()

    const second = page.getByRole("listitem").filter({ hasText: "乙作者" })
    await second.getByRole("button", { name: "安裝", exact: true }).click()
    // 只有一個確認區塊，而且在第二列裡。
    await expect(page.getByRole("button", { name: "確定安裝" })).toHaveCount(1)
    await expect(second.getByRole("button", { name: "確定安裝" })).toBeVisible()

    await second.getByRole("button", { name: "確定安裝" }).click()
    // 搜尋結果的 version 是 null，前端就不送 version，讓後端抓 latest。
    expect(store.installed).toEqual([{ name: "pdf", source: "clawhub" }])
  })

  test("已安裝的 409 detail 原樣顯示", async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockConfigApps(page)
    await mockSkills(page, { installConflict: true })
    await seedToken(page)
    await page.goto("/skills")

    await page.getByRole("button", { name: "從 Hub 安裝" }).click()
    await page.getByRole("textbox", { name: "搜尋 Hub" }).fill("invoice")
    await page.getByRole("button", { name: "搜尋" }).click()
    await page.getByRole("button", { name: "安裝", exact: true }).first().click()
    await page.getByRole("button", { name: "確定安裝" }).click()

    await expect(page.getByRole("alert")).toContainText("Skill 'invoice-reader' 已安裝。如需更新請先移除。")
  })
})

test("非管理員被擋在外面，側邊欄也沒有這一項", async ({ page }, testInfo) => {
  await mockApi(page) // userFixture 不是管理員
  await mockConfigApps(page)
  await mockSkills(page)
  await seedToken(page)

  await page.goto("/skills")
  await expect(page.getByRole("heading", { name: "此頁只有管理員能使用" })).toBeVisible()
  await expect(skillItem(page, testInfo, skillDetailFixtures[0].name)).toHaveCount(0)

  await page.goto("/skills/inventory-helper")
  await expect(page.getByRole("heading", { name: "此頁只有管理員能使用" })).toBeVisible()

  await page.goto("/")
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: /Toggle Sidebar/i }).click()
  await expect(page.getByRole("navigation").first().getByRole("link", { name: "Skills" })).toHaveCount(0)
})
