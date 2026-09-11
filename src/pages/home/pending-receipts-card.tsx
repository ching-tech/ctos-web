import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import {
  erpKeys,
  isExpectedOverdue,
  listPurchaseOrders,
  pendingReceiptOrders,
  PO_PENDING_PAGE_SIZE,
  todayIsoDate,
} from "@/lib/erp"

/**
 * 首頁「採購待收貨」卡。
 *
 * 後端 `list_purchase_orders` 的 `status` 是等值比對（`po.status = $2`），吃不了
 * 多個狀態，所以 `ordered` 與 `partial` 各打一次，兩份結果在前端合併。
 */
function usePendingOrders(status: "ordered" | "partial") {
  const filters = { status, page: 1, pageSize: PO_PENDING_PAGE_SIZE } as const
  return useQuery({
    queryKey: erpKeys.poPending(status),
    queryFn: () => listPurchaseOrders(filters),
  })
}

export function HomePendingReceipts() {
  const orderedQuery = usePendingOrders("ordered")
  const partialQuery = usePendingOrders("partial")

  const isLoading = orderedQuery.isLoading || partialQuery.isLoading
  const isError = orderedQuery.isError || partialQuery.isError
  const firstError = orderedQuery.error ?? partialQuery.error

  const total = (orderedQuery.data?.total ?? 0) + (partialQuery.data?.total ?? 0)
  const soonest = pendingReceiptOrders([orderedQuery.data?.items, partialQuery.data?.items])
  const today = todayIsoDate()

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <h2 className="text-lg font-semibold">採購待收貨</h2>
        <Link to="/purchase-orders?status=ordered" className="text-sm text-primary underline underline-offset-4">
          前往採購單
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : isError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {firstError instanceof ApiError ? firstError.detail : "載入失敗，請稍後再試"}
            </AlertDescription>
          </Alert>
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground">沒有待收貨的採購單</p>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">待收貨單數</p>
              <p className="text-lg font-semibold tabular-nums">{total}</p>
            </div>
            <ul className="space-y-2">
              {soonest.map((po) => (
                <li key={po.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <Link
                      to={`/purchase-orders/${po.id}`}
                      className="font-mono font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {po.po_no}
                    </Link>
                    <p className="truncate text-muted-foreground">{po.supplier_name || "—"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-muted-foreground tabular-nums">{po.expected_date || "—"}</span>
                    {isExpectedOverdue(po.expected_date, today) && <Badge variant="destructive">逾期</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
