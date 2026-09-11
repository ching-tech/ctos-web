import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import {
  erpKeys,
  formatQty,
  lineRemainingQty,
  listWarehouses,
  receivePurchaseOrder,
  WAREHOUSE_PAGE_SIZE,
  type PurchaseOrderDetail,
  type PurchaseOrderReceiveRequest,
} from "@/lib/erp"

/**
 * 收貨對話框。
 *
 * 行項的 key 一定是 `line_id`：同一張採購單可以有兩行同一個物料（fixture 的
 * po-3 就是），只送 `item_id` 會被後端拋 AmbiguousError（409）。
 * 「全部收貨」走 `ReceiveRequest` 的 `all` 欄位（不是 `receive_all`，那是
 * service 函式的參數名），後端會把所有行項的未收量一次收完。
 */
export function ReceiveDialog({ po }: { po: PurchaseOrderDetail }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [warehouseId, setWarehouseId] = React.useState("")
  const [qtyByLine, setQtyByLine] = React.useState<Record<string, string>>({})

  const warehousesQuery = useQuery({
    queryKey: erpKeys.warehouseList,
    queryFn: () => listWarehouses(),
    retry: false,
    enabled: open,
  })
  const warehouses = warehousesQuery.data?.items ?? []
  // 後端 page_size 上限 100、這裡只抓第一頁，超過就要講清楚
  const truncated = (warehousesQuery.data?.total ?? 0) > warehouses.length

  // 只有一個倉時後端本來就會自動採用它（_resolve_receive_warehouse），
  // 畫面上直接顯示那一個，少一次點擊；不必用 effect 去同步 state
  const pickedWarehouseId = warehouseId || (warehouses.length === 1 ? warehouses[0].id : "")

  const openLines = po.lines.filter((l) => Number(lineRemainingQty(l)) > 0)

  const mutation = useMutation({
    mutationFn: (body: PurchaseOrderReceiveRequest) => receivePurchaseOrder(po.id, body),
    onSuccess: () => {
      // 回應只有 {success, status, audit_id}，行項的已收量要重抓明細；
      // 收貨會寫庫存異動，物料那邊的快取也一起失效
      queryClient.invalidateQueries({ queryKey: erpKeys.purchaseOrders })
      queryClient.invalidateQueries({ queryKey: erpKeys.items })
      setOpen(false)
    },
  })

  function reset() {
    setWarehouseId("")
    setQtyByLine(Object.fromEntries(openLines.map((l) => [l.id, lineRemainingQty(l)])))
  }

  function qtyOf(lineId: string, fallback: string) {
    return qtyByLine[lineId] ?? fallback
  }

  const picked = openLines
    .map((l) => ({ line_id: l.id, qty: qtyOf(l.id, lineRemainingQty(l)).trim() }))
    .filter((l) => Number(l.qty) > 0)

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) mutation.reset()
        if (v) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>收貨</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>採購收貨</DialogTitle>
          <DialogDescription>
            每一行預設收下全部未收量，可以改；填 0 的行這次不收。收貨會同時寫入庫存異動。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-medium">入庫倉</span>
            <Select value={pickedWarehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger aria-label="入庫倉" className="w-full">
                <SelectValue placeholder="請選擇" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {truncated && <p className="text-sm text-muted-foreground">只列前 {WAREHOUSE_PAGE_SIZE} 筆倉庫</p>}
            {warehousesQuery.isError && (
              <p className="text-sm text-muted-foreground">倉庫清單載入失敗，暫時挑不到入庫倉</p>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>物料</TableHead>
                  <TableHead className="text-right">未收</TableHead>
                  <TableHead className="min-w-28">本次收貨</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openLines.map((line, index) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <span className="font-mono text-muted-foreground">{line.item_code || "—"}</span> {line.item_name || ""}
                      {line.description && <span className="block text-muted-foreground">{line.description}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatQty(lineRemainingQty(line))}</TableCell>
                    <TableCell>
                      {/* 同一個物料可能佔兩行，標籤只能用列號分辨，不能用品名 */}
                      <Input
                        aria-label={`本次收貨第 ${index + 1} 列`}
                        inputMode="decimal"
                        value={qtyOf(line.id, lineRemainingQty(line))}
                        onChange={(e) => setQtyByLine((m) => ({ ...m, [line.id]: e.target.value }))}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {mutation.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {mutation.error instanceof ApiError ? mutation.error.detail : "收貨失敗，請稍後再試"}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ all: true, warehouse_id: pickedWarehouseId || null })}
          >
            全部收貨
          </Button>
          <Button
            type="button"
            disabled={picked.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate({ lines: picked, warehouse_id: pickedWarehouseId || null })}
          >
            送出收貨
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
