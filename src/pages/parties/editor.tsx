import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useNavigate, useParams } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import {
  createParty,
  erpKeys,
  formatAliases,
  getParty,
  parseAliases,
  updateParty,
  type PartyCreate,
  type PartyDetail,
  type PartyUpdate,
} from "@/lib/erp"

interface FormState {
  name: string
  shortName: string
  aliases: string
  isSupplier: boolean
  isCustomer: boolean
  taxId: string
  industry: string
  paymentTerms: string
  notes: string
  // 只有新增時用得到：後端 PartyCreate 可以一次帶聯絡人與地址
  contactName: string
  contactTitle: string
  contactPhone: string
  contactMobile: string
  contactEmail: string
  addressLabel: string
  address: string
  addressCity: string
}

const DEFAULT_FORM: FormState = {
  name: "", shortName: "", aliases: "", isSupplier: false, isCustomer: false,
  taxId: "", industry: "", paymentTerms: "", notes: "",
  contactName: "", contactTitle: "", contactPhone: "", contactMobile: "", contactEmail: "",
  addressLabel: "", address: "", addressCity: "",
}

function formFromParty(p: PartyDetail): FormState {
  return {
    ...DEFAULT_FORM,
    name: p.name,
    shortName: p.short_name ?? "",
    aliases: formatAliases(p.aliases),
    isSupplier: p.is_supplier,
    isCustomer: p.is_customer,
    taxId: p.tax_id ?? "",
    industry: p.industry ?? "",
    paymentTerms: p.payment_terms ?? "",
    notes: p.notes ?? "",
  }
}

export default function PartyEditorPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)

  const detailQuery = useQuery({
    queryKey: erpKeys.partyDetail(id ?? ""),
    queryFn: () => getParty(id!),
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
      initial={isEdit ? formFromParty(detailQuery.data!) : DEFAULT_FORM}
    />
  )
}

function EditorForm({ id, isEdit, initial }: { id: string | undefined; isEdit: boolean; initial: FormState }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState<FormState>(initial)

  const createMutation = useMutation({
    mutationFn: (data: PartyCreate) => createParty(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: erpKeys.parties })
      navigate(`/parties/${created.id}`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: PartyUpdate) => updateParty(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: erpKeys.parties })
      navigate(`/parties/${id}`)
    },
  })

  const isSaving = createMutation.isPending || updateMutation.isPending
  const saveError = createMutation.error ?? updateMutation.error

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    const payload: PartyCreate = {
      name: form.name.trim(),
      short_name: form.shortName.trim() || null,
      aliases: parseAliases(form.aliases),
      is_supplier: form.isSupplier,
      is_customer: form.isCustomer,
      tax_id: form.taxId.trim() || null,
      industry: form.industry.trim() || null,
      payment_terms: form.paymentTerms.trim() || null,
      notes: form.notes.trim() || null,
    }
    if (isEdit) {
      updateMutation.mutate(payload)
      return
    }
    // 新增時一併帶一筆主要聯絡人與地址；沒填就不送那個鍵
    if (form.contactName.trim()) {
      payload.contacts = [
        {
          name: form.contactName.trim(),
          title: form.contactTitle.trim() || null,
          phone: form.contactPhone.trim() || null,
          mobile: form.contactMobile.trim() || null,
          email: form.contactEmail.trim() || null,
          is_primary: true,
        },
      ]
    }
    if (form.address.trim()) {
      payload.addresses = [
        {
          address: form.address.trim(),
          label: form.addressLabel.trim() || null,
          city: form.addressCity.trim() || null,
          is_primary: true,
        },
      ]
    }
    createMutation.mutate(payload)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{isEdit ? "編輯往來對象" : "新增往來對象"}</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="party-name">名稱</Label>
          <Input id="party-name" required value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="party-short-name">簡稱</Label>
            <Input id="party-short-name" value={form.shortName} onChange={(e) => set("shortName", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="party-aliases">別名</Label>
            <Input
              id="party-aliases"
              placeholder="以逗號分隔"
              value={form.aliases}
              onChange={(e) => set("aliases", e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <Switch id="party-is-supplier" checked={form.isSupplier} onCheckedChange={(v) => set("isSupplier", v)} />
            <Label htmlFor="party-is-supplier">供應商</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="party-is-customer" checked={form.isCustomer} onCheckedChange={(v) => set("isCustomer", v)} />
            <Label htmlFor="party-is-customer">客戶</Label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="party-tax-id">統一編號</Label>
            <Input id="party-tax-id" value={form.taxId} onChange={(e) => set("taxId", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="party-industry">產業</Label>
            <Input id="party-industry" value={form.industry} onChange={(e) => set("industry", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="party-payment-terms">付款條件</Label>
            <Input
              id="party-payment-terms"
              value={form.paymentTerms}
              onChange={(e) => set("paymentTerms", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="party-notes">備註</Label>
          <Textarea id="party-notes" rows={5} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>

        {/* 編輯時聯絡人與地址在明細分頁維護，這裡不重複開一份 */}
        {!isEdit && (
          <>
            <section className="space-y-4 rounded-lg border p-4">
              <h2 className="text-sm font-medium">主要聯絡人（可留空）</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="party-contact-name">聯絡人姓名</Label>
                  <Input
                    id="party-contact-name"
                    value={form.contactName}
                    onChange={(e) => set("contactName", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="party-contact-title">聯絡人職稱</Label>
                  <Input
                    id="party-contact-title"
                    value={form.contactTitle}
                    onChange={(e) => set("contactTitle", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="party-contact-phone">聯絡人電話</Label>
                  <Input
                    id="party-contact-phone"
                    value={form.contactPhone}
                    onChange={(e) => set("contactPhone", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="party-contact-mobile">聯絡人手機</Label>
                  <Input
                    id="party-contact-mobile"
                    value={form.contactMobile}
                    onChange={(e) => set("contactMobile", e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="party-contact-email">聯絡人 Email</Label>
                  <Input
                    id="party-contact-email"
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) => set("contactEmail", e.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-lg border p-4">
              <h2 className="text-sm font-medium">主要地址（可留空）</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="party-address-label">標籤</Label>
                  <Input
                    id="party-address-label"
                    value={form.addressLabel}
                    onChange={(e) => set("addressLabel", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="party-address-city">城市</Label>
                  <Input
                    id="party-address-city"
                    value={form.addressCity}
                    onChange={(e) => set("addressCity", e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor="party-address">地址</Label>
                  <Input id="party-address" value={form.address} onChange={(e) => set("address", e.target.value)} />
                </div>
              </div>
            </section>
          </>
        )}

        {saveError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{saveError instanceof ApiError ? saveError.detail : "儲存失敗，請稍後再試"}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "儲存中…" : "儲存"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(isEdit ? `/parties/${id}` : "/parties")}>
            取消
          </Button>
        </div>
      </form>
    </div>
  )
}
