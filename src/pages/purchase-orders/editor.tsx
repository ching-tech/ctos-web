import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Navigate, useNavigate, useParams } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import {
  canEditPurchaseOrderHeader,
  createPurchaseOrder,
  ERP_OPTIONS_PAGE_SIZE,
  erpKeys,
  getPurchaseOrder,
  listItems,
  listParties,
  PO_EDITABLE_STATUS_OPTIONS,
  PO_STATUS_LABEL,
  SUPPLIER_PAGE_SIZE,
  updatePurchaseOrder,
  type EditablePurchaseOrderStatus,
  type ItemFilters,
  type PartyFilters,
  type PurchaseOrderCreate,
  type PurchaseOrderDetail,
  type PurchaseOrderUpdate,
} from "@/lib/erp"
import { listProjects, projectKeys, type ProjectFilters } from "@/lib/projects"

const NONE = "none"
const SEARCH_DEBOUNCE_MS = 300

const SUPPLIER_FILTERS: PartyFilters = { role: "supplier", page: 1, pageSize: SUPPLIER_PAGE_SIZE }
const PROJECT_FILTERS: ProjectFilters = { page: 1, pageSize: ERP_OPTIONS_PAGE_SIZE }

interface LineDraft {
  key: number
  itemId: string
  /** 挑選當下記下的「料號 品名」：搜尋換了關鍵字時那一列的下拉才不會變空白 */
  itemLabel: string
  description: string
  qty: string
  unitPrice: string
}

interface HeaderForm {
  supplierId: string
  projectId: string
  status: EditablePurchaseOrderStatus
  orderDate: string
  expectedDate: string
  notes: string
}

const DEFAULT_HEADER: HeaderForm = {
  supplierId: NONE,
  projectId: NONE,
  status: "ordered",
  orderDate: "",
  expectedDate: "",
  notes: "",
}

/** 只有 draft／ordered 的單進得來（其餘狀態在下面就被導回明細），狀態照原樣回填。 */
function headerFromDetail(po: PurchaseOrderDetail): HeaderForm {
  return {
    supplierId: po.supplier_id,
    projectId: po.project_id ?? NONE,
    status: po.status === "draft" ? "draft" : "ordered",
    orderDate: po.order_date ?? "",
    expectedDate: po.expected_date ?? "",
    notes: po.notes ?? "",
  }
}

export default function PurchaseOrderEditorPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)

  const detailQuery = useQuery({
    queryKey: erpKeys.poDetail(id ?? ""),
    queryFn: () => getPurchaseOrder(id!),
    enabled: isEdit,
    retry: false,
  })

  if (isEdit && detailQuery.isError) {
    const err = detailQuery.error
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{err instanceof ApiError ? err.detail : "載入失敗，請稍後再試"}</AlertDescription>
      </Alert>
    )
  }

  if (isEdit && !detailQuery.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // partial／received／cancelled 不給進編輯頁：PurchaseOrderUpdate 的 status 只收
  // draft／ordered，表單一送出就會把 partial 壓回 ordered，把已收過一部分這件事抹掉。
  // 直接打網址進來也要擋，不是只把明細上的「編輯」藏起來。
  if (isEdit && !canEditPurchaseOrderHeader(detailQuery.data!.status)) {
    return <Navigate to={`/purchase-orders/${id}`} replace />
  }

  return isEdit ? (
    <HeaderEditor key={detailQuery.data!.id} po={detailQuery.data!} />
  ) : (
    <CreateForm />
  )
}

/** 供應商與專案兩個下拉共用：沒有那把權限時清單會 403，停用下拉並講清楚。 */
function useHeaderOptions() {
  const suppliersQuery = useQuery({
    queryKey: erpKeys.partyList(SUPPLIER_FILTERS),
    queryFn: () => listParties(SUPPLIER_FILTERS),
    retry: false,
  })
  const projectsQuery = useQuery({
    queryKey: projectKeys.list(PROJECT_FILTERS),
    queryFn: () => listProjects(PROJECT_FILTERS),
    retry: false,
  })
  return {
    suppliers: suppliersQuery.data?.items ?? [],
    projects: projectsQuery.data?.items ?? [],
    suppliersError: suppliersQuery.isError,
    projectsError: projectsQuery.isError,
  }
}

function HeaderFields({
  form,
  set,
  withStatus,
  supplierName,
  projectName,
}: {
  form: HeaderForm
  set: <K extends keyof HeaderForm>(key: K, value: HeaderForm[K]) => void
  withStatus: boolean
  supplierName?: string | null
  projectName?: string | null
}) {
  const { suppliers, projects, suppliersError, projectsError } = useHeaderOptions()
  // 沒有權限時清單是空的；已經選好的那筆還是要看得到名字
  const missingSupplier = form.supplierId !== NONE && supplierName && !suppliers.some((p) => p.id === form.supplierId)
  const missingProject = form.projectId !== NONE && projectName && !projects.some((p) => p.id === form.projectId)

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <span className="text-sm font-medium">供應商</span>
          <Select value={form.supplierId} onValueChange={(v) => set("supplierId", v)} disabled={suppliersError}>
            <SelectTrigger aria-label="供應商" className="w-full">
              <SelectValue placeholder="請選擇" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>請選擇</SelectItem>
              {missingSupplier && <SelectItem value={form.supplierId}>{supplierName}</SelectItem>}
              {suppliers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {suppliersError && <p className="text-sm text-muted-foreground">沒有往來對象權限，無法挑供應商</p>}
        </div>
        <div className="space-y-2">
          <span className="text-sm font-medium">專案</span>
          <Select value={form.projectId} onValueChange={(v) => set("projectId", v)} disabled={projectsError}>
            <SelectTrigger aria-label="專案" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>未指定</SelectItem>
              {missingProject && <SelectItem value={form.projectId}>{projectName}</SelectItem>}
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {projectsError && <p className="text-sm text-muted-foreground">沒有專案權限，無法挑專案</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="po-order-date">下單日</Label>
          <Input id="po-order-date" type="date" value={form.orderDate} onChange={(e) => set("orderDate", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="po-expected-date">預計到貨</Label>
          <Input
            id="po-expected-date"
            type="date"
            value={form.expectedDate}
            onChange={(e) => set("expectedDate", e.target.value)}
          />
        </div>
        {withStatus && (
          <div className="space-y-2">
            <span className="text-sm font-medium">狀態</span>
            {/* models/erp.py 的 EditablePurchaseOrderStatus：只收草稿與已下單 */}
            <Select value={form.status} onValueChange={(v) => set("status", v as EditablePurchaseOrderStatus)}>
              <SelectTrigger aria-label="狀態" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PO_EDITABLE_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {PO_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="po-notes">備註</Label>
        <Textarea id="po-notes" rows={4} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
    </>
  )
}

/** 編輯只改單頭：行項不在 PurchaseOrderUpdate 裡，後端沒有改行項的端點。 */
function HeaderEditor({ po }: { po: PurchaseOrderDetail }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState<HeaderForm>(headerFromDetail(po))
  // 路由已經擋掉非 draft／ordered 的單；這裡再守一次，免得將來有人繞過那道 guard
  const statusEditable = canEditPurchaseOrderHeader(po.status)

  const mutation = useMutation({
    mutationFn: (data: PurchaseOrderUpdate) => updatePurchaseOrder(po.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: erpKeys.purchaseOrders })
      navigate(`/purchase-orders/${po.id}`)
    },
  })

  function set<K extends keyof HeaderForm>(key: K, value: HeaderForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">編輯採購單 {po.po_no}</h1>
      <p className="text-sm text-muted-foreground">行項不能在這裡改：後端的更新端點只收單頭欄位。</p>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (form.supplierId === NONE) return
          mutation.mutate({
            supplier_id: form.supplierId,
            project_id: form.projectId === NONE ? null : form.projectId,
            // 原狀態不是 draft／ordered 時整個省略 status：後端是 exclude_unset，
            // 不送等於不動狀態，送了才會把它壓成表單上那個值
            ...(statusEditable ? { status: form.status } : {}),
            order_date: form.orderDate || null,
            expected_date: form.expectedDate || null,
            notes: form.notes.trim() || null,
          })
        }}
      >
        <HeaderFields
          form={form}
          set={set}
          withStatus={statusEditable}
          supplierName={po.supplier_name}
          projectName={po.project_name}
        />

        {mutation.isError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {mutation.error instanceof ApiError ? mutation.error.detail : "儲存失敗，請稍後再試"}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={form.supplierId === NONE || mutation.isPending}>
            {mutation.isPending ? "儲存中…" : "儲存"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(`/purchase-orders/${po.id}`)}>
            取消
          </Button>
        </div>
      </form>
    </div>
  )
}

function CreateForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState<HeaderForm>(DEFAULT_HEADER)
  const [lines, setLines] = React.useState<LineDraft[]>([
    { key: 1, itemId: NONE, itemLabel: "", description: "", qty: "", unitPrice: "" },
  ])
  const nextKey = React.useRef(2)

  // 物料下拉的搜尋：後端 list_items 的 q 是 ILIKE 料號／品名／規格／別名
  const [draftQ, setDraftQ] = React.useState("")
  const [itemQ, setItemQ] = React.useState("")
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const itemFilters: ItemFilters = { q: itemQ || undefined, page: 1, pageSize: ERP_OPTIONS_PAGE_SIZE }
  const itemsQuery = useQuery({ queryKey: erpKeys.itemList(itemFilters), queryFn: () => listItems(itemFilters), retry: false })
  const items = itemsQuery.data?.items ?? []

  const mutation = useMutation({
    mutationFn: (data: PurchaseOrderCreate) => createPurchaseOrder(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: erpKeys.purchaseOrders })
      navigate(`/purchase-orders/${created.id}`)
    },
  })

  function set<K extends keyof HeaderForm>(key: K, value: HeaderForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function setLine(key: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function onSearchChange(value: string) {
    setDraftQ(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setItemQ(value), SEARCH_DEBOUNCE_MS)
  }

  // 後端 create_purchase_order：至少一行、每行都要有物料、數量要大於 0
  const validLines = lines.filter((l) => l.itemId !== NONE && Number(l.qty) > 0)
  const canSubmit = form.supplierId !== NONE && validLines.length > 0 && validLines.length === lines.length

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">新增採購單</h1>
      <p className="text-sm text-muted-foreground">單號由後端在同一筆交易內產生（PO-YYYYMM-NNN），不用自己填。</p>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!canSubmit) return
          mutation.mutate({
            supplier_id: form.supplierId,
            project_id: form.projectId === NONE ? null : form.projectId,
            order_date: form.orderDate || null,
            expected_date: form.expectedDate || null,
            notes: form.notes.trim() || null,
            lines: lines.map((l) => ({
              item_id: l.itemId,
              // Decimal 送字串，後端 pydantic 自己轉
              qty: l.qty.trim(),
              unit_price: l.unitPrice.trim() || null,
              description: l.description.trim() || null,
            })),
          })
        }}
      >
        <HeaderFields form={form} set={set} withStatus={false} />

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">行項</h2>
            <Input
              aria-label="搜尋物料"
              placeholder="搜尋料號、品名、規格、別名"
              className="w-full sm:w-64"
              value={draftQ}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          {itemsQuery.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>物料清單載入失敗，暫時挑不到物料</AlertDescription>
            </Alert>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-48">物料</TableHead>
                  <TableHead className="min-w-32">描述</TableHead>
                  <TableHead className="min-w-24">數量</TableHead>
                  <TableHead className="min-w-24">單價</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, index) => (
                  <TableRow key={line.key}>
                    <TableCell>
                      <Select
                        value={line.itemId}
                        onValueChange={(v) =>
                          setLine(line.key, {
                            itemId: v,
                            itemLabel: (() => {
                              const it = items.find((i) => i.id === v)
                              return it ? `${it.code} ${it.name}` : ""
                            })(),
                          })
                        }
                      >
                        <SelectTrigger aria-label={`物料第 ${index + 1} 列`} className="w-full">
                          <SelectValue placeholder="請選擇" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>請選擇</SelectItem>
                          {/* 搜尋把已經挑好的那筆濾掉時，用挑選當下記下的名字補一個選項 */}
                          {line.itemId !== NONE && !items.some((it) => it.id === line.itemId) && (
                            <SelectItem value={line.itemId}>{line.itemLabel || line.itemId}</SelectItem>
                          )}
                          {items.map((it) => (
                            <SelectItem key={it.id} value={it.id}>
                              {it.code} {it.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`描述第 ${index + 1} 列`}
                        value={line.description}
                        onChange={(e) => setLine(line.key, { description: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`數量第 ${index + 1} 列`}
                        inputMode="decimal"
                        value={line.qty}
                        onChange={(e) => setLine(line.key, { qty: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`單價第 ${index + 1} 列`}
                        inputMode="decimal"
                        value={line.unitPrice}
                        onChange={(e) => setLine(line.key, { unitPrice: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`移除第 ${index + 1} 列`}
                        onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                      >
                        移除
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const key = nextKey.current
              nextKey.current += 1
              setLines((ls) => [...ls, { key, itemId: NONE, itemLabel: "", description: "", qty: "", unitPrice: "" }])
            }}
          >
            新增行項
          </Button>
        </div>

        {mutation.isError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {mutation.error instanceof ApiError ? mutation.error.detail : "建立失敗，請稍後再試"}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-2">
          {/* 沒挑供應商或行項不完整就送出，後端只會回 400／422，擋在這裡比較快 */}
          <Button type="submit" disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? "建立中…" : "建立採購單"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/purchase-orders")}>
            取消
          </Button>
        </div>
      </form>
    </div>
  )
}
