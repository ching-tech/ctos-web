import { describe, expect, it } from "vitest"
import {
  askAiHref,
  erpLabel,
  erpTint,
  formatAliases,
  formatAmount,
  formatLeadDays,
  formatQty,
  formatQtyDelta,
  itemAskAiHref,
  itemGroupOptions,
  parseAliases,
  PARTY_ROLE_LABEL,
  PARTY_ROLE_TINT,
  partyKbHref,
  partyRoles,
  PO_STATUS_LABEL,
  STOCK_REASON_LABEL,
  STOCK_REASON_TINT,
} from "./erp"

describe("parseAliases", () => {
  it("半形與全形逗號都算分隔", () => {
    expect(parseAliases("大同, Datong，大同電機")).toEqual(["大同", "Datong", "大同電機"])
  })

  it("去掉空白段與重複", () => {
    expect(parseAliases("大同,, 大同 ,")).toEqual(["大同"])
  })

  it("空字串是空陣列", () => {
    expect(parseAliases("   ")).toEqual([])
  })

  it("和 formatAliases 對得起來", () => {
    expect(parseAliases(formatAliases(["大同", "Datong"]))).toEqual(["大同", "Datong"])
  })
})

describe("partyRoles", () => {
  it("可以同時是供應商與客戶", () => {
    expect(partyRoles({ is_supplier: true, is_customer: true })).toEqual(["supplier", "customer"])
  })

  it("一個角色都沒有時是空陣列", () => {
    expect(partyRoles({ is_supplier: false, is_customer: false })).toEqual([])
  })
})

describe("formatAmount", () => {
  it("後端送的 Decimal 字串轉千分位，固定兩位小數", () => {
    expect(formatAmount("128000.00")).toBe("128,000.00")
    expect(formatAmount("45500.50")).toBe("45,500.50")
    expect(formatAmount("0")).toBe("0.00")
  })

  it("null 與空字串顯示破折號", () => {
    expect(formatAmount(null)).toBe("—")
    expect(formatAmount("")).toBe("—")
  })

  it("不是數字就原樣退回", () => {
    expect(formatAmount("待確認")).toBe("待確認")
  })
})

describe("連結", () => {
  it("問 AI 帶往來對象名稱前綴", () => {
    expect(askAiHref("大同機電")).toBe(`/assistant?q=${encodeURIComponent("關於往來對象「大同機電」：")}`)
  })

  it("知識庫用名稱當關鍵字", () => {
    expect(partyKbHref("大同機電")).toBe("/kb?q=%E5%A4%A7%E5%90%8C%E6%A9%9F%E9%9B%BB")
  })
})

describe("對照表", () => {
  it("角色與採購單狀態都有中文", () => {
    expect(erpLabel(PARTY_ROLE_LABEL, "supplier")).toBe("供應商")
    // both 只是清單的篩選值，不是掛在某一筆身上的角色
    expect(erpLabel(PARTY_ROLE_LABEL, "both")).toBe("供應商且客戶")
    expect(erpLabel(PO_STATUS_LABEL, "received")).toBe("已收貨")
  })

  it("對不到的鍵原樣顯示、沒有 tint", () => {
    expect(erpLabel(PARTY_ROLE_LABEL, "partner")).toBe("partner")
    expect(erpTint(PARTY_ROLE_TINT, "partner")).toBe("")
  })
})

describe("formatQty", () => {
  it("收掉 Numeric(18,4) 的尾數", () => {
    expect(formatQty("12.0000")).toBe("12")
    expect(formatQty("0.0000")).toBe("0")
  })

  it("小數真的有值時不砍", () => {
    expect(formatQty("1.5000")).toBe("1.5")
    expect(formatQty("0.2500")).toBe("0.25")
  })

  it("千分位照加", () => {
    expect(formatQty("12000.0000")).toBe("12,000")
  })

  it("null 與空字串顯示破折號、非數字原樣退回", () => {
    expect(formatQty(null)).toBe("—")
    expect(formatQty("")).toBe("—")
    expect(formatQty("待盤")).toBe("待盤")
  })
})

describe("formatQtyDelta", () => {
  it("正數補加號、負數保留負號", () => {
    expect(formatQtyDelta("10.0000")).toBe("+10")
    expect(formatQtyDelta("-2.0000")).toBe("-2")
  })

  it("0 不補符號", () => {
    expect(formatQtyDelta("0.0000")).toBe("0")
  })
})

describe("formatLeadDays", () => {
  it("有值補單位、沒填破折號", () => {
    expect(formatLeadDays(14)).toBe("14 天")
    expect(formatLeadDays(0)).toBe("0 天")
    expect(formatLeadDays(null)).toBe("—")
  })
})

describe("itemGroupOptions", () => {
  it("去重、去空值並排序", () => {
    expect(
      itemGroupOptions([
        { item_group: "感測器" },
        { item_group: "馬達" },
        { item_group: null },
        { item_group: "馬達" },
      ]),
    ).toEqual(["感測器", "馬達"].sort((a, b) => a.localeCompare(b, "zh-TW")))
  })

  it("全部沒有分類時是空陣列", () => {
    expect(itemGroupOptions([{ item_group: null }])).toEqual([])
  })
})

describe("物料連結與對照表", () => {
  it("問 AI 帶料號與品名", () => {
    expect(itemAskAiHref("MTR-0001", "感應馬達")).toBe(
      `/assistant?q=${encodeURIComponent("關於物料「MTR-0001 感應馬達」：")}`,
    )
  })

  it("異動原因有中文，對不到的鍵原樣顯示且沒有 tint", () => {
    expect(erpLabel(STOCK_REASON_LABEL, "transfer_out")).toBe("調撥出庫")
    expect(erpLabel(STOCK_REASON_LABEL, "receipt")).toBe("採購收貨")
    expect(erpLabel(STOCK_REASON_LABEL, "scrap")).toBe("scrap")
    expect(erpTint(STOCK_REASON_TINT, "scrap")).toBe("")
  })
})
