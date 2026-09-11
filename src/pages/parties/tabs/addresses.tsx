import { useMutation, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ApiError } from "@/lib/api"
import { addPartyAddress, erpKeys, type PartyDetail } from "@/lib/erp"

function AddAddressDialog({ party }: { party: PartyDetail }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [label, setLabel] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [city, setCity] = React.useState("")
  const [isPrimary, setIsPrimary] = React.useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      addPartyAddress(party.id, {
        address: address.trim(),
        label: label.trim() || null,
        city: city.trim() || null,
        is_primary: isPrimary,
      }),
    onSuccess: () => {
      // 後端只回 address_id 與 audit_id，不回建好的那筆，所以重抓明細
      queryClient.invalidateQueries({ queryKey: erpKeys.partyDetail(party.id) })
      setOpen(false)
      setLabel("")
      setAddress("")
      setCity("")
      setIsPrimary(false)
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) mutation.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          新增地址
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增地址</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!address.trim()) return
            mutation.mutate()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="address-label">標籤</Label>
              <Input id="address-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address-city">城市</Label>
              <Input id="address-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address-address">地址</Label>
              <Input id="address-address" required value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="address-is-primary" checked={isPrimary} onCheckedChange={setIsPrimary} />
            <Label htmlFor="address-is-primary">設為主要地址</Label>
          </div>

          {mutation.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {mutation.error instanceof ApiError ? mutation.error.detail : "新增失敗，請稍後再試"}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              新增
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function AddressesTab({ party }: { party: PartyDetail }) {
  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">共 {party.addresses.length} 筆地址</p>
        <AddAddressDialog party={party} />
      </div>

      {party.addresses.length === 0 ? (
        <p className="text-muted-foreground">還沒有地址</p>
      ) : (
        <ul className="space-y-2">
          {party.addresses.map((a) => (
            <li key={a.id} className="space-y-1 rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {a.label && <span className="font-medium">{a.label}</span>}
                {a.is_primary && <Badge variant="tint">主要</Badge>}
              </div>
              <p>
                {a.city && <span className="mr-2 text-muted-foreground">{a.city}</span>}
                {a.address}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
