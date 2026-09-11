import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { adminFixture, mockApi, mockBot, mockErp, mockKb, mockProjects, seedToken, trapUnmockedApi, userFixture } from "./helpers"

/** 物料清單在 md 以下換成卡片；表格列與卡片各自只有一種會進可及性樹，用 role 分流。 */
function itemRow(page: Page, testInfo: TestInfo, text: string) {
  const role = testInfo.project.name === "mobile" ? "listitem" : "row"
  return page.getByRole(role).filter({ hasText: text })
}

test.describe("物料清單", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await mockErp(page)
    await seedToken(page)
  })

  test("顯示欄位、總庫存與倉庫入口", async ({ page }, testInfo) => {
    await page.goto("/items")

    await expect(page.getByText("共 3 筆")).toBeVisible()

    const row = itemRow(page, testInfo, "MTR-0001")
    await expect(row.getByRole("link", { name: "MTR-0001" })).toHaveAttribute("href", "/items/item-1")
    await expect(row.getByText("感應馬達")).toBeVisible()
    await expect(row.getByText("三相 220V 1HP")).toBeVisible()
    await expect(row.getByText("台", { exact: true })).toBeVisible()
    await expect(row.getByText("馬達", { exact: true })).toBeVisible()
    await expect(row.getByRole("link", { name: "甲一機電股份有限公司" })).toHaveAttribute("href", "/parties/party-1")
    // 兩個倉合計 12 + 3；後端送的是 Numeric(18,4) 字串，畫面要收掉尾數
    await expect(row.getByText("15", { exact: true })).toBeVisible()

    // 沒有庫存也沒有供應商的那筆顯示破折號
    const noStock = itemRow(page, testInfo, "CBL-0003")
    await expect(noStock.getByText("0", { exact: true })).toBeVisible()

    await expect(page.getByRole("link", { name: "新增物料" })).toBeVisible()
    await expect(page.getByRole("link", { name: "倉庫" })).toHaveAttribute("href", "/warehouses")
  })

  test("搜尋 debounce 後送 q 並寫進網址", async ({ page }, testInfo) => {
    await page.goto("/items")

    const req = page.waitForRequest((r) => r.url().includes("/api/items?") && r.url().includes("q="))
    await page.getByLabel("搜尋").fill("induction")
    expect(new URL((await req).url()).searchParams.get("q")).toBe("induction")
    await expect(page).toHaveURL(/q=/)
    // 別名也在後端的 ILIKE 範圍內
    await expect(page.getByText("共 1 筆")).toBeVisible()
    await expect(itemRow(page, testInfo, "MTR-0001")).toBeVisible()
  })

  test("分類篩選寫進網址並帶進請求 query", async ({ page }, testInfo) => {
    await page.goto("/items")

    const req = page.waitForRequest((r) => r.url().includes("/api/items?") && r.url().includes("item_group="))
    await page.getByRole("combobox", { name: "分類篩選" }).click()
    await page.getByRole("option", { name: "感測器" }).click()
    expect(new URL((await req).url()).searchParams.get("item_group")).toBe("感測器")
    await expect(page).toHaveURL(/item_group=/)
    await expect(page.getByText("共 1 筆")).toBeVisible()
    await expect(itemRow(page, testInfo, "SNS-0002")).toBeVisible()
  })

  test("空狀態顯示還沒有物料", async ({ page }) => {
    await mockErp(page, { items: [] })
    await page.goto("/items")

    await expect(page.getByText("還沒有物料")).toBeVisible()
  })

  test("點料號進明細", async ({ page }) => {
    await page.goto("/items")

    await page.getByRole("link", { name: "MTR-0001" }).click()
    await expect(page).toHaveURL(/\/items\/item-1$/)
    await expect(page.getByRole("heading", { name: "MTR-0001 感應馬達" })).toBeVisible()
  })
})

test.describe("物料明細", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await mockErp(page)
    await seedToken(page)
  })

  test("表頭顯示主檔與別名 chips", async ({ page }) => {
    await page.goto("/items/item-1")

    await expect(page.getByRole("heading", { name: "MTR-0001 感應馬達" })).toBeVisible()
    const info = page.getByRole("region", { name: "物料資訊" })
    await expect(info.getByText("三相 220V 1HP")).toBeVisible()
    await expect(info.getByText("台", { exact: true })).toBeVisible()
    await expect(info.getByText("馬達", { exact: true })).toBeVisible()
    await expect(info.getByRole("link", { name: "甲一機電股份有限公司" })).toHaveAttribute("href", "/parties/party-1")
    await expect(info.getByText("8,200.00")).toBeVisible()
    await expect(info.getByText("14 天")).toBeVisible()
    await expect(info.getByText("induction motor")).toBeVisible()
    await expect(info.getByText("感應電動機")).toBeVisible()
  })

  test("問 AI 帶料號與品名前綴導到 AI 助手", async ({ page }) => {
    await page.goto("/items/item-1")

    await expect(page.getByRole("link", { name: "問 AI" })).toHaveAttribute(
      "href",
      `/assistant?q=${encodeURIComponent("關於物料「MTR-0001 感應馬達」：")}`,
    )
  })

  test("庫存分頁列出各倉餘額，異動分頁列出異動並寫進網址", async ({ page }) => {
    await page.goto("/items/item-1")

    await expect(page.getByRole("tab", { name: "庫存" })).toHaveAttribute("data-state", "active")
    const balances = page.getByRole("region", { name: "各倉餘額" })
    await expect(balances.getByRole("row").filter({ hasText: "主倉" }).getByText("12")).toBeVisible()
    await expect(balances.getByRole("row").filter({ hasText: "工地倉" }).getByText("3")).toBeVisible()
    await expect(page.getByText("總庫存 15")).toBeVisible()

    await page.getByRole("tab", { name: "異動" }).click()
    await expect(page).toHaveURL(/tab=movements/)
    const receipt = page.getByRole("row").filter({ hasText: "採購入庫" })
    await expect(receipt.getByText("採購收貨")).toBeVisible()
    await expect(receipt.getByText("+10")).toBeVisible()
    const issue = page.getByRole("row").filter({ hasText: "工地領用" })
    await expect(issue.getByText("領用出庫")).toBeVisible()
    await expect(issue.getByText("-2")).toBeVisible()
    await expect(page.getByRole("row").filter({ hasText: "盤點補回" }).getByText("調整")).toBeVisible()

    await page.getByRole("tab", { name: "庫存" }).click()
    await expect(page).not.toHaveURL(/tab=/)
  })

  test("沒有庫存與異動時顯示空狀態", async ({ page }) => {
    await page.goto("/items/item-3")
    await expect(page.getByText("這個物料還沒有任何倉別餘額")).toBeVisible()

    await page.goto("/items/item-3?tab=movements")
    await expect(page.getByText("還沒有庫存異動")).toBeVisible()
  })

  test("調整庫存送 POST /api/stock/adjust，成功後餘額更新", async ({ page }) => {
    await page.goto("/items/item-1")

    await page.getByRole("button", { name: "調整" }).click()
    await page.getByRole("combobox", { name: "倉庫" }).click()
    await page.getByRole("option", { name: "主倉" }).click()
    await page.getByLabel("增減數量").fill("-4")
    await page.getByLabel("備註").fill("報廢兩台加誤植")

    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/stock/adjust"))
    await page.getByRole("button", { name: "送出調整" }).click()
    expect((await req).postDataJSON()).toEqual({
      item_id: "item-1",
      warehouse_id: "wh-1",
      qty_delta: "-4",
      reason: "adjust",
      note: "報廢兩台加誤植",
    })

    const balances = page.getByRole("region", { name: "各倉餘額" })
    await expect(balances.getByRole("row").filter({ hasText: "主倉" }).getByText("8")).toBeVisible()
    await expect(page.getByText("總庫存 11")).toBeVisible()
  })

  test("調整到負庫存時後端的 400 detail 原樣顯示", async ({ page }) => {
    await page.goto("/items/item-1")

    await page.getByRole("button", { name: "調整" }).click()
    await page.getByRole("combobox", { name: "倉庫" }).click()
    await page.getByRole("option", { name: "工地倉" }).click()
    await page.getByLabel("增減數量").fill("-99")
    await page.getByRole("button", { name: "送出調整" }).click()

    await expect(page.getByRole("alert")).toContainText("庫存不足")
    await expect(page.getByRole("alert")).toContainText("不允許負庫存")
  })

  test("調撥送 POST /api/stock/transfer，成功後兩倉餘額都變", async ({ page }) => {
    await page.goto("/items/item-1")

    await page.getByRole("button", { name: "調撥" }).click()
    await page.getByRole("combobox", { name: "來源倉" }).click()
    await page.getByRole("option", { name: "主倉" }).click()
    await page.getByRole("combobox", { name: "目的倉" }).click()
    await page.getByRole("option", { name: "工地倉" }).click()
    await page.getByLabel("數量").fill("5")
    await page.getByLabel("備註").fill("撥給工地")

    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/stock/transfer"))
    await page.getByRole("button", { name: "送出調撥" }).click()
    expect((await req).postDataJSON()).toEqual({
      item_id: "item-1",
      from_warehouse_id: "wh-1",
      to_warehouse_id: "wh-2",
      qty: "5",
      note: "撥給工地",
    })

    const balances = page.getByRole("region", { name: "各倉餘額" })
    await expect(balances.getByRole("row").filter({ hasText: "主倉" }).getByText("7")).toBeVisible()
    await expect(balances.getByRole("row").filter({ hasText: "工地倉" }).getByText("8")).toBeVisible()
  })

  test("調撥數量超過來源倉餘額時顯示後端的 400", async ({ page }) => {
    await page.goto("/items/item-1")

    await page.getByRole("button", { name: "調撥" }).click()
    await page.getByRole("combobox", { name: "來源倉" }).click()
    await page.getByRole("option", { name: "工地倉" }).click()
    await page.getByRole("combobox", { name: "目的倉" }).click()
    await page.getByRole("option", { name: "主倉" }).click()
    await page.getByLabel("數量").fill("50")
    await page.getByRole("button", { name: "送出調撥" }).click()

    await expect(page.getByRole("alert")).toContainText("庫存不足")
  })

  test("刪除後回清單", async ({ page }) => {
    await page.goto("/items/item-1")

    await page.getByRole("button", { name: "刪除物料" }).click()
    await expect(page.getByText("確定刪除這筆物料？")).toBeVisible()
    const req = page.waitForRequest((r) => r.method() === "DELETE" && r.url().endsWith("/api/items/item-1"))
    await page.getByRole("button", { name: "確定" }).click()
    await req
    await expect(page).toHaveURL(/\/items$/)
    await expect(page.getByText("共 2 筆")).toBeVisible()
  })

  test("找不到時顯示提示與回清單連結", async ({ page }) => {
    await page.goto("/items/item-missing")

    await expect(page.getByText("找不到這筆物料")).toBeVisible()
    await expect(page.getByRole("link", { name: "回物料清單" })).toBeVisible()
  })
})

test.describe("物料新增與編輯", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockErp(page)
    await seedToken(page)
  })

  test("新增送出 body 含別名陣列與預設供應商，201 後到明細", async ({ page }) => {
    // 供應商下拉打的是往來對象清單的 role=supplier
    const supplierReq = page.waitForRequest((r) => r.url().includes("/api/parties?") && r.url().includes("role=supplier"))
    await page.goto("/items/new")
    expect(new URL((await supplierReq).url()).searchParams.get("page_size")).toBe("100")

    await page.getByLabel("料號").fill("VLV-0004")
    await page.getByLabel("品名").fill("電磁閥")
    await page.getByLabel("規格").fill("兩位五通 DC24V")
    await page.getByLabel("單位").fill("顆")
    await page.getByLabel("分類").fill("氣動元件")
    await page.getByRole("combobox", { name: "預設供應商" }).click()
    await page.getByRole("option", { name: "甲一機電股份有限公司" }).click()
    await page.getByLabel("採購價").fill("980")
    await page.getByLabel("交期天數").fill("21")
    await page.getByLabel("別名").fill("solenoid valve, 電磁閥門")

    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/items"))
    await page.getByRole("button", { name: "儲存" }).click()
    expect((await req).postDataJSON()).toMatchObject({
      code: "VLV-0004",
      name: "電磁閥",
      spec: "兩位五通 DC24V",
      unit: "顆",
      item_group: "氣動元件",
      default_supplier_id: "party-1",
      purchase_price: "980",
      lead_days: 21,
      aliases: ["solenoid valve", "電磁閥門"],
    })
    await expect(page).toHaveURL(/\/items\/item-new-\d+$/)
    await expect(page.getByRole("heading", { name: "VLV-0004 電磁閥" })).toBeVisible()
  })

  test("料號撞名時後端的 400 detail 原樣顯示", async ({ page }) => {
    await page.goto("/items/new")

    await page.getByLabel("料號").fill("MTR-0001")
    await page.getByLabel("品名").fill("另一顆馬達")
    await page.getByRole("button", { name: "儲存" }).click()

    await expect(page.getByRole("alert")).toContainText("料號已存在：MTR-0001")
    await expect(page).toHaveURL(/\/items\/new$/)
  })

  test("編輯載入既有值，PUT 後回明細", async ({ page }) => {
    await page.goto("/items/item-1/edit")

    await expect(page.getByLabel("料號")).toHaveValue("MTR-0001")
    await expect(page.getByLabel("品名")).toHaveValue("感應馬達")
    await expect(page.getByLabel("別名")).toHaveValue("induction motor, 感應電動機")
    await expect(page.getByLabel("交期天數")).toHaveValue("14")

    const req = page.waitForRequest((r) => r.method() === "PUT" && r.url().endsWith("/api/items/item-1"))
    await page.getByLabel("品名").fill("感應馬達（新）")
    await page.getByRole("button", { name: "儲存" }).click()
    expect((await req).postDataJSON()).toMatchObject({ code: "MTR-0001", name: "感應馬達（新）" })
    await expect(page).toHaveURL(/\/items\/item-1$/)
  })
})

test.describe("倉庫", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await mockErp(page)
    await seedToken(page)
  })

  test("清單、新增與編輯", async ({ page }) => {
    await page.goto("/warehouses")

    await expect(page.getByRole("heading", { name: "倉庫" })).toBeVisible()
    await expect(page.getByRole("row").filter({ hasText: "A01" }).getByText("主倉")).toBeVisible()
    await expect(page.getByRole("link", { name: "回物料清單" })).toHaveAttribute("href", "/items")

    await page.getByRole("button", { name: "新增倉庫" }).click()
    const createReq = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/warehouses"))
    await page.getByLabel("代碼").fill("D01")
    await page.getByLabel("名稱").fill("委外倉")
    await page.getByRole("button", { name: "新增", exact: true }).click()
    expect((await createReq).postDataJSON()).toEqual({ code: "D01", name: "委外倉" })
    await expect(page.getByRole("row").filter({ hasText: "D01" }).getByText("委外倉")).toBeVisible()

    await page.getByRole("row").filter({ hasText: "C01" }).getByRole("button", { name: "編輯" }).click()
    await expect(page.getByLabel("代碼")).toHaveValue("C01")
    const editReq = page.waitForRequest((r) => r.method() === "PUT" && r.url().endsWith("/api/warehouses/wh-3"))
    await page.getByLabel("名稱").fill("備品倉（二樓）")
    await page.getByRole("button", { name: "儲存" }).click()
    expect((await editReq).postDataJSON()).toEqual({ code: "C01", name: "備品倉（二樓）" })
    await expect(page.getByText("備品倉（二樓）")).toBeVisible()
  })

  test("代碼撞名時後端的 400 detail 原樣顯示", async ({ page }) => {
    await page.goto("/warehouses")

    await page.getByRole("button", { name: "新增倉庫" }).click()
    await page.getByLabel("代碼").fill("A01")
    await page.getByLabel("名稱").fill("重複代碼倉")
    await page.getByRole("button", { name: "新增", exact: true }).click()

    await expect(page.getByRole("alert")).toContainText("倉庫代碼已存在：A01")
  })
})

test.describe("權限", () => {
  test("沒有 inventory-management 權限：側邊欄沒有物料庫存，開 /items 與 /warehouses 看到擋下頁", async ({ page }, testInfo) => {
    const noInventoryUser = {
      ...userFixture,
      permissions: {
        ...userFixture.permissions,
        apps: { ...userFixture.permissions.apps, "inventory-management": false },
      },
    }
    // trap 必須最先註冊：後註冊的 mock 會先比對，漏掉的才會掉到它手上。
    const unmocked = await trapUnmockedApi(page)
    await mockApi(page, { user: noInventoryUser })
    await mockKb(page)
    await mockBot(page)
    await mockProjects(page)
    await mockErp(page)
    await seedToken(page)

    await page.goto("/")
    if (testInfo.project.name === "mobile") await page.getByRole("button", { name: /Toggle Sidebar/i }).click()
    await expect(page.getByRole("navigation").first().getByRole("link", { name: "物料庫存" })).toHaveCount(0)

    await page.goto("/items")
    await expect(page.getByRole("heading", { name: "此功能需要管理員開放" })).toBeVisible()

    await page.goto("/warehouses")
    await expect(page.getByRole("heading", { name: "此功能需要管理員開放" })).toBeVisible()

    expect(unmocked).toEqual([])
  })
})
