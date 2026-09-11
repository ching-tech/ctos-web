import { useMutation, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ApiError } from "@/lib/api"
import {
  addPartyAddress,
  deletePartyAddress,
  erpKeys,
  updatePartyAddress,
  type PartyAddress,
  type PartyDetail,
} from "@/lib/erp"

interface AddressForm {
  label: string
  address: string
  city: string
  isPrimary: boolean
}

const EMPTY_FORM: AddressForm = { label: "", address: "", city: "", isPrimary: false }

function formFromAddress(a: PartyAddress): AddressForm {
  return { label: a.label ?? "", address: a.address, city: a.city ?? "", isPrimary: a.is_primary }
}

/** 新增與編輯共用同一張表單；差別只在送 POST 還是 PUT。 */
function AddressDialog({
  party,
  address,
  trigger,
}: {
  party: PartyDetail
  address?: PartyAddress
  trigger: React.ReactNode
}) {
  const isEdit = Boolean(address)
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<AddressForm>(address ? formFromAddress(address) : EMPTY_FORM)

  const mutation = useMutation({
    // 回應不用（POST 只回 id、PUT 只回那一筆），成功後一律重抓明細，所以收斂成 void
    mutationFn: async () => {
      const payload = {
        address: form.address.trim(),
        label: form.label.trim() || null,
        city: form.city.trim() || null,
        is_primary: form.isPrimary,
      }
      if (isEdit) await updatePartyAddress(party.id, address!.id, payload)
      else await addPartyAddress(party.id, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: erpKeys.partyDetail(party.id) })
      setOpen(false)
    },
  })

  function set<K extends keyof AddressForm>(key: K, value: AddressForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) mutation.reset()
        if (v) setForm(address ? formFromAddress(address) : EMPTY_FORM)
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "編輯地址" : "新增地址"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!form.address.trim()) return
            mutation.mutate()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="address-label">標籤</Label>
              <Input id="address-label" value={form.label} onChange={(e) => set("label", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address-city">城市</Label>
              <Input id="address-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address-address">地址</Label>
              <Input
                id="address-address"
                required
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="address-is-primary" checked={form.isPrimary} onCheckedChange={(v) => set("isPrimary", v)} />
            <Label htmlFor="address-is-primary">設為主要地址</Label>
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

function AddressRow({ party, address }: { party: PartyDetail; address: PartyAddress }) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: erpKeys.partyDetail(party.id) })

  const primaryMutation = useMutation({
    mutationFn: () => updatePartyAddress(party.id, address.id, { is_primary: true }),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({
    mutationFn: () => deletePartyAddress(party.id, address.id),
    onSuccess: invalidate,
  })
  const error = primaryMutation.error ?? deleteMutation.error

  return (
    <li className="space-y-1 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {address.label && <span className="font-medium">{address.label}</span>}
          {address.is_primary && <Badge variant="tint">主要</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {!address.is_primary && (
            <Button variant="ghost" size="sm" disabled={primaryMutation.isPending} onClick={() => primaryMutation.mutate()}>
              設為主要
            </Button>
          )}
          <AddressDialog
            party={party}
            address={address}
            trigger={
              <Button variant="ghost" size="sm">
                編輯
              </Button>
            }
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm">
                刪除
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>確定刪除這筆地址？</AlertDialogTitle>
                <AlertDialogDescription>刪除之後不會自動指派新的主要地址。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()}>確定</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <p>
        {address.city && <span className="mr-2 text-muted-foreground">{address.city}</span>}
        {address.address}
      </p>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error instanceof ApiError ? error.detail : "操作失敗，請稍後再試"}</AlertDescription>
        </Alert>
      )}
    </li>
  )
}

export default function AddressesTab({ party }: { party: PartyDetail }) {
  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">共 {party.addresses.length} 筆地址</p>
        <AddressDialog
          party={party}
          trigger={
            <Button variant="outline" size="sm">
              新增地址
            </Button>
          }
        />
      </div>

      {party.addresses.length === 0 ? (
        <p className="text-muted-foreground">還沒有地址</p>
      ) : (
        <ul className="space-y-2">
          {party.addresses.map((a) => (
            <AddressRow key={a.id} party={party} address={a} />
          ))}
        </ul>
      )}
    </div>
  )
}
