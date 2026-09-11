import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useNavigate } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ApiError } from "@/lib/api"
import { erpKeys, listParties, mergeParties, type PartyDetail } from "@/lib/erp"

type KeepSide = "this" | "other"

/**
 * 合併：把 drop 的聯絡人、地址、採購單搬到 keep，drop 軟刪除，drop 的名稱與別名
 * 併進 keep 的 aliases。送 POST /api/parties/merge，body 是 {keep_id, drop_id}。
 */
export function MergePartyDialog({ party }: { party: PartyDetail }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState("")
  const [otherId, setOtherId] = React.useState("")
  const [keep, setKeep] = React.useState<KeepSide>("this")

  const filters = { q: q.trim() || undefined, page: 1 }
  const listQuery = useQuery({
    queryKey: erpKeys.partyList(filters),
    queryFn: () => listParties(filters),
    enabled: open,
  })
  const candidates = (listQuery.data?.items ?? []).filter((p) => p.id !== party.id)
  const other = candidates.find((p) => p.id === otherId)

  const mutation = useMutation({
    mutationFn: () =>
      mergeParties(
        keep === "this" ? { keep_id: party.id, drop_id: otherId } : { keep_id: otherId, drop_id: party.id },
      ),
    onSuccess: (merged) => {
      queryClient.invalidateQueries({ queryKey: erpKeys.parties })
      setOpen(false)
      navigate(`/parties/${merged.id}`)
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) {
          mutation.reset()
          setQ("")
          setOtherId("")
          setKeep("this")
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">合併</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>合併往來對象</DialogTitle>
          <DialogDescription>
            被併入的那筆會軟刪除，它的聯絡人、地址與採購單搬到保留的那筆，名稱與別名也會併進去。
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!otherId) return
            mutation.mutate()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="merge-search">搜尋往來對象</Label>
            <Input
              id="merge-search"
              placeholder="搜尋名稱、簡稱、別名與統一編號"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">要合併的往來對象</span>
            <Select value={otherId} onValueChange={setOtherId}>
              <SelectTrigger aria-label="要合併的往來對象" className="w-full">
                <SelectValue placeholder="請選擇" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {listQuery.data && candidates.length === 0 && <p className="text-sm text-muted-foreground">沒有其他往來對象</p>}
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">保留哪一筆</span>
            <RadioGroup value={keep} onValueChange={(v) => setKeep(v as KeepSide)}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="this" id="merge-keep-this" />
                <Label htmlFor="merge-keep-this">保留這筆「{party.name}」</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="other" id="merge-keep-other" />
                <Label htmlFor="merge-keep-other">保留選到的那筆{other ? `「${other.name}」` : ""}</Label>
              </div>
            </RadioGroup>
          </div>

          {mutation.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {mutation.error instanceof ApiError ? mutation.error.detail : "合併失敗，請稍後再試"}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" disabled={!otherId || mutation.isPending}>
              合併
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
