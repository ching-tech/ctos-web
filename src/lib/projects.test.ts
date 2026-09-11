import { describe, expect, it } from "vitest"
import {
  canEditProject,
  MILESTONE_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  memberName,
  projectLabel,
  TASK_STATUS_LABEL,
  tint,
  PROJECT_STATUS_TINT,
  todayIso,
} from "./projects"
import type { UserInfo } from "./types"

function user(partial: Partial<UserInfo>): UserInfo {
  return {
    id: 2, username: "yazelin", display_name: "亞澤", is_admin: false, role: "user",
    account_role: "user", auth_type: "session", has_password: true, nas_username: null,
    permissions: { apps: {}, knowledge: {} },
    ...partial,
  }
}

describe("canEditProject", () => {
  const detail = { members: [{ user_id: 3, username: "chen", display_name: "陳工", role: "owner" }] }

  it("管理員一律可編輯", () => {
    expect(canEditProject(user({ id: 9, is_admin: true }), detail)).toBe(true)
  })

  it("專案成員可編輯", () => {
    expect(canEditProject(user({ id: 3 }), detail)).toBe(true)
  })

  it("非成員不可編輯", () => {
    expect(canEditProject(user({ id: 2 }), detail)).toBe(false)
  })

  it("未登入不可編輯", () => {
    expect(canEditProject(null, detail)).toBe(false)
  })
})

describe("中文對照", () => {
  it("狀態都有中文", () => {
    expect(PROJECT_STATUS_LABEL.on_hold).toBe("暫停")
    expect(MILESTONE_STATUS_LABEL.in_progress).toBe("進行中")
    expect(TASK_STATUS_LABEL.done).toBe("已完成")
  })

  it("對不到的鍵原樣回傳", () => {
    expect(projectLabel(PROJECT_STATUS_LABEL, "unknown")).toBe("unknown")
    expect(tint(PROJECT_STATUS_TINT, "unknown")).toBe("")
  })
})

describe("memberName", () => {
  it("優先 display_name", () => {
    expect(memberName({ username: "chen", display_name: "陳工" })).toBe("陳工")
  })
  it("沒有 display_name 退回 username", () => {
    expect(memberName({ username: "lin", display_name: null })).toBe("lin")
  })
  it("兩個都沒有時給破折號", () => {
    expect(memberName({ username: null, display_name: null })).toBe("—")
  })
})

describe("todayIso", () => {
  it("是本地日期而非 UTC 位移後的日期", () => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    expect(todayIso()).toBe(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)
  })
})
