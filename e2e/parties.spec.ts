import { expect, test, type Page, type TestInfo } from "@playwright/test"
import {
  adminFixture,
  mockApi,
  mockBot,
  mockErp,
  mockKb,
  mockProjects,
  seedToken,
  trapUnmockedApi,
  userFixture,
} from "./helpers"

/** 清單在 md 以下換成卡片；表格列與卡片各自只有一種會進可及性樹，用 role 分流。 */
function partyItem(page: Page, testInfo: TestInfo, name: string) {
  const role = testInfo.project.name === "mobile" ? "listitem" : "row"
  return page.getByRole(role).filter({ hasText: name })
}

test.describe("清單", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await mockErp(page)
    await seedToken(page)
  })

  test("顯示欄位與總數，角色 badge 可以同時兩個", async ({ page }, testInfo) => {
    await page.goto("/parties")

    await expect(page.getByText("共 3 筆")).toBeVisible()
    const item = partyItem(page, testInfo, "甲一機電股份有限公司")
    await expect(item.getByRole("link", { name: "甲一機電股份有限公司" })).toBeVisible()
    await expect(item.getByText("甲一機電", { exact: true })).toBeVisible()
    await expect(item.getByText("供應商")).toBeVisible()
    await expect(item.getByText("陳采購")).toBeVisible()
    await expect(item.getByText("02-2345-6789")).toBeVisible()
    await expect(item.getByText("12345678")).toBeVisible()

    // 丙三電機同時是供應商與客戶，兩個 badge 都要在
    const both = partyItem(page, testInfo, "丙三電機")
    await expect(both.getByText("供應商")).toBeVisible()
    await expect(both.getByText("客戶")).toBeVisible()

    await expect(page.getByRole("link", { name: "新增往來對象" })).toBeVisible()
  })

  test("角色篩選寫進網址並帶進請求 query", async ({ page }) => {
    await page.goto("/parties")

    const req = page.waitForRequest((r) => r.url().includes("/api/parties?") && r.url().includes("role=customer"))
    await page.getByRole("combobox", { name: "角色篩選" }).click()
    await page.getByRole("option", { name: "客戶", exact: true }).click()
    await req
    await expect(page).toHaveURL(/role=customer/)
    await expect(page.getByText("共 2 筆")).toBeVisible()
  })

  test("角色篩選「供應商且客戶」送 role=both", async ({ page }) => {
    await page.goto("/parties")

    const req = page.waitForRequest((r) => r.url().includes("/api/parties?") && r.url().includes("role=both"))
    await page.getByRole("combobox", { name: "角色篩選" }).click()
    await page.getByRole("option", { name: "供應商且客戶" }).click()
    await req
    await expect(page).toHaveURL(/role=both/)
    // 三筆裡只有丙三電機兩個角色都成立
    await expect(page.getByText("共 1 筆")).toBeVisible()
  })

  test("搜尋打得到聯絡人姓名，電話走等值比對", async ({ page }, testInfo) => {
    await page.goto("/parties")

    await page.getByLabel("搜尋").fill("陳采購")
    await expect(page.getByText("共 1 筆")).toBeVisible()
    await expect(partyItem(page, testInfo, "甲一機電股份有限公司")).toBeVisible()

    // 後端電話走等值：整組號碼找得到
    await page.getByLabel("搜尋").fill("02-1234-5678")
    await expect(page.getByText("共 1 筆")).toBeVisible()
    await expect(partyItem(page, testInfo, "乙二運輸股份有限公司")).toBeVisible()

    // 片段號碼不算命中（"02-1234" 不會出現在統編裡，確定是電話這條路徑在判斷）
    await page.getByLabel("搜尋").fill("02-1234")
    await expect(page.getByText("共 0 筆")).toBeVisible()
  })

  test("搜尋 debounce 後送 q 並寫進網址", async ({ page }) => {
    await page.goto("/parties")

    const req = page.waitForRequest((r) => r.url().includes("/api/parties?") && r.url().includes("q="))
    await page.getByLabel("搜尋").fill("Jiayi")
    expect(new URL((await req).url()).searchParams.get("q")).toBe("Jiayi")
    await expect(page.getByText("共 1 筆")).toBeVisible()
    await expect(page).toHaveURL(/q=/)
  })

  test("空狀態顯示還沒有往來對象", async ({ page }) => {
    await mockErp(page, { parties: [] })
    await page.goto("/parties")

    await expect(page.getByText("還沒有往來對象")).toBeVisible()
  })

  test("點名稱進明細", async ({ page }) => {
    await page.goto("/parties")

    await page.getByRole("link", { name: "甲一機電股份有限公司" }).click()
    await expect(page).toHaveURL(/\/parties\/party-1$/)
    await expect(page.getByRole("heading", { name: "甲一機電股份有限公司" })).toBeVisible()
  })
})

test.describe("權限", () => {
  test("沒有 vendor-management 權限：側邊欄沒有往來對象、開 /parties 看到擋下頁", async ({ page }, testInfo) => {
    const noVendorUser = {
      ...userFixture,
      permissions: { ...userFixture.permissions, apps: { ...userFixture.permissions.apps, "vendor-management": false } },
    }
    // trap 必須最先註冊：後註冊的 mock 會先比對，漏掉的才會掉到它手上。
    const unmocked = await trapUnmockedApi(page)
    await mockApi(page, { user: noVendorUser })
    await mockKb(page)
    await mockBot(page)
    await mockProjects(page)
    await mockErp(page)
    await seedToken(page)

    await page.goto("/")
    if (testInfo.project.name === "mobile") await page.getByRole("button", { name: /Toggle Sidebar/i }).click()
    await expect(page.getByRole("navigation").first().getByRole("link", { name: "往來對象" })).toHaveCount(0)

    await page.goto("/parties")
    await expect(page.getByRole("heading", { name: "此功能需要管理員開放" })).toBeVisible()

    expect(unmocked).toEqual([])
  })
})

test.describe("明細", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await mockErp(page)
    await seedToken(page)
  })

  test("表頭顯示主檔與別名 chips", async ({ page }) => {
    await page.goto("/parties/party-1")

    await expect(page.getByRole("heading", { name: "甲一機電股份有限公司" })).toBeVisible()
    const info = page.getByRole("region", { name: "往來對象資訊" })
    await expect(info.getByText("甲一機電", { exact: true })).toBeVisible()
    // 備註裡也有「供應商」三個字，角色 badge 要用 exact 挑出來
    await expect(info.getByText("供應商", { exact: true })).toBeVisible()
    await expect(info.getByText("12345678")).toBeVisible()
    await expect(info.getByText("機電工程")).toBeVisible()
    await expect(info.getByText("月結 30 天")).toBeVisible()
    await expect(info.getByText("甲一", { exact: true })).toBeVisible()
    await expect(info.getByText("Jiayi Electric")).toBeVisible()
  })

  test("五個分頁都能切，tab 寫進網址", async ({ page }) => {
    await page.goto("/parties/party-1")

    await expect(page.getByRole("tab", { name: "聯絡人" })).toHaveAttribute("data-state", "active")
    await expect(page.getByText("陳采購")).toBeVisible()

    await page.getByRole("tab", { name: "地址" }).click()
    await expect(page).toHaveURL(/tab=addresses/)
    await expect(page.getByText("甲一路三段 100 號 5 樓")).toBeVisible()

    await page.getByRole("tab", { name: "採購單" }).click()
    await expect(page).toHaveURL(/tab=purchase-orders/)
    await expect(page.getByRole("link", { name: "PO-202608-001" })).toHaveAttribute("href", "/purchase-orders/po-1")
    await expect(page.getByText("已下單")).toBeVisible()
    await expect(page.getByText("128,000")).toBeVisible()

    await page.getByRole("tab", { name: "專案" }).click()
    await expect(page).toHaveURL(/tab=projects/)
    await expect(page.getByRole("link", { name: "乙二站區監控案" })).toHaveAttribute("href", "/projects/proj-1")

    await page.getByRole("tab", { name: /知識庫/ }).click()
    await expect(page).toHaveURL(/tab=knowledge/)
    await expect(page.getByRole("tab", { name: /知識庫/ })).toHaveText("知識庫2")
    await expect(page.getByRole("link", { name: "到知識庫查看" })).toHaveAttribute(
      "href",
      `/kb?q=${encodeURIComponent("甲一機電股份有限公司")}`,
    )

    await page.getByRole("tab", { name: "聯絡人" }).click()
    await expect(page).not.toHaveURL(/tab=/)
  })

  test("聯絡人分頁：主要標記，新增聯絡人送 POST", async ({ page }) => {
    await page.goto("/parties/party-1")

    const primary = page.getByRole("listitem").filter({ hasText: "陳采購" })
    await expect(primary.getByText("主要")).toBeVisible()
    await expect(primary.getByText("採購課長")).toBeVisible()
    await expect(primary.getByText("chen@jiayi.example")).toBeVisible()

    await page.getByRole("button", { name: "新增聯絡人" }).click()
    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/parties/party-1/contacts"))
    await page.getByLabel("姓名").fill("黃業務")
    await page.getByLabel("職稱").fill("業務經理")
    await page.getByLabel("電話").fill("02-8888-0000")
    await page.getByRole("switch", { name: "設為主要聯絡人" }).click()
    await page.getByRole("button", { name: "新增", exact: true }).click()
    expect((await req).postDataJSON()).toMatchObject({
      name: "黃業務",
      title: "業務經理",
      phone: "02-8888-0000",
      is_primary: true,
    })
    await expect(page.getByText("黃業務")).toBeVisible()
  })

  test("地址分頁：新增地址送 POST", async ({ page }) => {
    await page.goto("/parties/party-1?tab=addresses")

    const primary = page.getByRole("listitem").filter({ hasText: "甲一路三段 100 號 5 樓" })
    await expect(primary.getByText("總公司")).toBeVisible()
    await expect(primary.getByText("主要")).toBeVisible()

    await page.getByRole("button", { name: "新增地址" }).click()
    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/parties/party-1/addresses"))
    await page.getByLabel("標籤").fill("倉庫")
    await page.getByRole("textbox", { name: "地址", exact: true }).fill("戊五路 12 號")
    await page.getByLabel("城市").fill("新北市")
    await page.getByRole("button", { name: "新增", exact: true }).click()
    expect((await req).postDataJSON()).toMatchObject({
      label: "倉庫",
      address: "戊五路 12 號",
      city: "新北市",
      is_primary: false,
    })
    await expect(page.getByText("戊五路 12 號")).toBeVisible()
  })

  test("聯絡人分頁：編輯送 PUT、設為主要送 PUT、刪除送 DELETE", async ({ page }) => {
    await page.goto("/parties/party-1")

    const second = page.getByRole("listitem").filter({ hasText: "林工程" })

    // 設為主要：只送 is_primary，原本的主要要降級
    const primaryReq = page.waitForRequest(
      (r) => r.method() === "PUT" && r.url().endsWith("/api/parties/party-1/contacts/contact-2"),
    )
    await second.getByRole("button", { name: "設為主要" }).click()
    expect((await primaryReq).postDataJSON()).toEqual({ is_primary: true })
    await expect(page.getByRole("listitem").filter({ hasText: "林工程" }).getByText("主要", { exact: true })).toBeVisible()
    await expect(page.getByRole("listitem").filter({ hasText: "陳采購" }).getByText("主要", { exact: true })).toHaveCount(0)

    // 編輯：對話框帶既有值，送 PUT
    await page.getByRole("listitem").filter({ hasText: "陳采購" }).getByRole("button", { name: "編輯" }).click()
    await expect(page.getByLabel("姓名")).toHaveValue("陳采購")
    await expect(page.getByLabel("職稱")).toHaveValue("採購課長")
    const editReq = page.waitForRequest(
      (r) => r.method() === "PUT" && r.url().endsWith("/api/parties/party-1/contacts/contact-1"),
    )
    await page.getByLabel("職稱").fill("採購經理")
    await page.getByRole("button", { name: "儲存" }).click()
    expect((await editReq).postDataJSON()).toMatchObject({ name: "陳采購", title: "採購經理" })
    await expect(page.getByText("採購經理")).toBeVisible()

    // 刪除：確認後送 DELETE
    await page.getByRole("listitem").filter({ hasText: "陳采購" }).getByRole("button", { name: "刪除" }).click()
    await expect(page.getByText("確定刪除這位聯絡人？")).toBeVisible()
    const deleteReq = page.waitForRequest(
      (r) => r.method() === "DELETE" && r.url().endsWith("/api/parties/party-1/contacts/contact-1"),
    )
    await page.getByRole("button", { name: "確定" }).click()
    await deleteReq
    await expect(page.getByText("陳采購")).toHaveCount(0)
    await expect(page.getByText("共 1 位聯絡人")).toBeVisible()
  })

  test("地址分頁：編輯送 PUT、設為主要送 PUT、刪除送 DELETE", async ({ page }) => {
    await page.goto("/parties/party-1?tab=addresses")

    const factory = page.getByRole("listitem").filter({ hasText: "工廠" })
    const primaryReq = page.waitForRequest(
      (r) => r.method() === "PUT" && r.url().endsWith("/api/parties/party-1/addresses/addr-2"),
    )
    await factory.getByRole("button", { name: "設為主要" }).click()
    expect((await primaryReq).postDataJSON()).toEqual({ is_primary: true })
    await expect(page.getByRole("listitem").filter({ hasText: "工廠" }).getByText("主要", { exact: true })).toBeVisible()

    await page.getByRole("listitem").filter({ hasText: "總公司" }).getByRole("button", { name: "編輯" }).click()
    await expect(page.getByRole("textbox", { name: "地址", exact: true })).toHaveValue("甲一路三段 100 號 5 樓")
    const editReq = page.waitForRequest(
      (r) => r.method() === "PUT" && r.url().endsWith("/api/parties/party-1/addresses/addr-1"),
    )
    await page.getByLabel("城市").fill("新北市")
    await page.getByRole("button", { name: "儲存" }).click()
    expect((await editReq).postDataJSON()).toMatchObject({ address: "甲一路三段 100 號 5 樓", city: "新北市" })

    await page.getByRole("listitem").filter({ hasText: "總公司" }).getByRole("button", { name: "刪除" }).click()
    await expect(page.getByText("確定刪除這筆地址？")).toBeVisible()
    const deleteReq = page.waitForRequest(
      (r) => r.method() === "DELETE" && r.url().endsWith("/api/parties/party-1/addresses/addr-1"),
    )
    await page.getByRole("button", { name: "確定" }).click()
    await deleteReq
    await expect(page.getByText("共 1 筆地址")).toBeVisible()
  })

  test("子資源的 404 detail 原樣顯示", async ({ page }) => {
    await page.goto("/parties/party-1")

    // 另一個 session 先刪掉了，這邊再按「設為主要」
    await page.route("**/api/parties/party-1/contacts/contact-2", (route) =>
      route.fulfill({ status: 404, json: { detail: "聯絡人不存在" } }),
    )
    await page.getByRole("listitem").filter({ hasText: "林工程" }).getByRole("button", { name: "設為主要" }).click()
    await expect(page.getByRole("alert")).toContainText("聯絡人不存在")
  })

  test("空分頁顯示空狀態", async ({ page }) => {
    await page.goto("/parties/party-3")
    await expect(page.getByText("還沒有聯絡人")).toBeVisible()

    await page.goto("/parties/party-3?tab=addresses")
    await expect(page.getByText("還沒有地址")).toBeVisible()

    await page.goto("/parties/party-3?tab=purchase-orders")
    await expect(page.getByText("還沒有採購單")).toBeVisible()

    await page.goto("/parties/party-3?tab=projects")
    await expect(page.getByText("還沒有相關專案")).toBeVisible()
  })

  test("問 AI 帶 q 前綴導到 AI 助手", async ({ page }) => {
    await page.goto("/parties/party-1")

    await expect(page.getByRole("link", { name: "問 AI" })).toHaveAttribute(
      "href",
      `/assistant?q=${encodeURIComponent("關於往來對象「甲一機電股份有限公司」：")}`,
    )
  })

  test("刪除後回清單", async ({ page }) => {
    await page.goto("/parties/party-1")

    await page.getByRole("button", { name: "刪除往來對象" }).click()
    await expect(page.getByText("確定刪除這筆往來對象？")).toBeVisible()
    const req = page.waitForRequest((r) => r.method() === "DELETE" && r.url().endsWith("/api/parties/party-1"))
    await page.getByRole("button", { name: "確定" }).click()
    await req
    await expect(page).toHaveURL(/\/parties$/)
    await expect(page.getByText("共 2 筆")).toBeVisible()
  })

  test("後端回 403 時顯示提示", async ({ page }) => {
    await mockErp(page, { forbidEdits: true })
    await page.goto("/parties/party-1")

    await page.getByRole("button", { name: "刪除往來對象" }).click()
    await page.getByRole("button", { name: "確定" }).click()
    await expect(page.getByRole("alert")).toContainText("沒有權限使用此功能")
  })

  test("找不到時顯示提示與回清單連結", async ({ page }) => {
    await page.goto("/parties/party-missing")

    await expect(page.getByText("找不到這筆往來對象")).toBeVisible()
    await expect(page.getByRole("link", { name: "回往來對象清單" })).toBeVisible()
  })
})

test.describe("合併", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await mockErp(page)
    await seedToken(page)
  })

  test("保留這筆：POST body 是 keep_id 與 drop_id，成功後留在保留的那筆", async ({ page }) => {
    await page.goto("/parties/party-1")

    await page.getByRole("button", { name: "合併" }).click()
    await page.getByLabel("搜尋往來對象").fill("丙三")
    await page.getByRole("combobox", { name: "要合併的往來對象" }).click()
    await page.getByRole("option", { name: "丙三電機" }).click()

    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/parties/merge"))
    await page.getByRole("button", { name: "合併", exact: true }).last().click()
    expect((await req).postDataJSON()).toEqual({ keep_id: "party-1", drop_id: "party-3" })
    await expect(page).toHaveURL(/\/parties\/party-1$/)
    const info = page.getByRole("region", { name: "往來對象資訊" })
    // drop 的名稱併進 keep 的別名，之後用舊名字也找得到
    await expect(info.getByText("丙三電機")).toBeVisible()
    // 角色取 OR：keep 原本只是供應商，drop 兩者皆是，合併後兩個 badge 都在
    await expect(info.getByText("供應商", { exact: true })).toBeVisible()
    await expect(info.getByText("客戶", { exact: true })).toBeVisible()
  })

  test("改成保留選到的那筆：導到那一筆", async ({ page }) => {
    await page.goto("/parties/party-1")

    await page.getByRole("button", { name: "合併" }).click()
    await page.getByRole("combobox", { name: "要合併的往來對象" }).click()
    await page.getByRole("option", { name: "丙三電機" }).click()
    await page.getByRole("radio", { name: /保留選到的那筆/ }).click()

    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/parties/merge"))
    await page.getByRole("button", { name: "合併", exact: true }).last().click()
    expect((await req).postDataJSON()).toEqual({ keep_id: "party-3", drop_id: "party-1" })
    await expect(page).toHaveURL(/\/parties\/party-3$/)
    await expect(page.getByRole("heading", { name: "丙三電機" })).toBeVisible()
  })

  test("後端 400 的 detail 原樣顯示", async ({ page }) => {
    await page.goto("/parties/party-1")

    await page.getByRole("button", { name: "合併" }).click()
    // 選單不列自己，用 route 改寫 body 模擬後端擋下同一筆
    await page.route("**/api/parties/merge", (route) =>
      route.fulfill({ status: 400, json: { detail: "不能把同一筆往來對象合併到自己" } }),
    )
    await page.getByRole("combobox", { name: "要合併的往來對象" }).click()
    await page.getByRole("option", { name: "丙三電機" }).click()
    await page.getByRole("button", { name: "合併", exact: true }).last().click()

    await expect(page.getByRole("alert")).toContainText("不能把同一筆往來對象合併到自己")
  })
})

test.describe("新增與編輯", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockErp(page)
    await seedToken(page)
  })

  test("新增送出 body 含別名陣列、角色開關與一筆主要聯絡人，201 後到明細", async ({ page }) => {
    await page.goto("/parties/new")

    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/parties"))
    await page.getByLabel("名稱").fill("丁四電機")
    await page.getByLabel("簡稱").fill("丁四")
    await page.getByLabel("別名").fill("丁四電, Dingsi")
    await page.getByRole("switch", { name: "供應商" }).click()
    await page.getByLabel("統一編號").fill("55667788")
    await page.getByLabel("產業").fill("電機")
    await page.getByLabel("付款條件").fill("月結 60 天")
    await page.getByLabel("聯絡人姓名").fill("李經理")
    await page.getByLabel("聯絡人電話").fill("03-111-2222")
    await page.getByRole("textbox", { name: "地址", exact: true }).fill("丁四路 1 號")
    await page.getByRole("button", { name: "儲存" }).click()

    expect((await req).postDataJSON()).toMatchObject({
      name: "丁四電機",
      short_name: "丁四",
      aliases: ["丁四電", "Dingsi"],
      is_supplier: true,
      is_customer: false,
      tax_id: "55667788",
      industry: "電機",
      payment_terms: "月結 60 天",
      contacts: [{ name: "李經理", phone: "03-111-2222", is_primary: true }],
      addresses: [{ address: "丁四路 1 號", is_primary: true }],
    })
    await expect(page).toHaveURL(/\/parties\/party-new-1$/)
    await expect(page.getByRole("heading", { name: "丁四電機" })).toBeVisible()
  })

  test("編輯載入既有值，PUT 後回明細", async ({ page }) => {
    await page.goto("/parties/party-1/edit")

    await expect(page.getByLabel("名稱")).toHaveValue("甲一機電股份有限公司")
    await expect(page.getByLabel("別名")).toHaveValue("甲一, Jiayi Electric")
    await expect(page.getByRole("switch", { name: "供應商" })).toBeChecked()
    await expect(page.getByRole("switch", { name: "客戶" })).not.toBeChecked()
    // 編輯頁不重複開聯絡人／地址，那是明細分頁的事
    await expect(page.getByLabel("聯絡人姓名")).toHaveCount(0)

    const req = page.waitForRequest((r) => r.method() === "PUT" && r.url().endsWith("/api/parties/party-1"))
    await page.getByLabel("名稱").fill("甲一機電工程")
    await page.getByRole("switch", { name: "客戶" }).click()
    await page.getByRole("button", { name: "儲存" }).click()
    expect((await req).postDataJSON()).toMatchObject({ name: "甲一機電工程", is_customer: true })
    await expect(page).toHaveURL(/\/parties\/party-1$/)
  })
})
