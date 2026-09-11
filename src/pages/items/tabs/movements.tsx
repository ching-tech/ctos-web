import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { erpLabel, erpTint, formatQtyDelta, STOCK_REASON_LABEL, STOCK_REASON_TINT, type ItemDetail } from "@/lib/erp"

/** 後端只回最近二十筆（erp_inventory.get_item_detail 的 movement_limit）。 */
export default function ItemMovementsTab({ item }: { item: ItemDetail }) {
  return (
    <div className="space-y-4 pt-4">
      <p className="text-sm text-muted-foreground">最近 {item.movements.length} 筆異動</p>

      {item.movements.length === 0 ? (
        <p className="text-muted-foreground">還沒有庫存異動</p>
      ) : (
        <section aria-label="庫存異動" className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>時間</TableHead>
                <TableHead>倉庫</TableHead>
                <TableHead className="text-right">增減</TableHead>
                <TableHead>原因</TableHead>
                <TableHead>備註</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {item.movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="tabular-nums whitespace-nowrap">{m.created_at.replace("T", " ").slice(0, 16)}</TableCell>
                  <TableCell>{m.warehouse_name || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQtyDelta(m.qty_delta)}</TableCell>
                  <TableCell>
                    <Badge variant="tint" className={erpTint(STOCK_REASON_TINT, m.reason)}>
                      {erpLabel(STOCK_REASON_LABEL, m.reason)}
                    </Badge>
                  </TableCell>
                  <TableCell>{m.note || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  )
}
