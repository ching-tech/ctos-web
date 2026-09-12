import { expect, test, type Page } from "@playwright/test"
import {
  adminFixture,
  adminUserFixtures,
  mockAdmin,
  mockApi,
  mockBot,
  mockErp,
  mockKb,
  mockProjects,
  seedToken,
  trapUnmockedApi,
  type AdminUserFixture,
} from "./helpers"

/**
 * 使用者管理的管理員動作。登入的是 adminFixture（id 1、帳號 admin），
 * 清單裡的 id 1 就是「自己」，id 2（yazelin）是別人。
 */
async function setup(page: Page, opts: { users?: AdminUserFixture[]; failCreate?: string } = {}) {
  const unmocked = await trapUnmockedApi(page)
  await mockApi(page, { user: adminFixture })
  await mockKb(page)
  await mockBot(page)
  await mockProjects(page)
  await mockErp(page)
  const admin = await mockAdmin(page, opts)
  await seedToken(page)
  return { ...admin, unmocked }
}

/** 自己那列：清單第一筆是 admin，用 `^admin ` 避開「管理員」顯示名的模糊比對。 */
function selfRow(page: Page) {
  return page.getByRole("row", { name: /^admin / })
}

function otherRow(page: Page) {
  return page.getByRole("row", { name: /yazelin/ })
}

test("新增使用者：送出表單、清單多一列、提示首次登入需改密碼", async ({ page }) => {
  const { unmocked } = await setup(page)
  await page.goto("/admin/users")
  await expect(page.getByText("共 2 位使用者")).toBeVisible()

  await page.getByRole("button", { name: "新增使用者" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("帳號").fill("dingyi")
  await dialog.getByLabel("密碼").fill("pw12345678")
  await dialog.getByLabel("顯示名稱").fill("丁一")

  const postReq = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/api/admin/users"),
  )
  await dialog.getByRole("button", { name: "新增" }).click()
  expect((await postReq).postDataJSON()).toEqual({
    username: "dingyi",
    password: "pw12345678",
    display_name: "丁一",
    role: "user",
  })

  await expect(page.getByRole("status")).toContainText("新使用者首次登入需改密碼")
  await expect(page.getByText("共 3 位使用者")).toBeVisible()
  await expect(page.getByRole("cell", { name: "dingyi" })).toBeVisible()
  expect(unmocked).toEqual([])
})

test("新增使用者：後端 400 的 detail 原樣顯示，對話框留著", async ({ page }) => {
  await setup(page, { failCreate: "此帳號已存在" })
  await page.goto("/admin/users")

  await page.getByRole("button", { name: "新增使用者" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("帳號").fill("yazelin")
  await dialog.getByLabel("密碼").fill("pw12345678")
  await dialog.getByRole("button", { name: "新增" }).click()

  await expect(dialog.getByRole("alert")).toHaveText("此帳號已存在")
  await expect(dialog).toBeVisible()
  await expect(page.getByText("共 2 位使用者")).toBeVisible()
})

test("停用自己被擋在前端：選項停用、寫出原因，也不會送出請求", async ({ page }) => {
  await setup(page)
  const requests: string[] = []
  page.on("request", (r) => {
    if (r.method() === "PATCH" || r.method() === "DELETE") requests.push(`${r.method()} ${r.url()}`)
  })

  await page.goto("/admin/users")
  await selfRow(page).getByRole("button", { name: "動作" }).click()

  const menu = page.getByRole("menu")
  const deactivate = menu.getByRole("menuitem", { name: /停用/ })
  await expect(deactivate).toContainText("不能停用自己的帳號")
  await expect(deactivate).toBeDisabled()
  await expect(menu.getByRole("menuitem", { name: /清除密碼/ })).toBeDisabled()
  await expect(menu.getByRole("menuitem", { name: /刪除/ })).toContainText("不能刪除自己的帳號")
  await expect(menu.getByRole("menuitem", { name: /刪除/ })).toBeDisabled()

  // 按下去也不該有動靜：Radix 的 aria-disabled 項目不會觸發 onSelect
  await deactivate.click({ force: true })
  await page.keyboard.press("Escape")
  await expect(selfRow(page)).toContainText("啟用")
  expect(requests).toEqual([])
})

test("停用別人：送 PATCH /status，狀態欄改成停用", async ({ page }) => {
  await setup(page)
  await page.goto("/admin/users")

  const patchReq = page.waitForRequest(
    (r) => r.method() === "PATCH" && r.url().endsWith("/api/admin/users/2/status"),
  )
  await otherRow(page).getByRole("button", { name: "動作" }).click()
  await page.getByRole("menuitem", { name: "停用" }).click()
  expect((await patchReq).postDataJSON()).toEqual({ is_active: false })

  await expect(otherRow(page)).toContainText("停用")
  await expect(page.getByRole("status")).toContainText("帳號已停用")
})

test("編輯使用者：只送有改的欄位，自己的角色下拉停用", async ({ page }) => {
  await setup(page)
  await page.goto("/admin/users")

  await otherRow(page).getByRole("button", { name: "動作" }).click()
  await page.getByRole("menuitem", { name: "編輯" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("顯示名稱").fill("亞澤二")

  const patchReq = page.waitForRequest(
    (r) => r.method() === "PATCH" && r.url().endsWith("/api/admin/users/2"),
  )
  await dialog.getByRole("button", { name: "儲存" }).click()
  expect((await patchReq).postDataJSON()).toEqual({ display_name: "亞澤二" })
  await expect(page.getByRole("cell", { name: "亞澤二" })).toBeVisible()

  // 自己的角色不能降級，下拉直接停用並寫原因
  await selfRow(page).getByRole("button", { name: "動作" }).click()
  await page.getByRole("menuitem", { name: "編輯" }).click()
  await expect(dialog.getByRole("combobox", { name: "角色" })).toBeDisabled()
  await expect(dialog).toContainText("不能降級自己的角色")
})

test("重設密碼：送 new_password，成功後顯示後端訊息", async ({ page }) => {
  await setup(page)
  await page.goto("/admin/users")

  await otherRow(page).getByRole("button", { name: "動作" }).click()
  await page.getByRole("menuitem", { name: "重設密碼" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("新密碼").fill("pw87654321")

  const postReq = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/api/admin/users/2/reset-password"),
  )
  await dialog.getByRole("button", { name: "重設密碼" }).click()
  expect((await postReq).postDataJSON()).toEqual({ new_password: "pw87654321" })

  await expect(page.getByRole("status")).toContainText("下次登入需要變更密碼")
})

test("清除密碼：確認後送出，密碼欄改成 NAS", async ({ page }) => {
  await setup(page)
  await page.goto("/admin/users")

  await otherRow(page).getByRole("button", { name: "動作" }).click()
  await page.getByRole("menuitem", { name: "清除密碼" }).click()
  const confirm = page.getByRole("alertdialog")
  await expect(confirm).toContainText("改走 NAS 認證登入")

  const postReq = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/api/admin/users/2/clear-password"),
  )
  await confirm.getByRole("button", { name: "清除密碼" }).click()
  await postReq

  await expect(otherRow(page)).toContainText("NAS")
  await expect(page.getByRole("status")).toContainText("NAS 認證登入")
})

test("刪除使用者：確認後那一列消失", async ({ page }) => {
  await setup(page)
  await page.goto("/admin/users")
  await expect(page.getByText("共 2 位使用者")).toBeVisible()

  await otherRow(page).getByRole("button", { name: "動作" }).click()
  await page.getByRole("menuitem", { name: "刪除" }).click()
  const confirm = page.getByRole("alertdialog")
  await expect(confirm).toContainText("永久刪除")

  const deleteReq = page.waitForRequest(
    (r) => r.method() === "DELETE" && r.url().endsWith("/api/admin/users/2"),
  )
  await confirm.getByRole("button", { name: "刪除" }).click()
  await deleteReq

  await expect(page.getByText("共 1 位使用者")).toBeVisible()
  await expect(page.getByRole("cell", { name: "yazelin" })).toHaveCount(0)
})

test("停用的使用者整列淡化", async ({ page }) => {
  await setup(page, {
    users: adminUserFixtures.map((u) => (u.id === 2 ? { ...u, is_active: false } : u)),
  })
  await page.goto("/admin/users")
  await expect(otherRow(page)).toHaveClass(/opacity-60/)
  await expect(selfRow(page)).not.toHaveClass(/opacity-60/)
})
