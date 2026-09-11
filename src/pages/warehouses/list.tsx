import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Link } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import { createWarehouse, erpKeys, listWarehouses, updateWarehouse, type Warehouse } from "@/lib/erp"

interface WarehouseForm {
  code: string
  name: string
}

const EMPTY_FORM: WarehouseForm = { code: "", name: "" }

/** 新增與編輯共用同一張表單；差別只在送 POST 還是 PUT。 */
function WarehouseDialog({ warehouse, trigger }: { warehouse?: Warehouse; trigger: React.ReactNode }) {
  const isEdit = Boolean(warehouse)
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<WarehouseForm>(
    warehouse ? { code: warehouse.code, name: warehouse.name } : EMPTY_FORM,
  )

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = { code: form.code.trim(), name: form.name.trim() }
      if (isEdit) await updateWarehouse(warehouse!.id, payload)
      else await createWarehouse(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: erpKeys.warehouses })
      // 倉庫名稱印在物料明細的餘額表上，改完要一起失效
      queryClient.invalidateQueries({ queryKey: erpKeys.items })
      setOpen(false)
    },
  })

  function set<K extends keyof WarehouseForm>(key: K, value: WarehouseForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) mutation.reset()
        // 每次開啟都從目前資料重來，不要留上一次沒送出的草稿
        if (v) setForm(warehouse ? { code: warehouse.code, name: warehouse.name } : EMPTY_FORM)
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "編輯倉庫" : "新增倉庫"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!form.code.trim() || !form.name.trim()) return
            mutation.mutate()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="warehouse-code">代碼</Label>
              <Input id="warehouse-code" required value={form.code} onChange={(e) => set("code", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="warehouse-name">名稱</Label>
              <Input id="warehouse-name" required value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
          </div>

          {mutation.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {mutation.error instanceof ApiError ? mutation.error.detail : "儲存失敗，請稍後再試"}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {isEdit ? "儲存" : "新增"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** 倉庫不佔側邊欄，從物料清單的「倉庫」按鈕進來。 */
export default function WarehouseListPage() {
  const query = useQuery({ queryKey: erpKeys.warehouseList, queryFn: () => listWarehouses() })
  const warehouses = query.data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link to="/items" className="text-sm text-primary underline-offset-4 hover:underline">
          回物料清單
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">倉庫</h1>
          <WarehouseDialog trigger={<Button>新增倉庫</Button>} />
        </div>
      </div>

      {query.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{query.error instanceof ApiError ? query.error.detail : "載入失敗，請稍後再試"}</AlertDescription>
        </Alert>
      ) : query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : warehouses.length === 0 ? (
        <p className="text-muted-foreground">還沒有倉庫</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>代碼</TableHead>
                <TableHead>名稱</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouses.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-mono">{w.code}</TableCell>
                  <TableCell>{w.name}</TableCell>
                  <TableCell className="text-right">
                    <WarehouseDialog
                      warehouse={w}
                      trigger={
                        <Button variant="ghost" size="sm">
                          編輯
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
