import { expect, test } from "@playwright/test"
import {
  adminFixture,
  aiLogFixtures,
  mockAiLog,
  mockApi,
  mockBot,
  mockKb,
  mockProjects,
  seedToken,
  userFixture,
  type AiLogFixture,
} from "./helpers"

function todayStr(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

// 把固定的 12 筆 fixture 全部改到今天，維持原本的成功／失敗分布（9 成功／3 失敗＝75%），
// 這樣「今日 AI 用量」卡（依本地今天日期查 stats）才會如預期顯示 12 與 75%。
function logsForToday(): AiLogFixture[] {
  const today = todayStr()
  return aiLogFixtures.map((l) => ({ ...l, created_at: `${today}T${l.created_at.split("T")[1]}` }))
}

test("admin 看到三張卡與統計數字", async ({ page }) => {
  await mockApi(page, { user: adminFixture })
  await mockKb(page)
  await mockAiLog(page, { logs: logsForToday() })
  await mockBot(page)
  await mockProjects(page)
  await seedToken(page)

  const statsReq = page.waitForRequest((r) => r.url().includes("/api/ai/logs/stats"))

  await page.goto("/")

  await expect(page.getByRole("heading", { name: "今日 AI 用量" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Bot 概況" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "知識庫最近更新" })).toBeVisible()

  const aiCard = page.getByRole("heading", { name: "今日 AI 用量" }).locator("..").locator("..")
  await expect(aiCard.getByText("呼叫次數")).toBeVisible()
  await expect(aiCard.getByText("12", { exact: true })).toBeVisible()
  await expect(aiCard.getByText("75%", { exact: true })).toBeVisible()

  const botCard = page.getByRole("heading", { name: "Bot 概況" }).locator("..").locator("..")
  await expect(botCard.getByText("群組數")).toBeVisible()
  await expect(botCard.getByText("2", { exact: true })).toBeVisible()
  await expect(botCard.getByText("黑名單")).toBeVisible()
  await expect(botCard.getByText("1", { exact: true })).toBeVisible()
  await expect(botCard.getByText("Line 已綁定")).toBeVisible()
  await expect(botCard.getByText("Telegram 未綁定")).toBeVisible()

  await expect(page.getByRole("link", { name: "查看 AI Log" })).toHaveAttribute("href", `/ai-log?from=${todayStr()}&to=${todayStr()}`)
  await expect(page.getByRole("link", { name: "前往 Bot 管理" })).toHaveAttribute("href", "/bot")

  const url = (await statsReq).url()
  expect(url).toContain("start_date=")
})

test("沒有 AI Log 權限的使用者看不到今日 AI 用量卡，Bot 概況卡照常顯示", async ({ page }) => {
  const user = { ...userFixture, permissions: { ...userFixture.permissions, apps: { ...userFixture.permissions.apps } } }
  // fixture 預設 ai-log:false、linebot:true，這裡明確複製一份避免測試間共用同一物件。
  await mockApi(page, { user })
  await mockKb(page)
  await mockAiLog(page, { logs: logsForToday() })
  await mockBot(page)
  await mockProjects(page)
  await seedToken(page)

  await page.goto("/")

  await expect(page.getByRole("heading", { name: "今日 AI 用量" })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Bot 概況" })).toBeVisible()
})

test("沒有 Bot 權限的使用者看不到 Bot 概況卡，今日 AI 用量卡照常顯示", async ({ page }) => {
  const user = {
    ...userFixture,
    permissions: { ...userFixture.permissions, apps: { ...userFixture.permissions.apps, "ai-log": true, linebot: false } },
  }
  await mockApi(page, { user })
  await mockKb(page)
  await mockAiLog(page, { logs: logsForToday() })
  await mockBot(page)
  await mockProjects(page)
  await seedToken(page)

  await page.goto("/")

  await expect(page.getByRole("heading", { name: "今日 AI 用量" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Bot 概況" })).toHaveCount(0)
})

test("admin 看到進行中專案與逾期里程碑卡", async ({ page }) => {
  await mockApi(page, { user: adminFixture })
  await mockKb(page)
  await mockAiLog(page, { logs: logsForToday() })
  await mockBot(page)
  await mockProjects(page)
  await seedToken(page)

  await page.goto("/")

  await expect(page.getByRole("heading", { name: "進行中專案" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "逾期里程碑" })).toBeVisible()

  // fixture 只有 proj-1 是 active，active_count = 1。
  const projectsCard = page.getByRole("heading", { name: "進行中專案" }).locator("..").locator("..")
  await expect(projectsCard.getByText("1", { exact: true })).toBeVisible()
  await expect(projectsCard.getByRole("link", { name: "台北捷運監控案" })).toHaveAttribute("href", "/projects/proj-1")
  await expect(projectsCard.getByRole("link", { name: "查看全部專案" })).toHaveAttribute("href", "/projects?status=active")

  // fixture 的 proj-1 有 ms-1／ms-2 兩筆逾期里程碑，mock 固定回 days_overdue: 30。
  const milestonesCard = page.getByRole("heading", { name: "逾期里程碑" }).locator("..").locator("..")
  await expect(milestonesCard.getByText("逾期 30 天")).toHaveCount(2)
  await expect(milestonesCard.getByRole("link", { name: "台北捷運監控案" }).first()).toHaveAttribute("href", "/projects/proj-1?tab=overview")
})

test("沒有專案管理權限的使用者看不到兩張專案卡，也不打 /api/projects", async ({ page }) => {
  const user = { ...userFixture, permissions: { ...userFixture.permissions, apps: { ...userFixture.permissions.apps, "project-management": false } } }
  await mockApi(page, { user })
  await mockKb(page)
  await mockAiLog(page, { logs: logsForToday() })
  await mockBot(page)
  await mockProjects(page)
  await seedToken(page)

  const requests: string[] = []
  page.on("request", (r) => requests.push(r.url()))

  await page.goto("/")

  await expect(page.getByRole("heading", { name: "進行中專案" })).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "逾期里程碑" })).toHaveCount(0)
  expect(requests.some((u) => u.includes("/api/projects"))).toBe(false)
})

test("專案摘要空時兩張卡顯示空狀態文案", async ({ page }) => {
  await mockApi(page, { user: adminFixture })
  await mockKb(page)
  await mockAiLog(page, { logs: logsForToday() })
  await mockBot(page)
  await mockProjects(page, { projects: [] })
  await seedToken(page)

  await page.goto("/")

  await expect(page.getByRole("heading", { name: "進行中專案" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "逾期里程碑" })).toBeVisible()
  await expect(page.getByText("目前沒有進行中的專案")).toBeVisible()
  await expect(page.getByText("沒有逾期的里程碑")).toBeVisible()
})
