import { expect, test } from "@playwright/test"
import { API, mockApi, seedToken, userFixture } from "./helpers"

test("變更密碼成功後清空表單並提示", async ({ page }) => {
  await mockApi(page)
  await seedToken(page)
  await page.goto("/settings")

  await page.getByLabel("目前密碼").fill("old12345")
  await page.getByLabel("新密碼", { exact: true }).fill("new12345")
  await page.getByLabel("確認新密碼").fill("new12345")
  await page.getByRole("button", { name: "變更密碼" }).click()

  await expect(page.getByRole("status")).toContainText("密碼已更新。")
  await expect(page.getByLabel("目前密碼")).toHaveValue("")
  await expect(page.getByLabel("新密碼", { exact: true })).toHaveValue("")
  await expect(page.getByLabel("確認新密碼")).toHaveValue("")
})

test("目前密碼錯：後端 200 加 success:false，把 error 顯示出來", async ({ page }) => {
  await mockApi(page)
  await seedToken(page)
  await page.goto("/settings")

  await page.getByLabel("目前密碼").fill("wrong12345")
  await page.getByLabel("新密碼", { exact: true }).fill("new12345")
  await page.getByLabel("確認新密碼").fill("new12345")
  await page.getByRole("button", { name: "變更密碼" }).click()

  await expect(page.getByRole("alert")).toContainText("目前密碼錯誤")
})

test("兩次新密碼不一致由前端擋下，不打後端", async ({ page }) => {
  await mockApi(page)
  await seedToken(page)
  const posted: string[] = []
  page.on("request", (r) => {
    if (r.url().endsWith("/api/auth/change-password")) posted.push(r.url())
  })
  await page.goto("/settings")

  await page.getByLabel("目前密碼").fill("old12345")
  await page.getByLabel("新密碼", { exact: true }).fill("new12345")
  await page.getByLabel("確認新密碼").fill("new12346")
  await page.getByRole("button", { name: "變更密碼" }).click()

  await expect(page.getByRole("alert")).toContainText("兩次輸入的新密碼不一樣。")
  expect(posted).toHaveLength(0)
})

test("NAS 使用者沒有目前密碼欄，送出的 body 不帶 current_password", async ({ page }) => {
  await mockApi(page, { user: { ...userFixture, has_password: false } })
  await seedToken(page)
  const bodies: unknown[] = []
  page.on("request", (r) => {
    if (r.url().endsWith("/api/auth/change-password")) bodies.push(r.postDataJSON())
  })
  await page.goto("/settings")

  await expect(page.getByText("你目前用 NAS 帳號登入，設定平台密碼後兩種都能登。")).toBeVisible()
  await expect(page.getByLabel("目前密碼")).toHaveCount(0)

  await page.getByLabel("新密碼", { exact: true }).fill("new12345")
  await page.getByLabel("確認新密碼").fill("new12345")
  await page.getByRole("button", { name: "設定密碼" }).click()

  await expect(page.getByRole("status")).toContainText("平台密碼已設定，之後可以用平台帳號登入。")
  expect(bodies).toEqual([{ new_password: "new12345" }])
})

/**
 * 釘住 `lib/auth-context.tsx` 的 `refresh()` 改動：它現在在已經有 user 的情況下不翻
 * `loading`（免得 RequireAuth 把整頁換掉、洗掉表單與提示）。這裡要確認「不翻 loading」
 * 沒有順手把 session 失效的處理也弄丟：refresh 途中 `/api/user/me` 回 401，
 * apiFetch 會清掉 session，畫面上本來還有使用者，也必須被導回登入頁。
 */
test("refresh() 途中 /api/user/me 回 401，畫面上還有使用者也要被導回登入頁", async ({ page }) => {
  await mockApi(page)
  await seedToken(page)
  // 這支 route 註冊在 mockApi 之後，Playwright 會讓它先比對，蓋掉共用的那一支。
  let meCalls = 0
  await page.route(`${API}/api/user/me`, async (route) => {
    meCalls += 1
    if (meCalls <= 1) return route.fulfill({ json: userFixture })
    return route.fulfill({ status: 401, json: { detail: "登入已過期，請重新登入" } })
  })

  await page.goto("/settings")
  // 使用者確實已經在畫面上
  await expect(page.getByText("已設定平台密碼")).toBeVisible()

  // 變更密碼成功後會呼叫 refresh()，第二次 /api/user/me 就吃到 401
  await page.getByLabel("目前密碼").fill("old12345")
  await page.getByLabel("新密碼", { exact: true }).fill("new12345")
  await page.getByLabel("確認新密碼").fill("new12345")
  await page.getByRole("button", { name: "變更密碼" }).click()

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole("tab", { name: "平台帳號" })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem("ctos-web.token"))).toBeNull()
})
