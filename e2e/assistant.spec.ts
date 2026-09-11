import { expect, test, type Page, type TestInfo } from "@playwright/test"
import {
  chatFixtures,
  emitSocketEvent,
  mockAiLog,
  mockApi,
  mockAssistant,
  mockBot,
  mockKb,
  mockProjects,
  seedToken,
  sentSocketEvents,
  socketAuthToken,
  userFixture,
} from "./helpers"

const CHAT_A = chatFixtures[0].id
const CHAT_B = chatFixtures[1].id

/** 手機把對話清單收成抽屜，要先打開才點得到清單裡的東西。 */
async function openChatListIfMobile(page: Page, testInfo: TestInfo) {
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "對話清單" }).click()
  }
}

async function gotoAssistant(page: Page, url = "/assistant") {
  await mockApi(page)
  await mockAssistant(page)
  await seedToken(page)
  await page.goto(url)
  await expect(page.getByRole("status", { name: "連線狀態" })).toHaveText("已連線")
}

test("載入對話清單，預設開最近一筆，訊息以 Markdown 渲染", async ({ page }, testInfo) => {
  await gotoAssistant(page)

  await openChatListIfMobile(page, testInfo)
  await expect(page.getByRole("button", { name: "上週出貨進度", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "報價單格式", exact: true })).toBeVisible()
  if (testInfo.project.name === "mobile") await page.keyboard.press("Escape")

  await expect(page).toHaveURL(new RegExp(`chat=${CHAT_A}`))
  await expect(page.getByText("上週出貨到哪了？")).toBeVisible()
  await expect(page.locator("strong")).toHaveText("三張")
})

test("握手帶 token", async ({ page }) => {
  await gotoAssistant(page)
  expect(await socketAuthToken(page)).toBe("tok-seeded")
})

test("新對話送 POST 並切到新對話", async ({ page }, testInfo) => {
  await gotoAssistant(page)
  await openChatListIfMobile(page, testInfo)

  const post = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/ai/chats"))
  await page.getByRole("button", { name: "新對話" }).click()
  const req = await post
  expect(req.postDataJSON()).toMatchObject({ title: "新對話", model: "claude-sonnet" })

  await expect(page).toHaveURL(/chat=99999999-9999-4999-8999-999999990001/)
  await expect(page.getByText("還沒有訊息，從下面開始問吧。")).toBeVisible()
})

test("送訊息會 emit ai_chat_event，內容正確", async ({ page }) => {
  await gotoAssistant(page)

  await page.getByRole("textbox", { name: "訊息" }).fill("幫我看這週的里程碑")
  await page.getByRole("button", { name: "送出" }).click()

  await expect(page.getByText("幫我看這週的里程碑")).toBeVisible()
  const sent = await sentSocketEvents(page)
  expect(sent).toEqual([
    { event: "ai_chat_event", payload: { chatId: CHAT_A, message: "幫我看這週的里程碑", model: "claude-sonnet" } },
  ])
  await expect(page.getByRole("textbox", { name: "訊息" })).toHaveValue("")
})

test("Enter 送出、Shift+Enter 換行", async ({ page }) => {
  await gotoAssistant(page)
  const box = page.getByRole("textbox", { name: "訊息" })

  await box.fill("第一行")
  await box.press("Shift+Enter")
  await box.pressSequentially("第二行")
  expect(await sentSocketEvents(page)).toEqual([])
  await expect(box).toHaveValue("第一行\n第二行")

  await box.press("Enter")
  const sent = await sentSocketEvents(page)
  expect(sent).toHaveLength(1)
  expect((sent[0].payload as { message: string }).message).toBe("第一行\n第二行")
})

test("ai_typing 顯示指示並禁止重送，ai_response 出現氣泡，工具時間軸可展開", async ({ page }) => {
  await gotoAssistant(page)

  await page.getByRole("textbox", { name: "訊息" }).fill("這週有什麼要出貨？")
  await page.getByRole("button", { name: "送出" }).click()

  await emitSocketEvent(page, "ai_typing", { chatId: CHAT_A, typing: true })
  await expect(page.getByText("AI 回覆中…")).toBeVisible()
  await expect(page.getByRole("button", { name: "送出" })).toBeDisabled()

  await emitSocketEvent(page, "ai_typing", { chatId: CHAT_A, typing: false })
  await emitSocketEvent(page, "ai_response", {
    chatId: CHAT_A,
    message: "這週有 `2` 張單要出。",
    tool_calls: [
      { id: "tc-1", name: "search_knowledge", input: { query: "出貨" }, output: "找到 2 筆" },
    ],
  })

  await expect(page.getByText("AI 回覆中…")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "送出" })).toBeEnabled()
  await expect(page.getByText("這週有 2 張單要出。")).toBeVisible()

  const toggle = page.getByRole("button", { name: "做了什麼（1 個工具）" })
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await toggle.click()
  await expect(page.getByText("第 1 步")).toBeVisible()
  await expect(page.getByText("search_knowledge")).toBeVisible()
  await page.getByRole("button", { name: "輸入" }).click()
  await expect(page.getByText('"query": "出貨"')).toBeVisible()
})

test("ai_error 顯示 alert", async ({ page }) => {
  await gotoAssistant(page)

  await page.getByRole("textbox", { name: "訊息" }).fill("壞掉的問題")
  await page.getByRole("button", { name: "送出" }).click()
  await emitSocketEvent(page, "ai_error", { chatId: CHAT_A, error: "AI 服務暫時無法使用" })

  await expect(page.getByRole("alert")).toContainText("AI 服務暫時無法使用")
  await expect(page.getByRole("button", { name: "送出" })).toBeEnabled()
})

test("別的對話的事件不會落到目前這串", async ({ page }) => {
  await gotoAssistant(page)
  await emitSocketEvent(page, "ai_response", { chatId: CHAT_B, message: "這是另一個對話的回答" })
  await expect(page.getByText("這是另一個對話的回答")).toHaveCount(0)
})

test("換 agent 會 PATCH prompt_name", async ({ page }) => {
  await gotoAssistant(page)

  const patch = page.waitForRequest((r) => r.method() === "PATCH" && r.url().includes(`/api/ai/chats/${CHAT_A}`))
  await page.getByRole("combobox", { name: "Agent" }).click()
  await page.getByRole("option", { name: "群組助理" }).click()
  const req = await patch
  expect(req.postDataJSON()).toEqual({ prompt_name: "group-assistant" })
})

test("重新命名對話送 PATCH title", async ({ page }, testInfo) => {
  await gotoAssistant(page)
  await openChatListIfMobile(page, testInfo)

  await page.getByRole("button", { name: "重新命名「上週出貨進度」" }).click()
  const dialog = page.getByRole("dialog").filter({ hasText: "重新命名對話" })
  await dialog.getByRole("textbox", { name: "標題" }).fill("出貨追蹤")

  const patch = page.waitForRequest((r) => r.method() === "PATCH" && r.url().includes(`/api/ai/chats/${CHAT_A}`))
  await dialog.getByRole("button", { name: "儲存" }).click()
  const req = await patch
  expect(req.postDataJSON()).toEqual({ title: "出貨追蹤" })
})

test("刪除對話要先確認，確認後送 DELETE 並移出清單", async ({ page }, testInfo) => {
  await gotoAssistant(page)
  await openChatListIfMobile(page, testInfo)

  await page.getByRole("button", { name: "刪除「報價單格式」" }).click()
  const del = page.waitForRequest((r) => r.method() === "DELETE" && r.url().includes(`/api/ai/chats/${CHAT_B}`))
  await page.getByRole("button", { name: "確定" }).click()
  await del

  await openChatListIfMobile(page, testInfo)
  await expect(page.getByRole("button", { name: "報價單格式", exact: true })).toHaveCount(0)
})

test("?q= 預填輸入框，?chat= 指定開哪一串", async ({ page }) => {
  await gotoAssistant(page, `/assistant?chat=${CHAT_B}&q=${encodeURIComponent("幫我查這個客戶")}`)

  await expect(page.getByRole("textbox", { name: "訊息" })).toHaveValue("幫我查這個客戶")
  await expect(page.getByText("還沒有訊息，從下面開始問吧。")).toBeVisible()
})

test("斷線時禁止輸入並提示", async ({ page }) => {
  await gotoAssistant(page)

  await emitSocketEvent(page, "disconnect", "transport close")
  await expect(page.getByRole("status", { name: "連線狀態" })).toHaveText("已斷線")
  await expect(page.getByRole("textbox", { name: "訊息" })).toBeDisabled()
  await expect(page.getByRole("button", { name: "送出" })).toBeDisabled()
})

test("沒有 ai-assistant 權限：側邊欄沒有項目，直接開會被擋下", async ({ page }, testInfo) => {
  const noAssistant = {
    ...userFixture,
    permissions: { ...userFixture.permissions, apps: { ...userFixture.permissions.apps, "ai-assistant": false } },
  }
  await mockApi(page, { user: noAssistant })
  await mockKb(page)
  await mockBot(page)
  await mockProjects(page)
  await mockAiLog(page)
  await mockAssistant(page)
  await seedToken(page)

  await page.goto("/")
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: /Toggle Sidebar/i }).click()
  }
  await expect(page.getByRole("navigation").first().getByRole("link", { name: "AI 助手" })).toHaveCount(0)

  await page.goto("/assistant")
  await expect(page.getByRole("heading", { name: "此功能需要管理員開放" })).toBeVisible()
})
