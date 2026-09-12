import { expect, test } from "@playwright/test"
import { adminFixture, CREATED_PAT, mockApi, seedToken } from "./helpers"

test("清單列出既有權杖，範圍顯示成 app 名稱", async ({ page }) => {
  await mockApi(page)
  await seedToken(page)
  await page.goto("/settings")
  await expect(page.getByText("筆電 CLI", { exact: true })).toBeVisible()
  await expect(page.getByText("知識庫 · 唯讀")).toBeVisible()
  await expect(page.getByText("夜間備份", { exact: true })).toBeVisible()
  await expect(page.getByText("全部權限 · 可寫")).toBeVisible()
  await expect(page.getByText("永不過期")).toBeVisible()
})

test("建立成功顯示一次性權杖與複製鈕，關閉後清單多一筆且畫面上沒有權杖字串", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await mockApi(page)
  await seedToken(page)
  await page.goto("/settings")

  await page.getByRole("button", { name: "建立權杖" }).click()
  await page.getByLabel("名稱").fill("桌機 CLI")
  await page.getByRole("dialog").getByRole("button", { name: "建立" }).click()

  await expect(page.getByText("這是唯一一次看到它，關掉就拿不回來；遺失請撤銷後重建。")).toBeVisible()
  await expect(page.getByRole("textbox", { name: "權杖" })).toHaveValue(CREATED_PAT)
  await expect(page.getByText(`export CTOS_TOKEN=${CREATED_PAT}`)).toBeVisible()

  await page.getByRole("button", { name: "複製" }).click()
  await expect(page.getByText("已複製到剪貼簿。")).toBeVisible()

  // 沒勾「已保存」之前關不掉
  await expect(page.getByRole("button", { name: "關閉" })).toBeDisabled()
  await page.getByText("我已經把權杖保存好了").click()
  await page.getByRole("button", { name: "關閉" }).click()

  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByText("桌機 CLI", { exact: true })).toBeVisible()
  await expect(page.getByText(CREATED_PAT)).toHaveCount(0)
})

test("撤銷要先確認，確認後那一列消失", async ({ page }) => {
  await mockApi(page)
  await seedToken(page)
  await page.goto("/settings")
  await expect(page.getByText("筆電 CLI", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "撤銷" }).first().click()
  await expect(page.getByText("確定撤銷「筆電 CLI」？")).toBeVisible()
  await page.getByRole("button", { name: "返回" }).click()
  await expect(page.getByText("筆電 CLI", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "撤銷" }).first().click()
  await page.getByRole("button", { name: "確定撤銷" }).click()
  await expect(page.getByText("筆電 CLI", { exact: true })).toHaveCount(0)
  await expect(page.getByText("夜間備份", { exact: true })).toBeVisible()
})

test("用 PAT 登入的 session 建立權杖，顯示後端的 403 detail", async ({ page }) => {
  await mockApi(page, { patSession: true })
  await seedToken(page)
  await page.goto("/settings")

  await page.getByRole("button", { name: "建立權杖" }).click()
  await page.getByLabel("名稱").fill("再發一把")
  await page.getByRole("dialog").getByRole("button", { name: "建立" }).click()

  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "不可使用 API token 換發新 token，請以帳號密碼登入後再操作",
  )
})

test("用 PAT 登入的 session 撤銷權杖，顯示後端的 403 detail", async ({ page }) => {
  await mockApi(page, { patSession: true })
  await seedToken(page)
  await page.goto("/settings")

  await page.getByRole("button", { name: "撤銷" }).first().click()
  await page.getByRole("button", { name: "確定撤銷" }).click()

  await expect(page.getByRole("alert")).toContainText(
    "不可使用 API token 撤銷 token，請以帳號密碼登入後再操作",
  )
  // 403 擋下來，那一列還在
  await expect(page.getByText("筆電 CLI", { exact: true })).toBeVisible()
})

test("撤銷失敗的訊息，在下一次撤銷成功後會被清掉", async ({ page }) => {
  await mockApi(page, { failRevokeOnce: true })
  await seedToken(page)
  await page.goto("/settings")

  await page.getByRole("button", { name: "撤銷" }).first().click()
  await page.getByRole("button", { name: "確定撤銷" }).click()
  await expect(page.getByRole("alert")).toContainText("資料庫暫時連不上")
  await expect(page.getByText("筆電 CLI", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "撤銷" }).first().click()
  await page.getByRole("button", { name: "確定撤銷" }).click()
  await expect(page.getByText("筆電 CLI", { exact: true })).toHaveCount(0)
  await expect(page.getByRole("alert")).toHaveCount(0)
})

test("權限表是空的管理員，建立對話框仍然列得出可勾的範圍", async ({ page }) => {
  await mockApi(page, { user: { ...adminFixture, permissions: { apps: {}, knowledge: {} } } })
  await seedToken(page)
  await page.goto("/settings")

  await page.getByRole("button", { name: "建立權杖" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("checkbox", { name: "知識庫" })).toBeVisible()
  await expect(dialog.getByRole("checkbox", { name: "AI 助手" })).toBeVisible()
})
