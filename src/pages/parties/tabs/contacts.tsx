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
import { addPartyContact, erpKeys, type PartyDetail } from "@/lib/erp"

function AddContactDialog({ party }: { party: PartyDetail }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [title, setTitle] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [mobile, setMobile] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [isPrimary, setIsPrimary] = React.useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      addPartyContact(party.id, {
        name: name.trim(),
        title: title.trim() || null,
        phone: phone.trim() || null,
        mobile: mobile.trim() || null,
        email: email.trim() || null,
        is_primary: isPrimary,
      }),
    onSuccess: () => {
      // 後端只回 contact_id 與 audit_id，不回建好的那筆，所以重抓明細
      queryClient.invalidateQueries({ queryKey: erpKeys.partyDetail(party.id) })
      setOpen(false)
      setName("")
      setTitle("")
      setPhone("")
      setMobile("")
      setEmail("")
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
          新增聯絡人
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增聯絡人</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            mutation.mutate()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact-name">姓名</Label>
              <Input id="contact-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-title">職稱</Label>
              <Input id="contact-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-phone">電話</Label>
              <Input id="contact-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-mobile">手機</Label>
              <Input id="contact-mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="contact-is-primary" checked={isPrimary} onCheckedChange={setIsPrimary} />
            <Label htmlFor="contact-is-primary">設為主要聯絡人</Label>
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

export default function ContactsTab({ party }: { party: PartyDetail }) {
  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">共 {party.contacts.length} 位聯絡人</p>
        <AddContactDialog party={party} />
      </div>

      {party.contacts.length === 0 ? (
        <p className="text-muted-foreground">還沒有聯絡人</p>
      ) : (
        <ul className="space-y-2">
          {party.contacts.map((c) => (
            <li key={c.id} className="space-y-1 rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.name}</span>
                {c.title && <span className="text-muted-foreground">{c.title}</span>}
                {c.is_primary && <Badge variant="tint">主要</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                <span>電話 {c.phone || "—"}</span>
                <span>手機 {c.mobile || "—"}</span>
                <span>{c.email || "—"}</span>
              </div>
              {c.notes && <p className="text-muted-foreground">{c.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
