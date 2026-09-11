import { Link } from "react-router"
import { Badge } from "@/components/ui/badge"
import { erpLabel, erpTint, formatAmount, PO_STATUS_LABEL, PO_STATUS_TINT, type PartyDetail } from "@/lib/erp"

/** 後端只回最近十筆（erp_parties.get_party_detail 的 LIMIT 10）。 */
export default function PurchaseOrdersTab({ party }: { party: PartyDetail }) {
  return (
    <div className="space-y-4 pt-4">
      <p className="text-sm text-muted-foreground">最近 {party.purchase_orders.length} 筆採購單</p>

      {party.purchase_orders.length === 0 ? (
        <p className="text-muted-foreground">還沒有採購單</p>
      ) : (
        <ul className="space-y-2">
          {party.purchase_orders.map((po) => (
            <li key={po.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/purchase-orders/${po.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                  {po.po_no}
                </Link>
                <Badge variant="tint" className={erpTint(PO_STATUS_TINT, po.status)}>
                  {erpLabel(PO_STATUS_LABEL, po.status)}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                <span>下單 {po.order_date || "—"}</span>
                <span>預計 {po.expected_date || "—"}</span>
                <span className="tabular-nums text-foreground">{formatAmount(po.total_amount)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
