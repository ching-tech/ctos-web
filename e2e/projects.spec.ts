import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { adminFixture, API, mockApi, mockKb, mockProjects, projectFixtures, seedToken, simpleUserFixtures, userFixture } from "./helpers"

/** 清單在 md 以下換成卡片；表格列與卡片各自只有一種會進可及性樹，用 role 分流。 */
function projectItem(page: Page, testInfo: TestInfo, name: string) {
  const role = testInfo.project.name === "mobile" ? "listitem" : "row"
  return page.getByRole(role).filter({ hasText: name })
}

test.describe("清單", () => {
  test("顯示欄位與總數，admin 才有新增專案", async ({ page }, testInfo) => {
    await mockApi(page, { user: adminFixture })
    await mockProjects(page)
    await seedToken(page)
    await page.goto("/projects")

    await expect(page.getByText("共 3 筆")).toBeVisible()
    const item = projectItem(page, testInfo, "台北捷運監控案")
    await expect(item.getByRole("link", { name: "台北捷運監控案" })).toBeVisible()
    await expect(item.getByText("捷運公司")).toBeVisible()
    await expect(item.getByText("進行中")).toBeVisible()
    await expect(item.getByText("亞澤")).toBeVisible()
    await expect(item.getByText("33%")).toBeVisible()
    await expect(item.getByText("2026-12-31")).toBeVisible()
    await expect(page.getByRole("link", { name: "新增專案" })).toBeVisible()
  })

  test("一般使用者看不到新增專案", async ({ page }) => {
    await mockApi(page)
    await mockProjects(page)
    await seedToken(page)
    await page.goto("/projects")

    await expect(page.getByText("共 3 筆")).toBeVisible()
    await expect(page.getByRole("link", { name: "新增專案" })).toHaveCount(0)
  })

  test("逾期里程碑數大於 0 標紅，已完成的專案不標", async ({ page }, testInfo) => {
    await mockApi(page)
    await mockProjects(page)
    await seedToken(page)
    await page.goto("/projects")

    const overdue = projectItem(page, testInfo, "台北捷運監控案").getByLabel("逾期里程碑數")
    await expect(overdue).toHaveText("2")
    await expect(overdue).toHaveClass(/text-destructive/)

    const none = projectItem(page, testInfo, "廠務空調更新").getByLabel("逾期里程碑數")
    await expect(none).toHaveText("0")
    await expect(none).not.toHaveClass(/text-destructive/)
  })

  test("狀態篩選寫進網址並帶進請求 query", async ({ page }) => {
    await mockApi(page)
    await mockProjects(page)
    await seedToken(page)
    await page.goto("/projects")

    const req = page.waitForRequest((r) => r.url().includes("/api/projects?") && r.url().includes("status=completed"))
    await page.getByRole("combobox", { name: "狀態篩選" }).click()
    await page.getByRole("option", { name: "已完成" }).click()
    await req
    await expect(page).toHaveURL(/status=completed/)
    await expect(page.getByText("共 1 筆")).toBeVisible()
  })

  test("搜尋 debounce 後送 q 並寫進網址", async ({ page }) => {
    await mockApi(page)
    await mockProjects(page)
    await seedToken(page)
    await page.goto("/projects")

    const req = page.waitForRequest((r) => r.url().includes("/api/projects?") && r.url().includes("q="))
    await page.getByLabel("搜尋").fill("空調")
    expect(new URL((await req).url()).searchParams.get("q")).toBe("空調")
    await expect(page.getByText("共 1 筆")).toBeVisible()
    await expect(page).toHaveURL(/q=/)
  })

  test("空狀態顯示還沒有專案", async ({ page }) => {
    await mockApi(page)
    await mockProjects(page, { projects: [] })
    await seedToken(page)
    await page.goto("/projects")

    await expect(page.getByText("還沒有專案")).toBeVisible()
  })

  test("點名稱進明細", async ({ page }) => {
    await mockApi(page)
    await mockProjects(page)
    await mockKb(page)
    await seedToken(page)
    await page.goto("/projects")

    await page.getByRole("link", { name: "台北捷運監控案" }).click()
    await expect(page).toHaveURL(/\/projects\/proj-1$/)
    await expect(page.getByRole("heading", { name: "台北捷運監控案" })).toBeVisible()
  })
})

test.describe("權限", () => {
  test("沒有 project-management 權限：側邊欄沒有專案、開 /projects 看到擋下頁", async ({ page }, testInfo) => {
    const noProjectUser = {
      ...userFixture,
      permissions: { ...userFixture.permissions, apps: { ...userFixture.permissions.apps, "project-management": false } },
    }
    await mockApi(page, { user: noProjectUser })
    await mockKb(page)
    await mockProjects(page)
    await seedToken(page)

    await page.goto("/")
    if (testInfo.project.name === "mobile") await page.getByRole("button", { name: /Toggle Sidebar/i }).click()
    await expect(page.getByRole("navigation").first().getByRole("link", { name: "專案" })).toHaveCount(0)

    await page.goto("/projects")
    await expect(page.getByRole("heading", { name: "此功能需要管理員開放" })).toBeVisible()
  })
})

test.describe("明細", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await mockKb(page)
    await mockProjects(page)
    await seedToken(page)
  })

  test("表頭顯示主檔與進度，逾期里程碑數標紅", async ({ page }) => {
    await page.goto("/projects/proj-1")

    await expect(page.getByRole("heading", { name: "台北捷運監控案" })).toBeVisible()
    const info = page.getByRole("region", { name: "專案資訊" })
    await expect(info.getByText("捷運公司")).toBeVisible()
    await expect(info.getByText("進行中")).toBeVisible()
    await expect(info.getByText("亞澤")).toBeVisible()
    await expect(info.getByText("2026-01-01")).toBeVisible()
    await expect(info.getByText("2026-12-31")).toBeVisible()
    await expect(info.getByText("33%")).toBeVisible()
    await expect(info.getByLabel("成員數")).toHaveText("2")
    const overdue = info.getByLabel("逾期里程碑數")
    await expect(overdue).toHaveText("2")
    await expect(overdue).toHaveClass(/text-destructive/)
  })

  test("五個分頁都能切，tab 寫進網址", async ({ page }) => {
    await page.goto("/projects/proj-1")

    await expect(page.getByRole("tab", { name: "總覽" })).toHaveAttribute("data-state", "active")
    await page.getByRole("tab", { name: "任務" }).click()
    await expect(page).toHaveURL(/tab=tasks/)
    await expect(page.getByText("繪製配電圖")).toBeVisible()

    await page.getByRole("tab", { name: "成員" }).click()
    await expect(page).toHaveURL(/tab=members/)
    await expect(page.getByText("陳工")).toBeVisible()

    await page.getByRole("tab", { name: "知識庫" }).click()
    await expect(page).toHaveURL(/tab=knowledge/)
    await expect(page.getByRole("link", { name: "案場巡檢清單" })).toBeVisible()

    await page.getByRole("tab", { name: "群組" }).click()
    await expect(page).toHaveURL(/tab=groups/)
    await expect(page.getByRole("link", { name: /擎添業務群/ })).toBeVisible()

    await page.getByRole("tab", { name: "總覽" }).click()
    await expect(page).not.toHaveURL(/tab=/)
    await expect(page.getByText("細部設計完成")).toBeVisible()
  })

  test("成員身分看得到編輯與完成；點完成送 PUT 里程碑", async ({ page }) => {
    await page.goto("/projects/proj-1")

    await expect(page.getByRole("link", { name: "編輯" })).toBeVisible()
    const row = page.getByRole("listitem").filter({ hasText: "細部設計完成" })
    await expect(row.getByText("逾期")).toBeVisible()

    const req = page.waitForRequest((r) => r.method() === "PUT" && r.url().includes("/api/projects/proj-1/milestones/ms-1"))
    await row.getByRole("button", { name: "完成" }).click()
    const body = (await req).postDataJSON() as { status: string; completed_at: string }
    expect(body.status).toBe("completed")
    expect(body.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test("非成員的一般使用者看不到編輯控制", async ({ page }) => {
    await page.goto("/projects/proj-3")

    await expect(page.getByRole("heading", { name: "倉儲自動化評估" })).toBeVisible()
    await expect(page.getByRole("link", { name: "編輯" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "新增里程碑" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "刪除專案" })).toHaveCount(0)
  })

  test("新增里程碑對話框送出 POST", async ({ page }) => {
    await page.goto("/projects/proj-1")

    await page.getByRole("button", { name: "新增里程碑" }).click()
    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/projects/proj-1/milestones"))
    await page.getByLabel("里程碑名稱").fill("試車完成")
    await page.getByLabel("到期日").fill("2026-12-01")
    await page.getByRole("button", { name: "新增", exact: true }).click()
    expect((await req).postDataJSON()).toMatchObject({ name: "試車完成", due_date: "2026-12-01" })
    await expect(page.getByText("試車完成")).toBeVisible()
  })

  test("任務分頁依狀態分組、行內改狀態、新增任務對話框送 POST", async ({ page }) => {
    await page.goto("/projects/proj-1?tab=tasks")

    await expect(page.getByRole("heading", { name: "待辦" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "進行中" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "已完成" })).toBeVisible()

    const row = page.getByRole("listitem").filter({ hasText: "繪製配電圖" })
    await expect(row.getByText("陳工")).toBeVisible()
    await expect(row.getByText("細部設計完成")).toBeVisible()

    const putReq = page.waitForRequest((r) => r.method() === "PUT" && r.url().includes("/api/projects/proj-1/tasks/task-2"))
    await row.getByRole("combobox", { name: "任務狀態" }).click()
    await page.getByRole("option", { name: "已完成" }).click()
    expect((await putReq).postDataJSON()).toEqual({ status: "done" })

    await page.getByRole("button", { name: "新增任務" }).click()
    const postReq = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/projects/proj-1/tasks"))
    await page.getByLabel("任務標題").fill("送審圖面")
    await page.getByRole("button", { name: "新增", exact: true }).click()
    expect((await postReq).postDataJSON()).toMatchObject({ title: "送審圖面", status: "todo" })
    await expect(page.getByText("送審圖面")).toBeVisible()
  })

  test("成員分頁：負責人不給移除，新增成員送 POST", async ({ page }) => {
    await page.goto("/projects/proj-1?tab=members")

    const owner = page.getByRole("listitem").filter({ hasText: "亞澤" })
    await expect(owner.getByText("負責人")).toBeVisible()
    await expect(owner.getByRole("button", { name: "移除" })).toHaveCount(0)

    const other = page.getByRole("listitem").filter({ hasText: "陳工" })
    await expect(other.getByRole("button", { name: "移除" })).toBeVisible()

    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/projects/proj-1/members"))
    await page.getByRole("combobox", { name: "加入成員" }).click()
    await expect(page.getByRole("option", { name: "陳工" })).toHaveCount(0)
    await page.getByRole("option", { name: "管理員" }).click()
    expect((await req).postDataJSON()).toEqual({ user_id: 1 })
  })

  test("知識庫分頁連到條目，新增條目帶 scope 與 project_id", async ({ page }) => {
    await page.goto("/projects/proj-1?tab=knowledge")

    await expect(page.getByRole("link", { name: "案場巡檢清單" })).toHaveAttribute("href", /\/kb\/kb-003$/)
    await expect(page.getByRole("link", { name: "新增條目" })).toHaveAttribute(
      "href",
      "/kb/new?scope=project&project_id=proj-1",
    )
  })

  test("群組分頁列出綁定群組，沒有時顯示空狀態", async ({ page }) => {
    await page.goto("/projects/proj-1?tab=groups")
    await expect(page.getByRole("link", { name: /擎添業務群/ })).toHaveAttribute("href", /\/bot\/groups\/grp-1$/)

    await page.goto("/projects/proj-3?tab=groups")
    await expect(page.getByText("尚未綁定群組")).toBeVisible()
  })

  test("後端回 403 時顯示提示", async ({ page }) => {
    await mockProjects(page, { forbidEdits: true })
    await page.goto("/projects/proj-1")

    const row = page.getByRole("listitem").filter({ hasText: "細部設計完成" })
    await row.getByRole("button", { name: "完成" }).click()
    await expect(page.getByRole("alert")).toContainText("只有專案成員能編輯")
  })

  test("admin 刪除專案後回清單", async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await page.goto("/projects/proj-1")

    await page.getByRole("button", { name: "刪除專案" }).click()
    await expect(page.getByText("確定刪除這個專案？")).toBeVisible()
    await page.getByRole("button", { name: "確定" }).click()
    await expect(page).toHaveURL(/\/projects$/)
    await expect(page.getByText("共 2 筆")).toBeVisible()
  })
})

test.describe("新增與編輯", () => {
  test("admin 新增專案：POST body 含 name 與 status，201 後到明細", async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockKb(page)
    await mockProjects(page)
    await seedToken(page)
    await page.goto("/projects/new")

    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/projects"))
    await page.getByLabel("名稱").fill("新廠監控案")
    await page.getByRole("button", { name: "儲存" }).click()
    expect((await req).postDataJSON()).toMatchObject({ name: "新廠監控案", status: "active" })
    await expect(page).toHaveURL(/\/projects\/proj-new-1$/)
    await expect(page.getByRole("heading", { name: "新廠監控案" })).toBeVisible()
  })

  test("非 admin 開新增頁被導回清單", async ({ page }) => {
    await mockApi(page)
    await mockProjects(page)
    await seedToken(page)
    await page.goto("/projects/new")

    await expect(page).toHaveURL(/\/projects$/)
  })

  test("成員編輯專案：PUT 後回明細", async ({ page }) => {
    await mockApi(page)
    await mockKb(page)
    await mockProjects(page)
    await seedToken(page)
    await page.goto("/projects/proj-1/edit")

    await expect(page.getByLabel("名稱")).toHaveValue("台北捷運監控案")
    const req = page.waitForRequest((r) => r.method() === "PUT" && r.url().endsWith("/api/projects/proj-1"))
    await page.getByLabel("名稱").fill("台北捷運監控案 二期")
    await page.getByRole("button", { name: "儲存" }).click()
    expect((await req).postDataJSON()).toMatchObject({ name: "台北捷運監控案 二期" })
    await expect(page).toHaveURL(/\/projects\/proj-1$/)
  })
})

test.describe("知識庫編輯器的專案入口", () => {
  test("帶 scope 與 project_id 開編輯器時鎖定範圍並送出 project_id", async ({ page }) => {
    await mockApi(page)
    await mockKb(page)
    await mockProjects(page)
    await seedToken(page)
    await page.goto("/kb/new?scope=project&project_id=proj-1")

    const scope = page.getByRole("combobox", { name: "範圍" })
    await expect(scope).toContainText("專案")
    await expect(scope).toBeDisabled()

    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/knowledge"))
    await page.getByLabel("標題").fill("專案交接筆記")
    await page.getByRole("button", { name: "儲存" }).click()
    expect((await req).postDataJSON()).toMatchObject({ scope: "project", project_id: "proj-1" })
  })

  test("沒帶 query 時行為不變", async ({ page }) => {
    await mockApi(page)
    await mockKb(page)
    await seedToken(page)
    await page.goto("/kb/new")

    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/knowledge"))
    await page.getByLabel("標題").fill("個人筆記")
    await page.getByRole("button", { name: "儲存" }).click()
    const body = (await req).postDataJSON() as Record<string, unknown>
    expect(body.scope).toBe("personal")
    expect(body.project_id).toBeUndefined()
  })
})

test.describe("後端錯誤契約", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await mockKb(page)
    await seedToken(page)
  })

  test("負責人選單過期時，404「使用者不存在」原樣顯示", async ({ page }) => {
    await mockProjects(page)
    // 選單比後端多一個已經不存在的使用者：後端會回 404，不是靜默塞 null
    await page.route(`${API}/api/user/list`, (route) =>
      route.fulfill({ json: { users: [...simpleUserFixtures, { id: 99, username: "ghost", display_name: "已離職" }] } }),
    )
    await page.goto("/projects/proj-1?tab=tasks")

    await page.getByRole("button", { name: "新增任務" }).click()
    await page.getByLabel("任務標題").fill("交接文件")
    await page.getByRole("combobox", { name: "任務負責人" }).click()
    await page.getByRole("option", { name: "已離職" }).click()
    await page.getByRole("button", { name: "新增", exact: true }).click()

    await expect(page.getByRole("alert")).toContainText("使用者不存在")
  })

  test("里程碑屬於別的專案時，400「里程碑不屬於此專案」原樣顯示", async ({ page }) => {
    const projects = projectFixtures.map((p) =>
      p.id !== "proj-1"
        ? p
        : {
            ...p,
            milestones: [
              ...p.milestones,
              {
                id: "ms-foreign", project_id: "proj-2", name: "別案的里程碑", due_date: "2026-10-31",
                completed_at: null, status: "pending", sort_order: 9, is_overdue: false,
                created_at: "2026-01-01T00:00:00", updated_at: "2026-01-01T00:00:00",
              },
            ],
          },
    )
    await mockProjects(page, { projects })
    await page.goto("/projects/proj-1?tab=tasks")

    await page.getByRole("button", { name: "新增任務" }).click()
    await page.getByLabel("任務標題").fill("試車紀錄")
    await page.getByRole("combobox", { name: "里程碑" }).click()
    await page.getByRole("option", { name: "別案的里程碑" }).click()
    await page.getByRole("button", { name: "新增", exact: true }).click()

    await expect(page.getByRole("alert")).toContainText("里程碑不屬於此專案")
  })

  test("422 的驗證錯誤陣列攤成一句話，不是「HTTP 422」", async ({ page }) => {
    await mockProjects(page)
    await page.route(
      (url) => url.pathname.endsWith("/api/projects/proj-1"),
      async (route) => {
        if (route.request().method() !== "PUT") return route.fallback()
        await route.fulfill({
          status: 422,
          json: { detail: [{ loc: ["body", "name"], msg: "Value error, 此欄位不可為 null", type: "value_error" }] },
        })
      },
    )
    await page.goto("/projects/proj-1/edit")

    await page.getByLabel("名稱").fill("台北捷運監控案 三期")
    await page.getByRole("button", { name: "儲存" }).click()

    await expect(page.getByRole("alert")).toContainText("此欄位不可為 null")
  })
})
