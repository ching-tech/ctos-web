import { expect, test } from "@playwright/test"
import { mockApi, seedToken } from "./helpers"

const htmlClass = "html"

test("後端存的主題會帶進來，也套到畫面上", async ({ page }) => {
  await mockApi(page, { theme: "light" })
  await seedToken(page)
  await page.goto("/settings")

  await expect(page.getByRole("radio", { name: "亮色" })).toBeChecked()
  await expect(page.locator(htmlClass)).toHaveClass(/light/)
})

test("切換主題會 PUT 回去，側邊欄用的是同一份狀態", async ({ page }) => {
  await mockApi(page, { theme: "light" })
  await seedToken(page)
  const puts: unknown[] = []
  page.on("request", (r) => {
    if (r.url().endsWith("/api/user/preferences") && r.method() === "PUT") puts.push(r.postDataJSON())
  })
  await page.goto("/settings")
  await expect(page.getByRole("radio", { name: "亮色" })).toBeChecked()

  await page.getByRole("radio", { name: "暗色" }).click()

  await expect(page.locator(htmlClass)).toHaveClass(/dark/)
  await expect.poll(() => puts).toEqual([{ theme: "dark" }])
  // ThemeProvider 那一份狀態（側邊欄的切換鈕也讀它）確實被改了
  await expect.poll(() => page.evaluate(() => localStorage.getItem("ctos-web.theme"))).toBe("dark")
})

test("後端回 400 時退回原值，並把 detail 顯示出來", async ({ page }) => {
  await mockApi(page, { theme: "light", themeUpdateFails: true })
  await seedToken(page)
  await page.goto("/settings")
  await expect(page.getByRole("radio", { name: "亮色" })).toBeChecked()

  await page.getByRole("radio", { name: "暗色" }).click()

  await expect(page.getByRole("alert")).toContainText("無效的主題值，必須為 'dark' 或 'light'")
  await expect(page.getByRole("radio", { name: "亮色" })).toBeChecked()
  await expect(page.locator(htmlClass)).toHaveClass(/light/)
})

/**
 * ching-tech-os #240：後端把 `users.preferences` 寫成陣列之後，`GET` 讀回來的值
 * 前端認不得。這種時候要當成「後端還沒有存過」——畫面不動，但使用者之後改主題
 * 仍然要寫得出去，不可以靜靜地變成 no-op。
 */
test("後端回認不得的主題值時，之後的切換照樣 PUT 得出去", async ({ page }) => {
  await mockApi(page, { theme: "solarized" })
  await seedToken(page)
  const puts: unknown[] = []
  page.on("request", (r) => {
    if (r.url().endsWith("/api/user/preferences") && r.method() === "PUT") puts.push(r.postDataJSON())
  })
  await page.goto("/settings")
  await page.getByRole("radio", { name: "亮色" }).waitFor()
  // 認不得的值不會被套到畫面上，維持本機原本的主題
  await expect(page.getByRole("radio", { name: "亮色" })).not.toBeChecked()

  await page.getByRole("radio", { name: "亮色" }).click()

  await expect(page.locator("html")).toHaveClass(/light/)
  await expect.poll(() => puts).toEqual([{ theme: "light" }])
})

test("整組的「主題」標題不是某一顆 radio 的 label，點它不會選中任何一個", async ({ page }) => {
  await mockApi(page, { theme: "dark" })
  await seedToken(page)
  await page.goto("/settings")
  await expect(page.getByRole("radio", { name: "暗色" })).toBeChecked()

  await page.getByText("主題", { exact: true }).click()

  await expect(page.getByRole("radio", { name: "亮色" })).not.toBeChecked()
  await expect(page.getByRole("radio", { name: "暗色" })).toBeChecked()
})
