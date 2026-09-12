import { describe, expect, it } from "vitest"
import type { ConfigApp } from "@/lib/config-apps"
import { appLabel, appOptions } from "./apps"

/** 照 `GET /api/config/apps` 實際回的形狀（裸陣列，skill 貢獻的多 loader／css）。 */
const apps: ConfigApp[] = [
  { id: "knowledge-base", name: "知識庫", icon: "mdi-book-open-page-variant" },
  { id: "vendor-management", name: "廠商管理", icon: "mdi-handshake" },
  {
    id: "his-integration",
    name: "HIS 整合",
    icon: "mdi-hospital-box",
    loader: { src: "/api/skills/his-integration/frontend/his-app.js", globalName: "HISIntegrationApp" },
    css: "/api/skills/his-integration/frontend/his-app.css",
  },
]

describe("appLabel", () => {
  it("用後端給的名字，不是側邊欄的", () => {
    // 同一個 app 兩邊名字不一樣：側邊欄寫「往來對象」，後端寫「廠商管理」。
    expect(appLabel(apps, "vendor-management")).toBe("廠商管理")
    expect(appLabel(apps, "knowledge-base")).toBe("知識庫")
  })

  it("skill 貢獻的 app 也有名字", () => {
    expect(appLabel(apps, "his-integration")).toBe("HIS 整合")
  })

  it("後端沒宣告的 id 原樣顯示", () => {
    // `debug-skill` 的 SKILL.md 寫的是 `admin`，那不是 app manifest 裡的東西。
    expect(appLabel(apps, "admin")).toBe("admin")
  })

  it("清單還沒抓回來時也不會炸", () => {
    expect(appLabel([], "knowledge-base")).toBe("knowledge-base")
  })
})

describe("appOptions", () => {
  it("沒有已選值時就是後端那份，順序照後端", () => {
    expect(appOptions(apps, [])).toEqual(["knowledge-base", "vendor-management", "his-integration"])
  })

  it("已選的 id 後端有宣告時不重複列", () => {
    expect(appOptions(apps, ["vendor-management"])).toEqual(["knowledge-base", "vendor-management", "his-integration"])
  })

  it("後端沒宣告的已選 id 要留住並排在後面", () => {
    // 這條是重點：留不住的話，管理員在網頁上按一次儲存就會把 SKILL.md 原本的 `admin` 洗掉。
    expect(appOptions(apps, ["admin"])).toEqual([
      "knowledge-base",
      "vendor-management",
      "his-integration",
      "admin",
    ])
  })

  it("已選值自己有重複時只列一次", () => {
    expect(appOptions(apps, ["admin", "admin"])).toEqual([
      "knowledge-base",
      "vendor-management",
      "his-integration",
      "admin",
    ])
  })

  it("清單還沒抓回來時只剩已選的那些，不會把設定弄丟", () => {
    expect(appOptions([], ["knowledge-base", "admin"])).toEqual(["knowledge-base", "admin"])
  })
})
