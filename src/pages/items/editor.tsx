import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useNavigate, useParams } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import {
  createItem,
  erpKeys,
  formatAliases,
  getItem,
  listParties,
  parseAliases,
  SUPPLIER_PAGE_SIZE,
  updateItem,
  type ItemCreate,
  type ItemDetail,
  type ItemUpdate,
  type PartyFilters,
} from "@/lib/erp"

const NO_SUPPLIER = "none"

// 供應商下拉吃往來對象清單的 role=supplier（後端 list_parties 的 query 是 role，
// 沒有 is_supplier 這個參數）。要 vendor-management 權限，拿不到就停用下拉。
const SUPPLIER_FILTERS: PartyFilters = { role: "supplier", page: 1, pageSize: SUPPLIER_PAGE_SIZE }

interface FormState {
  code: string
  name: string
  spec: string
  unit: string
  itemGroup: string
  supplierId: string
  purchasePrice: string
  leadDays: string
  aliases: string
  notes: string
}

const DEFAULT_FORM: FormState = {
  code: "", name: "", spec: "", unit: "", itemGroup: "",
  supplierId: NO_SUPPLIER, purchasePrice: "", leadDays: "", aliases: "", notes: "",
}

function formFromItem(it: ItemDetail): FormState {
  return {
    code: it.code,
    name: it.name,
    spec: it.spec ?? "",
    unit: it.unit ?? "",
    itemGroup: it.item_group ?? "",
    supplierId: it.default_supplier_id ?? NO_SUPPLIER,
    // 去掉尾端 .0000（Numeric(14,4) 序列化出來的零尾數），不套千分位免得送回去變 NaN
    purchasePrice: it.purchase_price === null ? "" : String(Number(it.purchase_price)),
    leadDays: it.lead_days === null ? "" : String(it.lead_days),
    aliases: formatAliases(it.aliases),
    notes: it.notes ?? "",
  }
}

export default function ItemEditorPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)

  const detailQuery = useQuery({
    queryKey: erpKeys.itemDetail(id ?? ""),
    queryFn: () => getItem(id!),
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

  return (
    <EditorForm
      key={isEdit ? detailQuery.data!.id : "new"}
      id={id}
      isEdit={isEdit}
      initial={isEdit ? formFromItem(detailQuery.data!) : DEFAULT_FORM}
      supplierName={isEdit ? detailQuery.data!.default_supplier_name : null}
    />
  )
}

function EditorForm({
  id,
  isEdit,
  initial,
  supplierName,
}: {
  id: string | undefined
  isEdit: boolean
  initial: FormState
  supplierName: string | null
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState<FormState>(initial)

  const suppliersQuery = useQuery({
    queryKey: erpKeys.partyList(SUPPLIER_FILTERS),
    queryFn: () => listParties(SUPPLIER_FILTERS),
    retry: false,
  })
  const suppliers = suppliersQuery.data?.items ?? []
  // 沒有 vendor-management 權限時清單會 403；已經選好的那筆還是要看得到名字
  const missingCurrent =
    form.supplierId !== NO_SUPPLIER && supplierName && !suppliers.some((p) => p.id === form.supplierId)

  const createMutation = useMutation({
    mutationFn: (data: ItemCreate) => createItem(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: erpKeys.items })
      navigate(`/items/${created.id}`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: ItemUpdate) => updateItem(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: erpKeys.items })
      navigate(`/items/${id}`)
    },
  })

  const isSaving = createMutation.isPending || updateMutation.isPending
  const saveError = createMutation.error ?? updateMutation.error

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.code.trim() || !form.name.trim()) return
    const leadDays = form.leadDays.trim()
    const payload: ItemCreate = {
      code: form.code.trim(),
      name: form.name.trim(),
      spec: form.spec.trim() || null,
      unit: form.unit.trim() || null,
      item_group: form.itemGroup.trim() || null,
      default_supplier_id: form.supplierId === NO_SUPPLIER ? null : form.supplierId,
      // Decimal 送字串，後端 pydantic 自己轉；空字串要變 null 不是 0
      purchase_price: form.purchasePrice.trim() || null,
      lead_days: leadDays === "" ? null : Number(leadDays),
      aliases: parseAliases(form.aliases),
      notes: form.notes.trim() || null,
    }
    if (isEdit) updateMutation.mutate(payload)
    else createMutation.mutate(payload)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{isEdit ? "編輯物料" : "新增物料"}</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="item-code">料號</Label>
            <Input id="item-code" required value={form.code} onChange={(e) => set("code", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-name">品名</Label>
            <Input id="item-name" required value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="item-spec">規格</Label>
          <Input id="item-spec" value={form.spec} onChange={(e) => set("spec", e.target.value)} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="item-unit">單位</Label>
            <Input id="item-unit" value={form.unit} onChange={(e) => set("unit", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-group">分類</Label>
            <Input id="item-group" value={form.itemGroup} onChange={(e) => set("itemGroup", e.target.value)} />
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium">預設供應商</span>
            <Select
              value={form.supplierId}
              onValueChange={(v) => set("supplierId", v)}
              disabled={suppliersQuery.isError}
            >
              <SelectTrigger aria-label="預設供應商" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SUPPLIER}>未指定</SelectItem>
                {missingCurrent && <SelectItem value={form.supplierId}>{supplierName}</SelectItem>}
                {suppliers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {suppliersQuery.isError && <p className="text-sm text-muted-foreground">沒有往來對象權限，無法挑供應商</p>}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="item-purchase-price">採購價</Label>
            <Input
              id="item-purchase-price"
              inputMode="decimal"
              value={form.purchasePrice}
              onChange={(e) => set("purchasePrice", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-lead-days">交期天數</Label>
            <Input
              id="item-lead-days"
              inputMode="numeric"
              value={form.leadDays}
              onChange={(e) => set("leadDays", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="item-aliases">別名</Label>
          <Input
            id="item-aliases"
            placeholder="以逗號分隔"
            value={form.aliases}
            onChange={(e) => set("aliases", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="item-notes">備註</Label>
          <Textarea id="item-notes" rows={5} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>

        {saveError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{saveError instanceof ApiError ? saveError.detail : "儲存失敗，請稍後再試"}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "儲存中…" : "儲存"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(isEdit ? `/items/${id}` : "/items")}>
            取消
          </Button>
        </div>
      </form>
    </div>
  )
}
