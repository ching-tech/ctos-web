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
  canEditPurchaseOrderHeader,
  isExpectedOverdue,
  isPurchaseOrderOpen,
  itemAskAiHref,
  itemGroupOptions,
  lineRemainingQty,
  parseAliases,
  PARTY_ROLE_LABEL,
  PARTY_ROLE_TINT,
  partyKbHref,
  partyRoles,
  pendingReceiptOrders,
  PO_STATUS_LABEL,
  poAskAiHref,
  STOCK_REASON_LABEL,
  STOCK_REASON_TINT,
  todayIsoDate,
  type PurchaseOrderListItem,
} from "./erp"

describe("parseAliases", () => {
  it("半形與全形逗號都算分隔", () => {
    expect(parseAliases("甲一, Jiayi，甲一電機")).toEqual(["甲一", "Jiayi", "甲一電機"])
  })

  it("去掉空白段與重複", () => {
    expect(parseAliases("甲一,, 甲一 ,")).toEqual(["甲一"])
  })

  it("空字串是空陣列", () => {
    expect(parseAliases("   ")).toEqual([])
  })

  it("和 formatAliases 對得起來", () => {
    expect(parseAliases(formatAliases(["甲一", "Jiayi"]))).toEqual(["甲一", "Jiayi"])
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
    expect(askAiHref("甲一機電")).toBe(`/assistant?q=${encodeURIComponent("關於往來對象「甲一機電」：")}`)
  })

  it("知識庫用名稱當關鍵字", () => {
    expect(partyKbHref("甲一機電")).toBe("/kb?q=%E7%94%B2%E4%B8%80%E6%A9%9F%E9%9B%BB")
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

describe("採購單狀態規則", () => {
  it("已收貨與已取消不能再改也不能再收", () => {
    expect(isPurchaseOrderOpen("draft")).toBe(true)
    expect(isPurchaseOrderOpen("ordered")).toBe(true)
    expect(isPurchaseOrderOpen("partial")).toBe(true)
    expect(isPurchaseOrderOpen("received")).toBe(false)
    expect(isPurchaseOrderOpen("cancelled")).toBe(false)
  })

  it("能編輯單頭的只有草稿與已下單（比「還沒結案」嚴一階）", () => {
    // PurchaseOrderUpdate 的 status 只收 draft／ordered，partial 進編輯頁
    // 一送出就會被壓回 ordered，所以那個狀態不給編輯
    expect(canEditPurchaseOrderHeader("draft")).toBe(true)
    expect(canEditPurchaseOrderHeader("ordered")).toBe(true)
    expect(canEditPurchaseOrderHeader("partial")).toBe(false)
    expect(canEditPurchaseOrderHeader("received")).toBe(false)
    expect(canEditPurchaseOrderHeader("cancelled")).toBe(false)
  })

  it("狀態有中文，對不到的鍵原樣顯示", () => {
    expect(erpLabel(PO_STATUS_LABEL, "partial")).toBe("部分到貨")
    expect(erpLabel(PO_STATUS_LABEL, "closed")).toBe("closed")
  })

  it("問 AI 帶單號", () => {
    expect(poAskAiHref("PO-202608-001")).toBe(
      `/assistant?q=${encodeURIComponent("關於採購單「PO-202608-001」：")}`,
    )
  })
})

describe("lineRemainingQty", () => {
  it("未收量收掉 Numeric(18,4) 的尾數與浮點誤差", () => {
    expect(lineRemainingQty({ qty: "10.0000", received_qty: "0.0000" })).toBe("10")
    expect(lineRemainingQty({ qty: "6.0000", received_qty: "2.0000" })).toBe("4")
    expect(lineRemainingQty({ qty: "1.5000", received_qty: "0.3000" })).toBe("1.2")
    expect(lineRemainingQty({ qty: "0.3000", received_qty: "0.1000" })).toBe("0.2")
  })

  it("全收是 0，資料異常也不給負數", () => {
    expect(lineRemainingQty({ qty: "36.0000", received_qty: "36.0000" })).toBe("0")
    expect(lineRemainingQty({ qty: "1.0000", received_qty: "2.0000" })).toBe("0")
  })
})

describe("isExpectedOverdue", () => {
  it("預計到貨早於今天才算逾期，沒填不算", () => {
    expect(isExpectedOverdue("2026-09-11", "2026-09-12")).toBe(true)
    expect(isExpectedOverdue("2026-09-12", "2026-09-12")).toBe(false)
    expect(isExpectedOverdue("2026-09-13", "2026-09-12")).toBe(false)
    expect(isExpectedOverdue(null, "2026-09-12")).toBe(false)
  })
})

describe("todayIsoDate", () => {
  it("用本地時間算，不是 toISOString 的 UTC", () => {
    // 台北時間 2026-09-12 00:30 在 UTC 還是 09-11
    expect(todayIsoDate(new Date(2026, 8, 12, 0, 30))).toBe("2026-09-12")
  })
})

describe("pendingReceiptOrders", () => {
  function po(id: string, expected: string | null): PurchaseOrderListItem {
    return {
      id, po_no: `PO-202609-${id}`, supplier_id: "s", supplier_name: null, project_id: null,
      project_name: null, status: "ordered", order_date: null, expected_date: expected,
      line_count: 1, total_amount: "0", created_at: "2026-09-01T00:00:00+00:00",
      updated_at: "2026-09-01T00:00:00+00:00",
    }
  }

  it("兩份結果合併、依預計到貨升冪、沒填日期排最後、只取前五", () => {
    const ordered = [po("005", "2026-09-25"), po("001", "2026-09-01"), po("006", null)]
    const partial = [po("003", "2026-09-10"), po("002", "2026-09-05"), po("004", "2026-09-20")]
    expect(pendingReceiptOrders([ordered, partial]).map((p) => p.id)).toEqual([
      "001", "002", "003", "004", "005",
    ])
  })

  it("還沒回來的那一份當空陣列", () => {
    expect(pendingReceiptOrders([undefined, [po("001", "2026-09-01")]]).map((p) => p.id)).toEqual(["001"])
    expect(pendingReceiptOrders([undefined, undefined])).toEqual([])
  })
})
