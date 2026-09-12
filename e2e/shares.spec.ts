import { expect, test, type Page, type TestInfo } from "@playwright/test"
import {
  adminFixture,
  mockApi,
  mockShares,
  seedToken,
  shareLinkFixtures,
  shareUserFixture,
  trapUnmockedApi,
} from "./helpers"

/** 清單在 md 以下換成卡片；表格列與卡片各自只有一種會進可及性樹，用 role 分流。 */
function shareItem(page: Page, testInfo: TestInfo, name: string) {
  const role = testInfo.project.name === "mobile" ? "listitem" : "row"
  return page.getByRole(role).filter({ hasText: name })
}

test.describe("一般使用者", () => {
  test("清單列出自己的連結，沒有建立者也沒有檢視切換", async ({ page }, testInfo) => {
    const unmocked = await trapUnmockedApi(page)
    await mockApi(page, { user: shareUserFixture })
    await mockShares(page)
    await seedToken(page)
    await page.goto("/shares")

    await expect(page.getByText("共 3 筆")).toBeVisible()

    const kb = shareItem(page, testInfo, "泵浦保養 SOP")
    await expect(kb.getByRole("link", { name: "泵浦保養 SOP" })).toHaveAttribute("href", "/kb/kb-001")
    await expect(kb.getByText("知識庫", { exact: true })).toBeVisible()
    await expect(kb.getByText("https://ctos.test.invalid/s/sh-kb-001")).toBeVisible()
    await expect(kb.getByText("永久")).toBeVisible()
    await expect(kb.getByText("12", { exact: true })).toBeVisible()

    // nas_file 顯示的是路徑（resource_id），不是後端只給檔名的 resource_title。
    const nas = shareItem(page, testInfo, "/mnt/nas/projects/甲一機電/配電圖.pdf")
    await expect(nas.getByText("檔案", { exact: true })).toBeVisible()
    await expect(nas.getByText(/2026\/12\/31/)).toBeVisible()

    // 一般使用者：後端 is_admin=false，沒有「只看我的／全部」，也沒有建立者
    await expect(page.getByRole("tab", { name: "全部" })).toHaveCount(0)
    await expect(page.getByText("建立者")).toHaveCount(0)
    expect(unmocked).toEqual([])
  })

  test("已過期的列淡化並標已過期", async ({ page }, testInfo) => {
    await mockApi(page, { user: shareUserFixture })
    await mockShares(page)
    await seedToken(page)
    await page.goto("/shares")

    const expired = shareItem(page, testInfo, "PLC 韌體升級紀錄")
    await expect(expired.getByText("已過期")).toBeVisible()
    await expect(expired).toHaveClass(/opacity-60/)

    const fresh = shareItem(page, testInfo, "泵浦保養 SOP")
    await expect(fresh).not.toHaveClass(/opacity-60/)
  })

  test("一個連結都沒有時給空狀態與建立方式", async ({ page }) => {
    await mockApi(page, { user: shareUserFixture })
    await mockShares(page, { links: [] })
    await seedToken(page)
    await page.goto("/shares")

    await expect(page.getByText("還沒有分享連結")).toBeVisible()
    await expect(page.getByText("分享連結從知識庫的條目或檔案管理的檔案建立。")).toBeVisible()
  })

  test("沒有 share-manager 權限的人進 /shares 被擋下", async ({ page }, testInfo) => {
    await mockApi(page) // userFixture 的 apps 沒有 share-manager
    await mockShares(page)
    await seedToken(page)

    await page.goto("/shares")
    await expect(page.getByRole("heading", { name: "此功能需要管理員開放" })).toBeVisible()
    await expect(shareItem(page, testInfo, "泵浦保養 SOP")).toHaveCount(0)

    await page.goto("/")
    if (testInfo.project.name === "mobile") await page.getByRole("button", { name: /Toggle Sidebar/i }).click()
    await expect(page.getByRole("navigation").first().getByRole("link", { name: "分享" })).toHaveCount(0)
  })
})

test.describe("管理員", () => {
  test("切到全部看得到建立者與別人的連結，view 寫進網址", async ({ page }, testInfo) => {
    await mockApi(page, { user: adminFixture })
    await mockShares(page, { isAdmin: true })
    await seedToken(page)
    await page.goto("/shares")

    // 預設只看我的：別人的那筆不在，也沒有建立者
    await expect(page.getByText("共 3 筆")).toBeVisible()
    await expect(page.getByText("建立者")).toHaveCount(0)

    await page.getByRole("tab", { name: "全部" }).click()
    await expect(page).toHaveURL(/\?view=all/)
    await expect(page.getByText("共 4 筆")).toBeVisible()
    // 建立者在桌機是表頭、在手機是卡片裡的欄位名；表格與卡片兩份 DOM 都在，用版面分流才不會抓到被隱藏的那一份。
    if (testInfo.project.name === "mobile") {
      await expect(shareItem(page, testInfo, "未知資源").getByText("建立者")).toBeVisible()
    } else {
      await expect(page.getByRole("columnheader", { name: "建立者" })).toBeVisible()
    }

    const other = shareItem(page, testInfo, "未知資源")
    await expect(other.getByText("shulin")).toBeVisible()
    await expect(other.getByRole("link", { name: "未知資源" })).toHaveAttribute("href", "/projects/7")
    await expect(other.getByText("專案", { exact: true })).toBeVisible()

    // 切回只看我的，網址上的 view 清掉
    await page.getByRole("tab", { name: "只看我的" }).click()
    await expect(page).not.toHaveURL(/view=all/)
    await expect(shareItem(page, testInfo, "未知資源")).toHaveCount(0)
  })

  test("重新整理停在 ?view=all", async ({ page }) => {
    await mockApi(page, { user: adminFixture })
    await mockShares(page, { isAdmin: true })
    await seedToken(page)
    await page.goto("/shares?view=all")

    await expect(page.getByText("共 4 筆")).toBeVisible()
    await expect(page.getByRole("tab", { name: "全部" })).toHaveAttribute("aria-selected", "true")
  })
})

test("複製網址", async ({ page, context, isMobile }, testInfo) => {
  test.skip(isMobile === true, "clipboard 權限在行動裝置瀏覽器不可用")
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await mockApi(page, { user: shareUserFixture })
  await mockShares(page)
  await seedToken(page)
  await page.goto("/shares")

  const kb = shareItem(page, testInfo, "泵浦保養 SOP")
  await kb.getByRole("button", { name: "複製網址" }).click()
  await expect(kb.getByText("已複製")).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toBe(shareLinkFixtures[0].full_url)
})

test.describe("撤銷", () => {
  test("要先確認，確認後那一列消失", async ({ page }, testInfo) => {
    await mockApi(page, { user: shareUserFixture })
    await mockShares(page)
    await seedToken(page)
    await page.goto("/shares")

    await shareItem(page, testInfo, "泵浦保養 SOP").getByRole("button", { name: "撤銷" }).click()
    await expect(page.getByText("確定撤銷「泵浦保養 SOP」的分享連結？")).toBeVisible()
    await page.getByRole("button", { name: "返回" }).click()
    await expect(shareItem(page, testInfo, "泵浦保養 SOP")).toBeVisible()

    await shareItem(page, testInfo, "泵浦保養 SOP").getByRole("button", { name: "撤銷" }).click()
    const req = page.waitForRequest((r) => r.method() === "DELETE" && r.url().endsWith("/api/share/sh-kb-001"))
    await page.getByRole("button", { name: "確定撤銷" }).click()
    await req
    await expect(shareItem(page, testInfo, "泵浦保養 SOP")).toHaveCount(0)
    await expect(page.getByText("共 2 筆")).toBeVisible()
  })

  test("撤銷別人的連結被後端擋下，detail 原樣顯示、那一列還在", async ({ page }, testInfo) => {
    await mockApi(page, { user: adminFixture })
    // 403 那條規則是「非建立者且非管理員」（services/share.py 668–670）；
    // 這裡直接讓後端回 403，驗的是前端有沒有把 detail 原樣顯示出來。
    await mockShares(page, { isAdmin: true, denyRevokeToken: "sh-proj-004" })
    await seedToken(page)
    await page.goto("/shares?view=all")

    await shareItem(page, testInfo, "未知資源").getByRole("button", { name: "撤銷" }).click()
    await page.getByRole("button", { name: "確定撤銷" }).click()

    await expect(page.getByRole("alert")).toContainText("您沒有權限撤銷此連結")
    await expect(shareItem(page, testInfo, "未知資源")).toBeVisible()
  })
})
