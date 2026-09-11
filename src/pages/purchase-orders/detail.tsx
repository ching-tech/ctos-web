import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useParams } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import {
  canEditPurchaseOrderHeader,
  cancelPurchaseOrder,
  erpKeys,
  erpLabel,
  erpTint,
  formatAmount,
  formatDateTime,
  formatQty,
  getPurchaseOrder,
  isPurchaseOrderOpen,
  lineRemainingQty,
  PO_STATUS_LABEL,
  PO_STATUS_TINT,
  poAskAiHref,
} from "@/lib/erp"
import { ReceiveDialog } from "./receive-dialog"

function InfoRow({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-right break-words">{value}</dd>
    </div>
  )
}

export default function PurchaseOrderDetailPage() {
  const { id = "" } = useParams()
  const queryClient = useQueryClient()

  const detailQuery = useQuery({ queryKey: erpKeys.poDetail(id), queryFn: () => getPurchaseOrder(id), retry: false })

  const cancelMutation = useMutation({
    mutationFn: () => cancelPurchaseOrder(id),
    onSuccess: () => {
      // cancel 只回 {success, status, audit_id}，明細重抓
      queryClient.invalidateQueries({ queryKey: erpKeys.purchaseOrders })
    },
  })

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (detailQuery.isError) {
    const err = detailQuery.error
    if (err instanceof ApiError && err.status === 404) {
      return (
        <div className="space-y-3">
          <p>找不到這筆採購單</p>
          <Link to="/purchase-orders" className="text-primary underline underline-offset-4">
            回採購單清單
          </Link>
        </div>
      )
    }
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{err instanceof ApiError ? err.detail : "載入失敗，請稍後再試"}</AlertDescription>
      </Alert>
    )
  }

  const po = detailQuery.data!
  // 收貨與取消看 _CLOSED_STATUSES；「已收過貨不能取消」那條由後端擋，400 原樣顯示。
  // 編輯嚴一階：PurchaseOrderUpdate 的 status 只收 draft／ordered，partial 的單
  // 進編輯頁一送出就會把狀態壓回 ordered，所以那個狀態不給編輯。
  const isOpen = isPurchaseOrderOpen(po.status)
  const canEditHeader = canEditPurchaseOrderHeader(po.status)

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link to="/purchase-orders" className="text-sm text-primary underline-offset-4 hover:underline">
          回採購單清單
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold">{po.po_no}</h1>
            <Badge variant="tint" className={erpTint(PO_STATUS_TINT, po.status)}>
              {erpLabel(PO_STATUS_LABEL, po.status)}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* 從別頁導過去才讀得到 ?q=；助手頁只在掛載時讀一次 */}
            <Button asChild variant="outline">
              <Link to={poAskAiHref(po.po_no)}>問 AI</Link>
            </Button>
            {canEditHeader && (
              <Button asChild variant="outline">
                <Link to={`/purchase-orders/${po.id}/edit`}>編輯</Link>
              </Button>
            )}
            {isOpen && (
              <>
                <ReceiveDialog po={po} />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">取消採購單</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>確定取消這張採購單？</AlertDialogTitle>
                      <AlertDialogDescription>
                        取消不是刪除，單子還留著，狀態改成已取消；已經收過貨的單後端會擋下來。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>返回</AlertDialogCancel>
                      <AlertDialogAction onClick={() => cancelMutation.mutate()}>確定取消</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>
      </div>

      {cancelMutation.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {cancelMutation.error instanceof ApiError ? cancelMutation.error.detail : "取消失敗，請稍後再試"}
          </AlertDescription>
        </Alert>
      )}

      <section aria-label="採購單資訊" className="rounded-lg border p-4">
        <dl>
          <InfoRow
            term="供應商"
            value={
              po.supplier_name ? (
                <Link to={`/parties/${po.supplier_id}`} className="text-primary underline-offset-4 hover:underline">
                  {po.supplier_name}
                </Link>
              ) : (
                "—"
              )
            }
          />
          <InfoRow
            term="專案"
            value={
              po.project_id && po.project_name ? (
                <Link to={`/projects/${po.project_id}`} className="text-primary underline-offset-4 hover:underline">
                  {po.project_name}
                </Link>
              ) : (
                "—"
              )
            }
          />
          <InfoRow term="下單日" value={<span className="tabular-nums">{po.order_date || "—"}</span>} />
          <InfoRow term="預計到貨" value={<span className="tabular-nums">{po.expected_date || "—"}</span>} />
          <InfoRow term="金額" value={<span className="tabular-nums">{formatAmount(po.total_amount)}</span>} />
          <InfoRow term="備註" value={po.notes || "—"} />
          {/* created_at／updated_at 是 timestamptz，要轉成瀏覽器所在時區才顯示 */}
          <InfoRow term="建立時間" value={<span className="tabular-nums">{formatDateTime(po.created_at)}</span>} />
          <InfoRow term="最後更新" value={<span className="tabular-nums">{formatDateTime(po.updated_at)}</span>} />
        </dl>
      </section>

      <section aria-label="採購單行項" className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>物料</TableHead>
              <TableHead>描述</TableHead>
              <TableHead className="text-right">數量</TableHead>
              <TableHead className="text-right">單價</TableHead>
              <TableHead className="text-right">已收</TableHead>
              <TableHead className="text-right">未收</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {po.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>
                  {/* item_id 在後端是 NOT NULL ＋ FK RESTRICT，不會沒有；item_code／item_name
                      是 LEFT JOIN 來的，理論上也一定有，還是留破折號當保險 */}
                  <Link to={`/items/${line.item_id}`} className="text-primary underline-offset-4 hover:underline">
                    <span className="font-mono">{line.item_code || "—"}</span> {line.item_name || ""}
                  </Link>
                </TableCell>
                <TableCell>{line.description || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatQty(line.qty)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(line.unit_price)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatQty(line.received_qty)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatQty(lineRemainingQty(line))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  )
}
