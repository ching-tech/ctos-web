import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Link } from "react-router"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import {
  adjustStock,
  erpKeys,
  formatQty,
  listWarehouses,
  transferStock,
  WAREHOUSE_PAGE_SIZE,
  type ItemDetail,
  type Warehouse,
} from "@/lib/erp"

/** 調整與調撥共用：兩個對話框都要倉庫清單，抓一次就好。 */
function useWarehouses() {
  const query = useQuery({
    queryKey: erpKeys.warehouseList,
    queryFn: () => listWarehouses(),
    retry: false,
  })
  const warehouses = query.data?.items ?? []
  return {
    warehouses,
    isError: query.isError,
    // 後端 page_size 上限 100、這裡只抓第一頁，超過就要講清楚，不然使用者會以為那個倉不存在
    truncated: (query.data?.total ?? 0) > warehouses.length,
  }
}

/** 倉庫下拉只吃第一頁時的提示，兩個對話框共用。 */
function TruncatedHint({ truncated }: { truncated: boolean }) {
  if (!truncated) return null
  return (
    <p className="text-sm text-muted-foreground">
      只列前 {WAREHOUSE_PAGE_SIZE} 筆倉庫
    </p>
  )
}

function WarehouseSelect({
  label,
  value,
  onChange,
  warehouses,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  warehouses: Warehouse[]
}) {
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="w-full">
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
    </div>
  )
}

/** 調整庫存：qty_delta 可正可負，reason 固定送 adjust（其他原因是系統自己寫的）。 */
function AdjustDialog({
  item,
  warehouses,
  truncated,
}: {
  item: ItemDetail
  warehouses: Warehouse[]
  truncated: boolean
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [warehouseId, setWarehouseId] = React.useState("")
  const [qtyDelta, setQtyDelta] = React.useState("")
  const [note, setNote] = React.useState("")

  const mutation = useMutation({
    mutationFn: () =>
      adjustStock({
        item_id: item.id,
        warehouse_id: warehouseId,
        qty_delta: qtyDelta.trim(),
        reason: "adjust",
        note: note.trim() || null,
      }),
    onSuccess: () => {
      // 回應只有 qty_after，餘額與異動一起重抓明細比較實在
      queryClient.invalidateQueries({ queryKey: erpKeys.itemDetail(item.id) })
      queryClient.invalidateQueries({ queryKey: erpKeys.items })
      setOpen(false)
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) mutation.reset()
        if (v) {
          setWarehouseId("")
          setQtyDelta("")
          setNote("")
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          調整
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>調整庫存</DialogTitle>
          <DialogDescription>
            數量可正可負，異動原因一律記成「調整」；異動後餘額為負會被後端擋下。
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!warehouseId || !qtyDelta.trim()) return
            mutation.mutate()
          }}
        >
          <WarehouseSelect
            label="倉庫"
            value={warehouseId}
            onChange={setWarehouseId}
            warehouses={warehouses}
          />
          <TruncatedHint truncated={truncated} />
          <div className="space-y-2">
            <Label htmlFor="adjust-qty">增減數量</Label>
            <Input
              id="adjust-qty"
              required
              inputMode="decimal"
              placeholder="增加填正數、減少填負數"
              value={qtyDelta}
              onChange={(e) => setQtyDelta(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adjust-note">備註</Label>
            <Input
              id="adjust-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {mutation.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {mutation.error instanceof ApiError
                  ? mutation.error.detail
                  : "調整失敗，請稍後再試"}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            {/* 沒挑倉庫或沒填數量就送出，後端只會回 422，擋在這裡比較快 */}
            <Button
              type="submit"
              disabled={!warehouseId || !qtyDelta.trim() || mutation.isPending}
            >
              送出調整
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** 倉別調撥：後端在同一交易寫 transfer_out 與 transfer_in 兩筆。 */
function TransferDialog({
  item,
  warehouses,
  truncated,
}: {
  item: ItemDetail
  warehouses: Warehouse[]
  truncated: boolean
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [fromId, setFromId] = React.useState("")
  const [toId, setToId] = React.useState("")
  const [qty, setQty] = React.useState("")
  const [note, setNote] = React.useState("")

  const mutation = useMutation({
    mutationFn: () =>
      transferStock({
        item_id: item.id,
        from_warehouse_id: fromId,
        to_warehouse_id: toId,
        qty: qty.trim(),
        note: note.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: erpKeys.itemDetail(item.id) })
      queryClient.invalidateQueries({ queryKey: erpKeys.items })
      setOpen(false)
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) mutation.reset()
        if (v) {
          setFromId("")
          setToId("")
          setQty("")
          setNote("")
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          調撥
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>倉別調撥</DialogTitle>
          <DialogDescription>
            來源倉與目的倉不能相同，數量要大於 0；來源倉餘額不夠會被後端擋下。
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!fromId || !toId || !qty.trim()) return
            mutation.mutate()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <WarehouseSelect
              label="來源倉"
              value={fromId}
              onChange={setFromId}
              warehouses={warehouses}
            />
            <WarehouseSelect
              label="目的倉"
              value={toId}
              onChange={setToId}
              warehouses={warehouses}
            />
          </div>
          <TruncatedHint truncated={truncated} />
          <div className="space-y-2">
            <Label htmlFor="transfer-qty">數量</Label>
            <Input
              id="transfer-qty"
              required
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="transfer-note">備註</Label>
            <Input
              id="transfer-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {mutation.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {mutation.error instanceof ApiError
                  ? mutation.error.detail
                  : "調撥失敗，請稍後再試"}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="submit"
              disabled={!fromId || !toId || !qty.trim() || mutation.isPending}
            >
              送出調撥
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function ItemStockTab({ item }: { item: ItemDetail }) {
  const { warehouses, isError, truncated } = useWarehouses()

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          總庫存{" "}
          <span className="text-foreground tabular-nums">
            {formatQty(item.total_qty)}
          </span>
          {item.unit ? ` ${item.unit}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <AdjustDialog
            item={item}
            warehouses={warehouses}
            truncated={truncated}
          />
          <TransferDialog
            item={item}
            warehouses={warehouses}
            truncated={truncated}
          />
        </div>
      </div>

      {isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            倉庫清單載入失敗，調整與調撥暫時挑不到倉庫
          </AlertDescription>
        </Alert>
      )}

      {item.balances.length === 0 ? (
        <p className="text-muted-foreground">這個物料還沒有任何倉別餘額</p>
      ) : (
        <section
          aria-label="各倉餘額"
          className="overflow-x-auto rounded-lg border"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>倉庫</TableHead>
                <TableHead className="text-right">數量</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {item.balances.map((b) => (
                <TableRow key={b.warehouse_id}>
                  <TableCell>
                    {b.warehouse_name || "—"}
                    {b.warehouse_code && (
                      <span className="ml-2 font-mono text-muted-foreground">
                        {b.warehouse_code}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQty(b.qty)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      <p className="text-sm text-muted-foreground">
        倉庫要新增或改名到{" "}
        <Link
          to="/warehouses"
          className="text-primary underline underline-offset-4"
        >
          倉庫
        </Link>
        。
      </p>
    </div>
  )
}
