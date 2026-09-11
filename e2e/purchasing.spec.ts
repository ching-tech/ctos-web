import { expect, test, type Page, type TestInfo } from "@playwright/test"
import {
  mockApi,
  mockBot,
  mockErp,
  mockKb,
  mockProjects,
  purchaseOrderFixtures,
  seedToken,
  trapUnmockedApi,
  userFixture,
  warehouseFixtures,
  type PurchaseOrderFixture,
} from "./helpers"

/** 採購單清單在 md 以下換成卡片；表格列與卡片各自只有一種會進可及性樹，用 role 分流。 */
function poRow(page: Page, testInfo: TestInfo, text: string) {
  const role = testInfo.project.name === "mobile" ? "listitem" : "row"
  return page.getByRole(role).filter({ hasText: text })
}

function dayOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}-${String(d.getDate()).padStart(2, "0")}`
}

test.describe("採購單清單", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await mockErp(page)
    await mockProjects(page)
    await seedToken(page)
  })

  test("顯示欄位與新增入口", async ({ page }, testInfo) => {
    await page.goto("/purchase-orders")

    await expect(page.getByText("共 5 筆")).toBeVisible()

    const row = poRow(page, testInfo, "PO-202608-001")
    await expect(row.getByRole("link", { name: "PO-202608-001" })).toHaveAttribute("href", "/purchase-orders/po-1")
    await expect(row.getByRole("link", { name: "甲一機電股份有限公司" })).toHaveAttribute("href", "/parties/party-1")
    await expect(row.getByText("乙二站區監控案")).toBeVisible()
    await expect(row.getByText("已下單")).toBeVisible()
    await expect(row.getByText("2026-08-01")).toBeVisible()
    await expect(row.getByText("2026-09-30")).toBeVisible()
    // 10 × 12000 ＋ 200 × 40
    await expect(row.getByText("128,000.00")).toBeVisible()

    // 沒有單價的草稿：金額 0、預計到貨破折號
    const draft = poRow(page, testInfo, "PO-202609-002")
    await expect(draft.getByText("0.00", { exact: true })).toBeVisible()

    await expect(page.getByRole("link", { name: "新增採購單" })).toHaveAttribute("href", "/purchase-orders/new")
  })

  test("狀態篩選寫進網址並帶進 query", async ({ page }, testInfo) => {
    await page.goto("/purchase-orders")

    const req = page.waitForRequest((r) => r.url().includes("/api/purchase-orders?") && r.url().includes("status=partial"))
    await page.getByRole("combobox", { name: "狀態篩選" }).click()
    await page.getByRole("option", { name: "部分到貨" }).click()

    expect(new URL((await req).url()).searchParams.get("status")).toBe("partial")
    await expect(page).toHaveURL(/status=partial/)
    await expect(page.getByText("共 1 筆")).toBeVisible()
    await expect(poRow(page, testInfo, "PO-202609-001")).toBeVisible()
  })

  test("供應商與專案篩選寫進網址並帶進 query", async ({ page }, testInfo) => {
    await page.goto("/purchase-orders")

    const supplierReq = page.waitForRequest((r) => r.url().includes("/api/purchase-orders?") && r.url().includes("supplier_id=party-3"))
    await page.getByRole("combobox", { name: "供應商篩選" }).click()
    await page.getByRole("option", { name: "丙三電機" }).click()
    expect(new URL((await supplierReq).url()).searchParams.get("supplier_id")).toBe("party-3")
    await expect(page).toHaveURL(/supplier_id=party-3/)
    await expect(page.getByText("共 2 筆")).toBeVisible()

    const projectReq = page.waitForRequest((r) => r.url().includes("/api/purchase-orders?") && r.url().includes("project_id=proj-3"))
    await page.getByRole("combobox", { name: "專案篩選" }).click()
    await page.getByRole("option", { name: "倉儲自動化評估" }).click()
    expect(new URL((await projectReq).url()).searchParams.get("project_id")).toBe("proj-3")
    await expect(page).toHaveURL(/project_id=proj-3/)
    await expect(page.getByText("共 1 筆")).toBeVisible()
    await expect(poRow(page, testInfo, "PO-202609-001")).toBeVisible()
  })

  test("空狀態", async ({ page }) => {
    await mockErp(page, { purchaseOrders: [] })
    await page.goto("/purchase-orders")
    await expect(page.getByText("還沒有採購單")).toBeVisible()
  })
})

test.describe("新增採購單", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await mockErp(page)
    await mockProjects(page)
    await seedToken(page)
  })

  test("兩行行項送出 POST body，成功後導到明細", async ({ page }) => {
    await page.goto("/purchase-orders/new")

    await page.getByRole("combobox", { name: "供應商" }).click()
    await page.getByRole("option", { name: "甲一機電股份有限公司" }).click()
    await page.getByRole("combobox", { name: "專案" }).click()
    await page.getByRole("option", { name: "乙二站區監控案" }).click()
    await page.getByLabel("下單日").fill("2026-09-12")
    await page.getByLabel("預計到貨").fill("2026-10-15")
    await page.getByLabel("備註").fill("追加料件。")

    await page.getByRole("combobox", { name: "物料第 1 列" }).click()
    await page.getByRole("option", { name: /MTR-0001/ }).click()
    await page.getByLabel("描述第 1 列").fill("含出廠測試報告")
    await page.getByLabel("數量第 1 列").fill("3")
    await page.getByLabel("單價第 1 列").fill("12000")

    await page.getByRole("button", { name: "新增行項" }).click()
    await page.getByRole("combobox", { name: "物料第 2 列" }).click()
    await page.getByRole("option", { name: /CBL-0003/ }).click()
    await page.getByLabel("數量第 2 列").fill("50")
    await page.getByLabel("單價第 2 列").fill("40")

    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/purchase-orders"))
    await page.getByRole("button", { name: "建立採購單" }).click()

    expect((await req).postDataJSON()).toEqual({
      supplier_id: "party-1",
      project_id: "proj-1",
      order_date: "2026-09-12",
      expected_date: "2026-10-15",
      notes: "追加料件。",
      lines: [
        { item_id: "item-1", qty: "3", unit_price: "12000", description: "含出廠測試報告" },
        { item_id: "item-3", qty: "50", unit_price: "40", description: null },
      ],
    })

    // 後端在同一交易產生單號 PO-YYYYMM-NNN，當月已有 001／002，新的是 003
    await expect(page).toHaveURL(/\/purchase-orders\/po-new-\d+$/)
    await expect(page.getByRole("heading", { name: "PO-202609-003" })).toBeVisible()
  })

  test("行項可以移除，沒有行項時不能送出", async ({ page }) => {
    await page.goto("/purchase-orders/new")

    await page.getByRole("combobox", { name: "供應商" }).click()
    await page.getByRole("option", { name: "甲一機電股份有限公司" }).click()
    await expect(page.getByRole("button", { name: "建立採購單" })).toBeDisabled()

    await page.getByRole("combobox", { name: "物料第 1 列" }).click()
    await page.getByRole("option", { name: /MTR-0001/ }).click()
    await page.getByLabel("數量第 1 列").fill("3")
    await expect(page.getByRole("button", { name: "建立採購單" })).toBeEnabled()

    await page.getByRole("button", { name: "移除第 1 列" }).click()
    await expect(page.getByRole("combobox", { name: "物料第 1 列" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "建立採購單" })).toBeDisabled()
  })

  test("物料下拉可以搜尋，送 q 與 page_size=100", async ({ page }) => {
    await page.goto("/purchase-orders/new")

    const first = page.waitForRequest((r) => r.url().includes("/api/items?") && r.url().includes("page_size=100"))
    await expect((await first).url()).toContain("page_size=100")

    const req = page.waitForRequest((r) => r.url().includes("/api/items?") && r.url().includes("q=CBL"))
    await page.getByLabel("搜尋物料").fill("CBL")
    expect(new URL((await req).url()).searchParams.get("q")).toBe("CBL")

    await page.getByRole("combobox", { name: "物料第 1 列" }).click()
    await expect(page.getByRole("option", { name: /CBL-0003/ })).toBeVisible()
    await expect(page.getByRole("option", { name: /MTR-0001/ })).toHaveCount(0)
  })
})

test.describe("採購單明細", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await mockErp(page)
    await mockProjects(page)
    await seedToken(page)
  })

  test("表頭、行項與時間欄", async ({ page }) => {
    await page.goto("/purchase-orders/po-1")

    await expect(page.getByRole("heading", { name: "PO-202608-001" })).toBeVisible()
    await expect(page.getByRole("link", { name: "甲一機電股份有限公司" })).toHaveAttribute("href", "/parties/party-1")
    await expect(page.getByRole("link", { name: "乙二站區監控案" })).toHaveAttribute("href", "/projects/proj-1")
    await expect(page.getByText("已下單")).toBeVisible()
    await expect(page.getByText("128,000.00")).toBeVisible()
    // created_at／updated_at 是 timestamptz（UTC 02:00 與 06:30），台北要顯示成 10:00 與 14:30
    await expect(page.getByText("2026/8/1 10:00:00")).toBeVisible()
    await expect(page.getByText("2026/8/5 14:30:00")).toBeVisible()

    // 行項欄序：物料、描述、數量、單價、已收、未收
    const line = page.getByRole("row").filter({ hasText: "MTR-0001" })
    await expect(line.getByText("感應馬達")).toBeVisible()
    await expect(line.getByRole("cell").nth(1)).toHaveText("含出廠測試報告")
    await expect(line.getByRole("cell").nth(2)).toHaveText("10")
    await expect(line.getByRole("cell").nth(3)).toHaveText("12,000.00")
    await expect(line.getByRole("cell").nth(4)).toHaveText("0")
    await expect(line.getByRole("cell").nth(5)).toHaveText("10")

    await expect(page.getByRole("link", { name: "問 AI" })).toHaveAttribute(
      "href",
      `/assistant?q=${encodeURIComponent("關於採購單「PO-202608-001」：")}`,
    )
    await expect(page.getByRole("link", { name: "編輯" })).toHaveAttribute("href", "/purchase-orders/po-1/edit")
  })

  test("收貨對話框送 line_id 與 warehouse_id，數量預設未收量", async ({ page }) => {
    await page.goto("/purchase-orders/po-1")

    await page.getByRole("button", { name: "收貨" }).click()
    await expect(page.getByLabel("本次收貨第 1 列")).toHaveValue("10")
    await expect(page.getByLabel("本次收貨第 2 列")).toHaveValue("200")

    await page.getByRole("combobox", { name: "入庫倉" }).click()
    await page.getByRole("option", { name: "主倉" }).click()
    await page.getByLabel("本次收貨第 1 列").fill("4")
    await page.getByLabel("本次收貨第 2 列").fill("0")

    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/purchase-orders/po-1/receive"))
    await page.getByRole("button", { name: "送出收貨" }).click()

    expect((await req).postDataJSON()).toEqual({
      lines: [{ line_id: "line-1", qty: "4" }],
      warehouse_id: "wh-1",
    })

    // 收完 4／10 → partial，未收量剩 6
    await expect(page.getByText("部分到貨")).toBeVisible()
    const line = page.getByRole("row").filter({ hasText: "MTR-0001" })
    await expect(line.getByText("6", { exact: true })).toBeVisible()
  })

  test("全部收貨送 all: true", async ({ page }) => {
    await page.goto("/purchase-orders/po-3")

    await page.getByRole("button", { name: "收貨" }).click()
    await page.getByRole("combobox", { name: "入庫倉" }).click()
    await page.getByRole("option", { name: "工地倉" }).click()

    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/purchase-orders/po-3/receive"))
    await page.getByRole("button", { name: "全部收貨" }).click()

    expect((await req).postDataJSON()).toEqual({ all: true, warehouse_id: "wh-2" })
    await expect(page.getByText("已收貨")).toBeVisible()
    await expect(page.getByRole("button", { name: "收貨" })).toHaveCount(0)
  })

  test("超收的 400 原樣顯示，對話框留在原地", async ({ page }) => {
    await page.goto("/purchase-orders/po-1")

    await page.getByRole("button", { name: "收貨" }).click()
    await page.getByRole("combobox", { name: "入庫倉" }).click()
    await page.getByRole("option", { name: "主倉" }).click()
    await page.getByLabel("本次收貨第 1 列").fill("99")
    await page.getByLabel("本次收貨第 2 列").fill("0")
    await page.getByRole("button", { name: "送出收貨" }).click()

    await expect(page.getByRole("alert")).toContainText("收貨數量超過未收量（未收 10.0000，要收 99）")
    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("同一物料兩行時各自用自己的 line_id 收", async ({ page }) => {
    await page.goto("/purchase-orders/po-3")

    await page.getByRole("button", { name: "收貨" }).click()
    // 第一列已收 2／6，未收 4；第二列未收 4
    await expect(page.getByLabel("本次收貨第 1 列")).toHaveValue("4")
    await expect(page.getByLabel("本次收貨第 2 列")).toHaveValue("4")
    await page.getByRole("combobox", { name: "入庫倉" }).click()
    await page.getByRole("option", { name: "主倉" }).click()
    await page.getByLabel("本次收貨第 1 列").fill("0")

    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/purchase-orders/po-3/receive"))
    await page.getByRole("button", { name: "送出收貨" }).click()

    expect((await req).postDataJSON()).toEqual({
      lines: [{ line_id: "line-6", qty: "4" }],
      warehouse_id: "wh-1",
    })
  })

  test("取消送 POST cancel，確認後狀態變已取消", async ({ page }) => {
    await page.goto("/purchase-orders/po-1")

    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/purchase-orders/po-1/cancel"))
    await page.getByRole("button", { name: "取消採購單" }).click()
    await page.getByRole("button", { name: "確定取消" }).click()

    expect((await req).postDataJSON()).toEqual({ reason: null })
    await expect(page.getByText("已取消")).toBeVisible()
    await expect(page.getByRole("link", { name: "編輯" })).toHaveCount(0)
  })

  test("已收過貨的單取消會拿到後端的 400", async ({ page }) => {
    await page.goto("/purchase-orders/po-3")

    await page.getByRole("button", { name: "取消採購單" }).click()
    await page.getByRole("button", { name: "確定取消" }).click()

    await expect(page.getByRole("alert")).toContainText("已收過貨的採購單不能取消，請先做庫存調整")
  })

  test("received 狀態沒有編輯、收貨與取消", async ({ page }) => {
    await page.goto("/purchase-orders/po-2")

    await expect(page.getByRole("heading", { name: "PO-202606-001" })).toBeVisible()
    await expect(page.getByText("已收貨")).toBeVisible()
    await expect(page.getByRole("link", { name: "編輯" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "收貨" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "取消採購單" })).toHaveCount(0)
    await expect(page.getByRole("link", { name: "問 AI" })).toBeVisible()
  })

  test("cancelled 狀態同樣沒有寫入類按鈕", async ({ page }) => {
    await page.goto("/purchase-orders/po-5")

    await expect(page.getByText("已取消")).toBeVisible()
    await expect(page.getByRole("link", { name: "編輯" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "收貨" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "取消採購單" })).toHaveCount(0)
  })

  test("編輯單頭送 PUT，狀態只能挑草稿與已下單", async ({ page }) => {
    await page.goto("/purchase-orders/po-4/edit")

    await expect(page.getByRole("combobox", { name: "狀態" })).toHaveText("草稿")
    await page.getByRole("combobox", { name: "狀態" }).click()
    await expect(page.getByRole("option", { name: "部分到貨" })).toHaveCount(0)
    await page.getByRole("option", { name: "已下單" }).click()
    await page.getByLabel("預計到貨").fill("2026-11-01")

    const req = page.waitForRequest((r) => r.method() === "PUT" && r.url().endsWith("/api/purchase-orders/po-4"))
    await page.getByRole("button", { name: "儲存" }).click()

    expect((await req).postDataJSON()).toEqual({
      supplier_id: "party-1",
      project_id: null,
      status: "ordered",
      order_date: "2026-09-10",
      expected_date: "2026-11-01",
      notes: null,
    })
    await expect(page).toHaveURL(/\/purchase-orders\/po-4$/)
  })

  test("找不到的單顯示回清單連結", async ({ page }) => {
    await page.goto("/purchase-orders/po-nope")
    await expect(page.getByText("找不到這筆採購單")).toBeVisible()
    await expect(page.getByRole("link", { name: "回採購單清單" })).toBeVisible()
  })
})

test.describe("首頁採購待收貨卡", () => {
  /** 六張待收貨單，預計到貨刻意打亂：一張逾期、一張沒填、其餘在未來。 */
  function pendingOrders(): PurchaseOrderFixture[] {
    const line = (id: string) => [
      { id, item_id: "item-1", description: null, qty: "1.0000", unit_price: "100.0000", received_qty: "0.0000", sort_order: 0 },
    ]
    return [
      { id: "po-p1", po_no: "PO-202609-101", supplier_id: "party-1", project_id: null, status: "ordered", order_date: "2026-09-01", expected_date: dayOffset(-3), notes: null, created_by: 1, created_at: "2026-09-01T00:00:00+00:00", updated_at: "2026-09-01T00:00:00+00:00", lines: line("l-p1") },
      { id: "po-p2", po_no: "PO-202609-102", supplier_id: "party-3", project_id: null, status: "partial", order_date: "2026-09-02", expected_date: dayOffset(1), notes: null, created_by: 1, created_at: "2026-09-02T00:00:00+00:00", updated_at: "2026-09-02T00:00:00+00:00", lines: line("l-p2") },
      { id: "po-p3", po_no: "PO-202609-103", supplier_id: "party-1", project_id: null, status: "ordered", order_date: "2026-09-03", expected_date: dayOffset(2), notes: null, created_by: 1, created_at: "2026-09-03T00:00:00+00:00", updated_at: "2026-09-03T00:00:00+00:00", lines: line("l-p3") },
      { id: "po-p4", po_no: "PO-202609-104", supplier_id: "party-1", project_id: null, status: "ordered", order_date: "2026-09-04", expected_date: dayOffset(3), notes: null, created_by: 1, created_at: "2026-09-04T00:00:00+00:00", updated_at: "2026-09-04T00:00:00+00:00", lines: line("l-p4") },
      { id: "po-p5", po_no: "PO-202609-105", supplier_id: "party-1", project_id: null, status: "ordered", order_date: "2026-09-05", expected_date: dayOffset(4), notes: null, created_by: 1, created_at: "2026-09-05T00:00:00+00:00", updated_at: "2026-09-05T00:00:00+00:00", lines: line("l-p5") },
      { id: "po-p6", po_no: "PO-202609-106", supplier_id: "party-1", project_id: null, status: "ordered", order_date: "2026-09-06", expected_date: null, notes: null, created_by: 1, created_at: "2026-09-06T00:00:00+00:00", updated_at: "2026-09-06T00:00:00+00:00", lines: line("l-p6") },
      // 已收貨與已取消不該進卡片
      { id: "po-p7", po_no: "PO-202609-107", supplier_id: "party-1", project_id: null, status: "received", order_date: "2026-09-07", expected_date: dayOffset(-1), notes: null, created_by: 1, created_at: "2026-09-07T00:00:00+00:00", updated_at: "2026-09-07T00:00:00+00:00", lines: line("l-p7") },
    ]
  }

  test("有權限時顯示待收貨單數與最近五張，逾期標紅", async ({ page }) => {
    await mockApi(page)
    await mockKb(page)
    await mockProjects(page)
    await mockErp(page, { purchaseOrders: pendingOrders() })
    await seedToken(page)

    const orderedReq = page.waitForRequest((r) => r.url().includes("/api/purchase-orders?") && r.url().includes("status=ordered"))
    const partialReq = page.waitForRequest((r) => r.url().includes("/api/purchase-orders?") && r.url().includes("status=partial"))

    await page.goto("/")

    expect(new URL((await orderedReq).url()).searchParams.get("page_size")).toBe("100")
    expect(new URL((await partialReq).url()).searchParams.get("page_size")).toBe("100")

    const card = page.getByRole("heading", { name: "採購待收貨" }).locator("..").locator("..")
    // ordered 五張 ＋ partial 一張
    await expect(card.getByText("6", { exact: true })).toBeVisible()
    await expect(card.getByRole("link", { name: "PO-202609-101" })).toHaveAttribute("href", "/purchase-orders/po-p1")
    await expect(card.getByText("逾期")).toHaveCount(1)

    // 依預計到貨升冪取前五，沒填日期的排最後、進不了畫面
    const names = await card.locator("ul li a").allTextContents()
    expect(names).toEqual([
      "PO-202609-101",
      "PO-202609-102",
      "PO-202609-103",
      "PO-202609-104",
      "PO-202609-105",
    ])
    await expect(card.getByText("PO-202609-106")).toHaveCount(0)
    await expect(card.getByText("PO-202609-107")).toHaveCount(0)
  })

  test("沒有待收貨時顯示空狀態", async ({ page }) => {
    await mockApi(page)
    await mockKb(page)
    await mockProjects(page)
    await mockErp(page, { purchaseOrders: [] })
    await seedToken(page)

    await page.goto("/")
    await expect(page.getByRole("heading", { name: "採購待收貨" })).toBeVisible()
    await expect(page.getByText("沒有待收貨的採購單")).toBeVisible()
  })

  test("沒有 inventory-management 權限：卡片不出現，也不打 /api/purchase-orders", async ({ page }) => {
    const noInventoryUser = {
      ...userFixture,
      permissions: { ...userFixture.permissions, apps: { ...userFixture.permissions.apps, "inventory-management": false } },
    }
    await mockApi(page, { user: noInventoryUser })
    await mockKb(page)
    await mockProjects(page)
    await mockErp(page)
    await seedToken(page)

    const requests: string[] = []
    page.on("request", (r) => requests.push(r.url()))

    await page.goto("/")

    await expect(page.getByRole("heading", { name: "採購待收貨" })).toHaveCount(0)
    expect(requests.some((u) => u.includes("/api/purchase-orders"))).toBe(false)
  })
})

test.describe("權限", () => {
  test("沒有 inventory-management 權限：側邊欄沒有採購單，開 /purchase-orders 看到擋下頁", async ({ page }, testInfo) => {
    const noInventoryUser = {
      ...userFixture,
      permissions: { ...userFixture.permissions, apps: { ...userFixture.permissions.apps, "inventory-management": false } },
    }
    // trap 必須最先註冊：後註冊的 mock 會先比對，漏掉的才會掉到它手上。
    const unmocked = await trapUnmockedApi(page)
    await mockApi(page, { user: noInventoryUser })
    await mockKb(page)
    await mockBot(page) // 這個 fixture 有 linebot 權限，首頁會掛「Bot 概況」卡
    await mockProjects(page)
    await mockErp(page)
    await seedToken(page)

    await page.goto("/")
    if (testInfo.project.name === "mobile") await page.getByRole("button", { name: /Toggle Sidebar/i }).click()
    await expect(page.getByRole("navigation").first().getByRole("link", { name: "採購單" })).toHaveCount(0)

    await page.goto("/purchase-orders")
    await expect(page.getByRole("heading", { name: "此功能需要管理員開放" })).toBeVisible()

    await page.goto("/purchase-orders/new")
    await expect(page.getByRole("heading", { name: "此功能需要管理員開放" })).toBeVisible()

    await page.goto("/purchase-orders/po-1")
    await expect(page.getByRole("heading", { name: "此功能需要管理員開放" })).toBeVisible()

    expect(unmocked).toEqual([])
  })

  test("只有一個倉庫時收貨不必挑倉別", async ({ page }) => {
    await mockApi(page)
    await mockErp(page, { warehouses: [warehouseFixtures[0]], purchaseOrders: purchaseOrderFixtures })
    await mockProjects(page)
    await seedToken(page)

    await page.goto("/purchase-orders/po-1")
    await page.getByRole("button", { name: "收貨" }).click()
    await page.getByLabel("本次收貨第 2 列").fill("0")

    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/purchase-orders/po-1/receive"))
    await page.getByRole("button", { name: "送出收貨" }).click()

    // 只有一個倉時下拉預選它，body 照樣帶 warehouse_id
    expect((await req).postDataJSON()).toEqual({
      lines: [{ line_id: "line-1", qty: "10" }],
      warehouse_id: "wh-1",
    })
  })
})
