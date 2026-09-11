import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useSearchParams } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pagination } from "@/components/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import { blockUser, botKeys, listUsersWithBinding, platformLabel, type BotUser, type ListFilter, type Platform } from "@/lib/bot"

const PAGE_SIZE = 20

function UserAvatar({ pictureUrl, name }: { pictureUrl: string | null; name: string }) {
  if (pictureUrl) {
    return <img src={pictureUrl} alt="" className="size-8 shrink-0 rounded-full object-cover" />
  }
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
      {name.slice(0, 1)}
    </div>
  )
}

function BlockDialog({ user, open, onOpenChange }: { user: BotUser; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = React.useState("")

  const mutation = useMutation({
    mutationFn: () => blockUser(user.id, reason || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...botKeys.all, "users"] })
      queryClient.invalidateQueries({ queryKey: [...botKeys.all, "blocked"] })
      onOpenChange(false)
    },
  })

  function handleOpenChange(next: boolean) {
    if (!next) {
      setReason("")
      mutation.reset()
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>封鎖使用者</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="block-reason">封鎖原因（選填）</Label>
            <Input id="block-reason" aria-label="封鎖原因" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          {mutation.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {mutation.error instanceof ApiError ? mutation.error.detail : "封鎖失敗，請稍後再試"}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            確定封鎖
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BlockAction({ user }: { user: BotUser }) {
  const [open, setOpen] = React.useState(false)

  if (user.is_blocked) {
    return <Badge variant="tint">已封鎖</Badge>
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        封鎖
      </Button>
      <BlockDialog user={user} open={open} onOpenChange={setOpen} />
    </>
  )
}

export default function UsersTab({ platform }: { platform: Platform | "" }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawPage = searchParams.get("page")
  const page = rawPage ? Math.max(1, Number(rawPage) || 1) : 1

  function goToPage(p: number) {
    const next = new URLSearchParams(searchParams)
    if (p <= 1) next.delete("page")
    else next.set("page", String(p))
    setSearchParams(next)
  }

  const filter: ListFilter = { platform, page }
  const query = useQuery({ queryKey: botKeys.users(filter), queryFn: () => listUsersWithBinding(filter) })

  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{query.isLoading ? "" : `共 ${total} 位使用者`}</p>

      {query.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{query.error instanceof ApiError ? query.error.detail : "載入失敗，請稍後再試"}</AlertDescription>
        </Alert>
      ) : query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">沒有使用者</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  <TableHead>平台</TableHead>
                  <TableHead>CTOS 綁定</TableHead>
                  <TableHead>好友</TableHead>
                  <TableHead>動作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserAvatar pictureUrl={u.picture_url} name={u.display_name || "—"} />
                        <span>{u.display_name || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="tint">{platformLabel(u.platform_type)}</Badge>
                    </TableCell>
                    <TableCell>{u.bound_display_name || u.bound_username || "未綁定"}</TableCell>
                    <TableCell>{u.is_friend ? "是" : "否"}</TableCell>
                    <TableCell>
                      <BlockAction user={u} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
        </>
      )}
    </div>
  )
}
