import { expect, test, type Page } from "@playwright/test"
import {
  adminFixture,
  mockApi,
  mockScheduler,
  scheduledTaskFixtures,
  seedToken,
  trapUnmockedApi,
  userFixture,
  type ScheduledTaskFixture,
} from "./helpers"

/**
 * 排程頁（`/scheduler`）。後端 `/api/scheduler/*` 全部 `require_admin`
 * （ching-tech-os `api/scheduler.py` 44–240），所以登入的一律是 adminFixture。
 */
async function setup(
  page: Page,
  opts: { tasks?: ScheduledTaskFixture[]; admin?: boolean; failCreate?: string } = {},
) {
  const unmocked = await trapUnmockedApi(page)
  await mockApi(page, { user: opts.admin === false ? userFixture : adminFixture })
  const scheduler = await mockScheduler(page, { tasks: opts.tasks, failCreate: opts.failCreate })
  await seedToken(page)
  return { ...scheduler, unmocked }
}

const cronRow = (page: Page) => page.getByRole("row", { name: /每日晨間摘要/ })
const intervalRow = (page: Page) => page.getByRole("row", { name: /庫存水位巡檢/ })
const systemRow = (page: Page) => page.getByRole("row", { name: /cleanup_expired_shares/ })

test("清單列出動態與靜態排程，觸發、執行器、來源與上次執行的 badge 都對得上", async ({ page }) => {
  const { unmocked } = await setup(page)
  await page.goto("/scheduler")

  const cron = cronRow(page)
  await expect(cron).toContainText("Cron 0 9 * * *")
  await expect(cron).toContainText("web-chat-default")
  await expect(cron).toContainText("動態")
  await expect(cron.getByText("成功", { exact: true })).toBeVisible()

  const interval = intervalRow(page)
  await expect(interval).toContainText("每 6 小時")
  await expect(interval).toContainText("stock-watch / check_levels.py")
  await expect(interval.getByText("失敗", { exact: true })).toBeVisible()
  await expect(interval).toContainText("Script not found: stock-watch/check_levels.py")
  await expect(interval).toContainText("連續失敗 3 次")

  // 靜態排程的 cron 只回非星號欄位，前端要把缺的補回星號。
  await expect(systemRow(page)).toContainText("Cron 30 3 * * *")
  await expect(systemRow(page)).toContainText("系統")
  await expect(page.getByRole("row", { name: /linebot:refresh_groups/ })).toContainText("模組")
  await expect(page.getByRole("row", { name: /linebot:refresh_groups/ })).toContainText("每 12 小時")

  expect(unmocked).toEqual([])
})

test("切換啟用送 PATCH toggle，畫面跟著翻面", async ({ page }) => {
  await setup(page)
  await page.goto("/scheduler")

  const toggle = cronRow(page).getByRole("switch")
  await expect(toggle).toBeChecked()

  const patch = page.waitForRequest(
    (r) => r.method() === "PATCH" && r.url().endsWith(`/api/scheduler/tasks/${scheduledTaskFixtures[0].id}/toggle`),
  )
  await toggle.click()
  expect((await patch).postDataJSON()).toEqual({ is_enabled: false })
  await expect(cronRow(page).getByRole("switch")).not.toBeChecked()
})

test("立即執行要先確認，對話框講明真的會跑，確認後才送 POST", async ({ page }) => {
  await setup(page)
  await page.goto("/scheduler")

  let runCalls = 0
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/run")) runCalls += 1
  })

  await cronRow(page).getByRole("button", { name: "立即執行" }).click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toContainText("確定立即執行「每日晨間摘要」？")
  await expect(dialog).toContainText("這會馬上真的跑一次")
  expect(runCalls).toBe(0)

  const post = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith(`/api/scheduler/tasks/${scheduledTaskFixtures[0].id}/run`),
  )
  await dialog.getByRole("button", { name: "確定執行" }).click()
  await post
  await expect(page.getByRole("status")).toContainText("已送出執行: 每日晨間摘要")
})

test("立即執行按返回就不會送出", async ({ page }) => {
  await setup(page)
  await page.goto("/scheduler")

  let runCalls = 0
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/run")) runCalls += 1
  })

  await cronRow(page).getByRole("button", { name: "立即執行" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "返回" }).click()
  await expect(page.getByRole("alertdialog")).toHaveCount(0)
  expect(runCalls).toBe(0)
})

test("新增 cron 排程：用常用預設填五欄，送出的 body 照 ScheduledTaskCreate", async ({ page }) => {
  await setup(page)
  await page.goto("/scheduler/new")

  await page.getByLabel("名稱").fill("測試晨報")
  await page.getByLabel("說明").fill("每天早上跑一次")
  await page.getByRole("button", { name: "每天 09:00" }).click()
  await expect(page.getByLabel("分")).toHaveValue("0")
  await expect(page.getByLabel("時")).toHaveValue("9")

  await page.getByLabel("Agent").click()
  await page.getByRole("option", { name: /web-chat-default/ }).click()
  await page.getByLabel("指令").fill("回覆 ok")

  const post = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/scheduler/tasks"))
  await page.getByRole("button", { name: "新增" }).click()
  expect((await post).postDataJSON()).toEqual({
    name: "測試晨報",
    description: "每天早上跑一次",
    trigger_type: "cron",
    trigger_config: { minute: "0", hour: "9", day: "*", month: "*", day_of_week: "*" },
    executor_type: "agent",
    executor_config: { agent_name: "web-chat-default", prompt: "回覆 ok" },
    is_enabled: true,
  })

  await expect(page).toHaveURL(/\/scheduler$/)
  await expect(page.getByRole("row", { name: /測試晨報/ })).toBeVisible()
})

test("新增 interval 排程：切到間隔、關掉啟用，五欄都是整數", async ({ page }) => {
  await setup(page)
  await page.goto("/scheduler/new")

  await page.getByLabel("名稱").fill("兩小時巡檢")
  await page.getByLabel("觸發類型").click()
  await page.getByRole("option", { name: /Interval/ }).click()
  await page.getByLabel("小時").fill("2")

  await page.getByLabel("Agent").click()
  await page.getByRole("option", { name: /web-chat-default/ }).click()
  await page.getByLabel("指令").fill("回覆 ok")
  await page.getByLabel("啟用").click()

  const post = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/scheduler/tasks"))
  await page.getByRole("button", { name: "新增" }).click()
  expect((await post).postDataJSON()).toEqual({
    name: "兩小時巡檢",
    description: null,
    trigger_type: "interval",
    trigger_config: { weeks: 0, days: 0, hours: 2, minutes: 0, seconds: 0 },
    executor_type: "agent",
    executor_config: { agent_name: "web-chat-default", prompt: "回覆 ok" },
    is_enabled: false,
  })

  await expect(page.getByRole("row", { name: /兩小時巡檢/ })).toContainText("每 2 小時")
})

test("skill_script 的輸入資料不是合法 JSON 就擋下來，不送出", async ({ page }) => {
  await setup(page)
  await page.goto("/scheduler/new")

  await page.getByLabel("名稱").fill("壞掉的輸入")
  await page.getByLabel("執行器類型").click()
  await page.getByRole("option", { name: "Skill Script" }).click()
  await page.getByLabel("Skill").click()
  await page.getByRole("option", { name: "stock-watch" }).click()
  await page.getByLabel("Script").click()
  await page.getByRole("option", { name: "check_levels.py" }).click()
  await page.getByLabel("輸入資料（JSON）").fill("{threshold: 10}")

  await expect(page.getByText("輸入資料必須是合法的 JSON")).toBeVisible()
  await expect(page.getByRole("button", { name: "新增" })).toBeDisabled()

  await page.getByLabel("輸入資料（JSON）").fill('{"threshold": 10}')
  const post = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/scheduler/tasks"))
  await page.getByRole("button", { name: "新增" }).click()
  expect((await post).postDataJSON()).toMatchObject({
    executor_type: "skill_script",
    executor_config: { skill: "stock-watch", script: "check_levels.py", input: '{"threshold": 10}' },
  })
})

test("編輯只送改過的欄位", async ({ page }) => {
  await setup(page)
  await page.goto(`/scheduler/${scheduledTaskFixtures[0].id}/edit`)

  await expect(page.getByLabel("名稱")).toHaveValue("每日晨間摘要")
  await page.getByLabel("說明").fill("改過的說明")

  const put = page.waitForRequest(
    (r) => r.method() === "PUT" && r.url().endsWith(`/api/scheduler/tasks/${scheduledTaskFixtures[0].id}`),
  )
  await page.getByRole("button", { name: "儲存" }).click()
  expect((await put).postDataJSON()).toEqual({ description: "改過的說明" })
  await expect(page).toHaveURL(/\/scheduler$/)
})

test("名稱重複時原樣顯示後端的 detail", async ({ page }) => {
  await setup(page, { failCreate: "排程名稱已存在: 每日晨間摘要" })
  await page.goto("/scheduler/new")

  await page.getByLabel("名稱").fill("每日晨間摘要")
  await page.getByLabel("Agent").click()
  await page.getByRole("option", { name: /web-chat-default/ }).click()
  await page.getByLabel("指令").fill("回覆 ok")
  await page.getByRole("button", { name: "新增" }).click()

  await expect(page.getByRole("alert")).toContainText("排程名稱已存在: 每日晨間摘要")
})

test("系統來源的排程不能改：沒有動作按鈕、開關鎖住，直接打編輯網址也被擋", async ({ page }) => {
  await setup(page)
  await page.goto("/scheduler")

  const row = systemRow(page)
  await expect(row).toContainText("內建，不可修改")
  await expect(row.getByRole("button", { name: "編輯" })).toHaveCount(0)
  await expect(row.getByRole("button", { name: "刪除" })).toHaveCount(0)
  await expect(row.getByRole("switch")).toBeDisabled()

  await page.goto(`/scheduler/${scheduledTaskFixtures[2].id}/edit`)
  await expect(page.getByRole("alert")).toContainText("排程不存在")
})

test("刪除要先確認，確認後清單少一筆", async ({ page }) => {
  await setup(page)
  await page.goto("/scheduler")
  await expect(intervalRow(page)).toBeVisible()

  await intervalRow(page).getByRole("button", { name: "刪除" }).click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toContainText("確定刪除「庫存水位巡檢」？")

  const del = page.waitForRequest(
    (r) => r.method() === "DELETE" && r.url().endsWith(`/api/scheduler/tasks/${scheduledTaskFixtures[1].id}`),
  )
  await dialog.getByRole("button", { name: "確定刪除" }).click()
  await del
  await expect(intervalRow(page)).toHaveCount(0)
  await expect(cronRow(page)).toBeVisible()
})

test("非管理員看不到排程，也打不進頁面", async ({ page }) => {
  const { unmocked } = await setup(page, { admin: false })
  await page.goto("/scheduler")

  await expect(page.getByText("此頁只有管理員能使用")).toBeVisible()
  // 擋在畫面就不該發出任何排程請求
  expect(unmocked).toEqual([])
  await expect(page.getByRole("link", { name: "排程" })).toHaveCount(0)
})
