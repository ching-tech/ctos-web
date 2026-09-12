import { expect, test } from "@playwright/test"
import {
  adminFixture,
  aiManagementUserFixture,
  mockAiLog,
  mockAiManagement,
  mockApi,
  seedToken,
  trapUnmockedApi,
  userFixture,
} from "./helpers"

async function setup(
  page: Parameters<typeof mockApi>[0],
  opts: Parameters<typeof mockAiManagement>[1] = {},
  user: typeof aiManagementUserFixture | typeof adminFixture = aiManagementUserFixture,
) {
  const unmocked = await trapUnmockedApi(page)
  await mockApi(page, { user: { ...user } })
  const mock = await mockAiManagement(page, opts)
  await seedToken(page)
  return { ...mock, unmocked }
}

test("清單列出 Agent，狀態與搜尋都在", async ({ page }) => {
  const { unmocked } = await setup(page)
  await page.goto("/agents")
  const shown = (text: string) => page.getByText(text).filter({ visible: true })

  await expect(shown("web-chat")).toHaveCount(1)
  await expect(shown("night-report")).toHaveCount(1)
  await expect(page.getByText("停用").filter({ visible: true })).toHaveCount(1)

  await page.getByLabel("搜尋").fill("night")
  await expect(shown("night-report")).toHaveCount(1)
  await expect(page.getByText("web-chat")).toHaveCount(0)
  expect(unmocked).toEqual([])
})

test("明細列出模型、關聯 Prompt 與額外設定", async ({ page }) => {
  await setup(page)
  await page.goto("/agents/agt-1")

  await expect(page.getByRole("heading", { name: "網頁對話" })).toBeVisible()
  await expect(page.getByText("claude-sonnet").first()).toBeVisible()
  await expect(page.getByRole("link", { name: "預設對話助手" })).toHaveAttribute("href", "/prompts/pr-1")
  await expect(page.getByTestId("agent-settings")).toContainText("temperature")
})

test("測試面板成功時顯示回覆、耗時與 log 連結", async ({ page }) => {
  const { requests } = await setup(page)
  await mockAiLog(page)
  await page.goto("/agents/agt-1")

  await expect(page.getByTestId("test-panel")).toContainText("會計入用量")
  await page.getByLabel("測試訊息").fill("用一句話回答 1+1")
  await page.getByRole("button", { name: "送出測試" }).click()

  await expect(page.getByTestId("test-result")).toContainText("1+1 等於 2。")
  await expect(page.getByTestId("test-result")).toContainText("1,234ms")
  const post = requests.find((r) => r.method === "POST" && r.path.endsWith("/api/ai/test"))
  expect(post?.body).toEqual({ agent_id: "agt-1", message: "用一句話回答 1+1" })

  await page.getByRole("link", { name: "看這次的 AI Log" }).click()
  await expect(page).toHaveURL(/\/ai-log\/log-01$/)
})

test("停用中的 Agent 也送得出測試，後端的 already-disabled 錯誤原樣顯示", async ({ page }) => {
  await setup(page, {
    testResponse: { success: false, response: null, error: "Agent 'night-report' 已停用", duration_ms: null, log_id: null },
  })
  await page.goto("/agents/agt-3")

  await expect(page.getByTestId("test-panel")).toContainText("這個 Agent 目前停用")
  await page.getByLabel("測試訊息").fill("在嗎")
  await page.getByRole("button", { name: "送出測試" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "Agent 'night-report' 已停用" })).toBeVisible()
})

test("新增 Agent 送 POST 並導到明細", async ({ page }) => {
  const { requests } = await setup(page)
  await page.goto("/agents/new")

  await page.getByLabel("名稱").fill("demo-agent")
  await page.getByLabel("顯示名").fill("示範 Agent")
  await page.getByLabel("模型").fill("claude-sonnet")
  await page.getByLabel("System Prompt").click()
  await page.getByRole("option", { name: "對話摘要助手" }).click()
  await page.getByLabel("工具").fill("WebSearch")
  await page.getByLabel("工具").press("Enter")
  await page.getByRole("button", { name: "儲存" }).click()

  await expect(page).toHaveURL(/\/agents\/agt-100$/)
  const post = requests.find((r) => r.method === "POST" && r.path.endsWith("/api/ai/agents"))
  expect(post?.body).toEqual({
    name: "demo-agent",
    display_name: "示範 Agent",
    description: null,
    model: "claude-sonnet",
    system_prompt_id: "pr-3",
    is_active: true,
    tools: ["WebSearch"],
    settings: null,
  })
})

test("編輯停用只送 is_active", async ({ page }) => {
  const { requests } = await setup(page)
  await page.goto("/agents/agt-1/edit")

  await page.getByLabel("啟用").click()
  await page.getByRole("button", { name: "儲存" }).click()

  await expect(page).toHaveURL(/\/agents\/agt-1$/)
  const put = requests.find((r) => r.method === "PUT")
  expect(put?.body).toEqual({ is_active: false })
  await expect(page.getByText("停用").first()).toBeVisible()
})

test("額外設定 JSON 不合法時擋下來，不送請求", async ({ page }) => {
  const { requests } = await setup(page)
  await page.goto("/agents/agt-1/edit")

  await page.getByLabel("額外設定（JSON 物件）").fill("{ temperature: 0.2 }")
  await page.getByRole("button", { name: "儲存" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "JSON 格式不正確" })).toBeVisible()
  expect(requests.filter((r) => r.method === "PUT")).toHaveLength(0)
})

test("刪除要先確認，確認後回清單", async ({ page }) => {
  const { requests } = await setup(page)
  await page.goto("/agents/agt-3")

  await page.getByRole("button", { name: "刪除", exact: true }).click()
  await expect(page.getByRole("alertdialog")).toContainText("確定刪除")
  await page.getByRole("button", { name: "返回" }).click()
  expect(requests.filter((r) => r.method === "DELETE")).toHaveLength(0)

  await page.getByRole("button", { name: "刪除", exact: true }).click()
  await page.getByRole("button", { name: "確定刪除" }).click()
  await expect(page).toHaveURL(/\/agents$/)
  await expect(page.getByText("night-report")).toHaveCount(0)
})

test("Provider 狀態卡只有管理員看得到", async ({ page }) => {
  const { requests } = await setup(page, {}, adminFixture)
  await page.goto("/agents")

  await expect(page.getByTestId("provider-status")).toContainText("模式 auto")
  await expect(page.getByTestId("provider-status")).toContainText("circuit closed")
  await expect(page.getByTestId("provider-status")).toContainText("42%")
  expect(requests.some((r) => r.path.endsWith("/api/ai/providers/status"))).toBe(true)
})

test("非管理員不打 providers/status，也看不到那張卡", async ({ page }) => {
  const { requests } = await setup(page)
  await page.goto("/agents")

  await expect(page.getByLabel("搜尋")).toBeVisible()
  await expect(page.getByTestId("provider-status")).toHaveCount(0)
  expect(requests.some((r) => r.path.endsWith("/api/ai/providers/status"))).toBe(false)
})

test("沒有 agent-settings 權限時進不去", async ({ page }) => {
  await trapUnmockedApi(page)
  await mockApi(page, { user: { ...userFixture } })
  await seedToken(page)
  await page.goto("/agents")
  await expect(page.getByRole("heading", { name: "此功能需要管理員開放" })).toBeVisible()
})

test("清空可為空的欄位不會送 null，欄位旁邊講明清不掉", async ({ page }) => {
  const { requests } = await setup(page)
  await page.goto("/agents/agt-1/edit")

  // agt-1 原本有說明與兩個工具，兩個都清掉；後端 PUT 是 `is not None`，送 null 等於沒送（#252）
  await page.getByLabel("說明").fill("")
  await page.getByRole("button", { name: "移除「WebSearch」" }).click()
  await page.getByRole("button", { name: "移除「Read」" }).click()
  await expect(page.getByTestId("clear-unsupported-note")).toHaveCount(2)

  await page.getByLabel("模型").fill("claude-haiku")
  await page.getByRole("button", { name: "儲存" }).click()

  await expect(page).toHaveURL(/\/agents\/agt-1$/)
  const put = requests.find((r) => r.method === "PUT")
  expect(put?.body).toEqual({ model: "claude-haiku" })
  expect(Object.keys(put?.body as object)).not.toContain("tools")
})

test("重跑測試時不會把上一次的回覆留在畫面上", async ({ page }) => {
  await setup(page)
  await page.goto("/agents/agt-1")

  await page.getByLabel("測試訊息").fill("用一句話回答 1+1")
  await page.getByRole("button", { name: "送出測試" }).click()
  await expect(page.getByTestId("test-result")).toContainText("1+1 等於 2。")

  // 第二次刻意讓後端慢一點回，才看得出畫面上還留不留著上一次的結果
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route(/\/api\/ai\/test$/, async (route) => {
    await gate
    await route.fulfill({
      json: { success: true, response: "第二次的回覆。", error: null, duration_ms: 2222, log_id: "log-02" },
    })
  })

  await page.getByLabel("測試訊息").fill("再問一次")
  await page.getByRole("button", { name: "送出測試" }).click()
  await expect(page.getByRole("button", { name: "測試中…" })).toBeVisible()
  await expect(page.getByTestId("test-result")).toHaveCount(0)

  release()
  await expect(page.getByTestId("test-result")).toContainText("第二次的回覆。")
})
