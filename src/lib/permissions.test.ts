import { describe, expect, it } from "vitest"
import { canAccessApp } from "./permissions"
import type { UserInfo } from "./types"

function makeUser(overrides: Partial<UserInfo>): UserInfo {
  return {
    id: 1,
    username: "u",
    display_name: null,
    is_admin: false,
    role: "user",
    account_role: "user",
    auth_type: "session",
    has_password: true,
    nas_username: null,
    permissions: null,
    ...overrides,
  }
}

describe("canAccessApp", () => {
  it("admin 一律放行，即使沒有明確權限", () => {
    const admin = makeUser({ is_admin: true, permissions: { apps: {}, knowledge: {} } })
    expect(canAccessApp(admin, "ai-log")).toBe(true)
  })

  it("一般使用者有該 app 權限時放行", () => {
    const user = makeUser({ permissions: { apps: { "ai-log": true }, knowledge: {} } })
    expect(canAccessApp(user, "ai-log")).toBe(true)
  })

  it("一般使用者沒有該 app 權限，或 user 為 null 時擋下", () => {
    const user = makeUser({ permissions: { apps: { "ai-log": false }, knowledge: {} } })
    expect(canAccessApp(user, "ai-log")).toBe(false)
    expect(canAccessApp(makeUser({ permissions: null }), "ai-log")).toBe(false)
    expect(canAccessApp(null, "ai-log")).toBe(false)
  })
})
