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
  addPartyContact,
  deletePartyContact,
  erpKeys,
  updatePartyContact,
  type PartyContact,
  type PartyDetail,
} from "@/lib/erp"

interface ContactForm {
  name: string
  title: string
  phone: string
  mobile: string
  email: string
  isPrimary: boolean
}

const EMPTY_FORM: ContactForm = { name: "", title: "", phone: "", mobile: "", email: "", isPrimary: false }

function formFromContact(c: PartyContact): ContactForm {
  return {
    name: c.name,
    title: c.title ?? "",
    phone: c.phone ?? "",
    mobile: c.mobile ?? "",
    email: c.email ?? "",
    isPrimary: c.is_primary,
  }
}

/** 新增與編輯共用同一張表單；差別只在送 POST 還是 PUT。 */
function ContactDialog({
  party,
  contact,
  trigger,
}: {
  party: PartyDetail
  contact?: PartyContact
  trigger: React.ReactNode
}) {
  const isEdit = Boolean(contact)
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<ContactForm>(contact ? formFromContact(contact) : EMPTY_FORM)

  const mutation = useMutation({
    // 回應不用（POST 只回 id、PUT 只回那一筆），成功後一律重抓明細，所以收斂成 void
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        title: form.title.trim() || null,
        phone: form.phone.trim() || null,
        mobile: form.mobile.trim() || null,
        email: form.email.trim() || null,
        is_primary: form.isPrimary,
      }
      if (isEdit) await updatePartyContact(party.id, contact!.id, payload)
      else await addPartyContact(party.id, payload)
    },
    onSuccess: () => {
      // 子資源的寫入一律重抓明細（POST 只回 id，PUT 只回那一筆，都不含降級後的其他筆）
      queryClient.invalidateQueries({ queryKey: erpKeys.partyDetail(party.id) })
      setOpen(false)
    },
  })

  function set<K extends keyof ContactForm>(key: K, value: ContactForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) mutation.reset()
        // 每次開啟都從目前資料重來，不要留上一次沒送出的草稿
        if (v) setForm(contact ? formFromContact(contact) : EMPTY_FORM)
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "編輯聯絡人" : "新增聯絡人"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!form.name.trim()) return
            mutation.mutate()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact-name">姓名</Label>
              <Input id="contact-name" required value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-title">職稱</Label>
              <Input id="contact-title" value={form.title} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-phone">電話</Label>
              <Input id="contact-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-mobile">手機</Label>
              <Input id="contact-mobile" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input id="contact-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="contact-is-primary" checked={form.isPrimary} onCheckedChange={(v) => set("isPrimary", v)} />
            <Label htmlFor="contact-is-primary">設為主要聯絡人</Label>
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

function ContactRow({ party, contact }: { party: PartyDetail; contact: PartyContact }) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: erpKeys.partyDetail(party.id) })

  const primaryMutation = useMutation({
    mutationFn: () => updatePartyContact(party.id, contact.id, { is_primary: true }),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({
    mutationFn: () => deletePartyContact(party.id, contact.id),
    onSuccess: invalidate,
  })
  const error = primaryMutation.error ?? deleteMutation.error

  return (
    <li className="space-y-1 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{contact.name}</span>
          {contact.title && <span className="text-muted-foreground">{contact.title}</span>}
          {contact.is_primary && <Badge variant="tint">主要</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {!contact.is_primary && (
            <Button variant="ghost" size="sm" disabled={primaryMutation.isPending} onClick={() => primaryMutation.mutate()}>
              設為主要
            </Button>
          )}
          <ContactDialog
            party={party}
            contact={contact}
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
                <AlertDialogTitle>確定刪除這位聯絡人？</AlertDialogTitle>
                <AlertDialogDescription>
                  刪除「{contact.name}」之後不會自動指派新的主要聯絡人。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()}>確定</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
        <span>電話 {contact.phone || "—"}</span>
        <span>手機 {contact.mobile || "—"}</span>
        <span>{contact.email || "—"}</span>
      </div>
      {contact.notes && <p className="text-muted-foreground">{contact.notes}</p>}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error instanceof ApiError ? error.detail : "操作失敗，請稍後再試"}</AlertDescription>
        </Alert>
      )}
    </li>
  )
}

export default function ContactsTab({ party }: { party: PartyDetail }) {
  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">共 {party.contacts.length} 位聯絡人</p>
        <ContactDialog
          party={party}
          trigger={
            <Button variant="outline" size="sm">
              新增聯絡人
            </Button>
          }
        />
      </div>

      {party.contacts.length === 0 ? (
        <p className="text-muted-foreground">還沒有聯絡人</p>
      ) : (
        <ul className="space-y-2">
          {party.contacts.map((c) => (
            <ContactRow key={c.id} party={party} contact={c} />
          ))}
        </ul>
      )}
    </div>
  )
}
