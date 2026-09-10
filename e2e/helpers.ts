import type { Page } from "@playwright/test"

export const API = "https://ching-tech.ddns.net/ctos"

export const userFixture = {
  id: 2, username: "yazelin", display_name: "亞澤", is_admin: false, role: "user",
  account_role: "user", auth_type: "session", has_password: true, nas_username: "yazelin", permissions: {},
}
export const adminFixture = { ...userFixture, id: 1, username: "admin", display_name: "管理員", is_admin: true, role: "admin", account_role: "admin" }

export async function mockApi(page: Page, opts: { user?: typeof userFixture | null; loginOk?: boolean } = {}) {
  const user = opts.user === undefined ? { ...userFixture } : opts.user
  const loginOk = opts.loginOk ?? true
  await page.route(`${API}/api/auth/login`, async (route) => {
    const body = route.request().postDataJSON() as { username: string; password: string; method: string }
    await route.fulfill({ json: loginOk
      ? { success: true, token: "tok-" + body.method, username: body.username, error: null, role: "user", must_change_password: false }
      : { success: false, token: null, username: null, error: "帳號或密碼錯誤", role: null, must_change_password: false } })
  })
  await page.route(`${API}/api/auth/logout`, (route) => route.fulfill({ json: { success: true } }))
  await page.route(`${API}/api/user/me/nas-binding`, async (route) => {
    const method = route.request().method()
    if (method === "DELETE") { if (user) user.nas_username = null; return route.fulfill({ json: { success: true, nas_username: null } }) }
    const body = route.request().postDataJSON() as { nas_username: string; password: string }
    if (body.password === "wrong") return route.fulfill({ status: 401, json: { detail: "NAS 帳號或密碼錯誤" } })
    if (body.nas_username === "taken") return route.fulfill({ status: 409, json: { detail: "此 NAS 帳號已綁定其他使用者" } })
    if (user) user.nas_username = body.nas_username
    return route.fulfill({ json: { success: true, nas_username: body.nas_username } })
  })
  await page.route(`${API}/api/user/me`, (route) => {
    const auth = route.request().headers()["authorization"]
    if (!auth || !user) return route.fulfill({ status: 401, json: { detail: "未授權" } })
    return route.fulfill({ json: user })
  })
}

export async function seedToken(page: Page, token = "tok-seeded") {
  await page.addInitScript((t) => localStorage.setItem("ctos-web.token", t), token)
}
