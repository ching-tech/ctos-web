import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Link, useParams, useSearchParams } from "react-router"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { blockUser, botKeys, getUser, platformLabel, unblockUser, type BotUser } from "@/lib/bot"

/** 從黑名單分頁點進來時帶 `?from=blocklist`，回去的連結就回黑名單而不是使用者清單。 */
function backTarget(from: string | null): { to: string; label: string } {
  return from === "blocklist"
    ? { to: "/bot?tab=blocklist", label: "回黑名單" }
    : { to: "/bot?tab=users", label: "回使用者清單" }
}

function SummaryRow({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-right break-words">{value}</dd>
    </div>
  )
}

function Avatar({ pictureUrl, name }: { pictureUrl: string | null; name: string }) {
  if (pictureUrl) return <img src={pictureUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
      {name.slice(0, 1)}
    </div>
  )
}

function localTime(v: string | null): string {
  return v ? new Date(v).toLocaleString("zh-TW") : "—"
}

/**
 * 綁定狀態：這支端點不 JOIN users（`services/bot_line/admin.py` 193–206），
 * `bound_username` 拿不到，所以以 `user_id` 為準，名字有就顯示、沒有就顯示帳號編號。
 */
function bindingText(user: BotUser): string {
  if (user.user_id === null) return "未綁定"
  const name = user.bound_display_name || user.bound_username
  return name ? `${name}（CTOS 帳號 #${user.user_id}）` : `已綁定 CTOS 帳號 #${user.user_id}`
}

function BlockDialog({ user, open, onOpenChange }: { user: BotUser; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = React.useState("")

  const mutation = useMutation({
    mutationFn: () => blockUser(user.id, reason || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: botKeys.user(user.id) })
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

function BlockSection({ user }: { user: BotUser }) {
  const queryClient = useQueryClient()
  const [blockOpen, setBlockOpen] = React.useState(false)

  const unblock = useMutation({
    mutationFn: () => unblockUser(user.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: botKeys.user(user.id) })
      queryClient.invalidateQueries({ queryKey: [...botKeys.all, "users"] })
      queryClient.invalidateQueries({ queryKey: [...botKeys.all, "blocked"] })
    },
  })

  return (
    <div className="space-y-3">
      <dl>
        <SummaryRow term="狀態" value={user.is_blocked ? <Badge variant="tint">已封鎖</Badge> : "正常"} />
        {user.is_blocked && <SummaryRow term="封鎖時間" value={localTime(user.blocked_at)} />}
        {user.is_blocked && <SummaryRow term="封鎖原因" value={user.blocked_reason || "—"} />}
      </dl>

      {unblock.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {unblock.error instanceof ApiError ? unblock.error.detail : "解除封鎖失敗，請稍後再試"}
          </AlertDescription>
        </Alert>
      )}

      {user.is_blocked ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm">
              解除封鎖
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確定解除封鎖？</AlertDialogTitle>
              <AlertDialogDescription>解除後此使用者可再次與 Bot 互動。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={() => unblock.mutate()}>確定</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <>
          <Button variant="outline" size="sm" onClick={() => setBlockOpen(true)}>
            封鎖
          </Button>
          <BlockDialog user={user} open={blockOpen} onOpenChange={setBlockOpen} />
        </>
      )}
    </div>
  )
}

export default function BotUserDetailPage() {
  const { id = "" } = useParams()
  const [searchParams] = useSearchParams()
  const back = backTarget(searchParams.get("from"))

  const query = useQuery({ queryKey: botKeys.user(id), queryFn: () => getUser(id), retry: false })

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (query.isError) {
    const err = query.error
    if (err instanceof ApiError && err.status === 404) {
      return (
        <div className="space-y-3">
          <p>{err.detail}</p>
          <Link to={back.to} className="text-primary underline underline-offset-4">
            {back.label}
          </Link>
        </div>
      )
    }
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{err instanceof ApiError ? err.detail : "載入失敗，請稍後再試"}</AlertDescription>
      </Alert>
    )
  }

  const user = query.data!
  const name = user.display_name || "未命名使用者"

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link to={back.to} className="text-sm text-primary underline-offset-4 hover:underline">
          {back.label}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Avatar pictureUrl={user.picture_url} name={name} />
          <h1 className="text-2xl font-semibold">{name}</h1>
          <Badge variant="tint">{platformLabel(user.platform_type)}</Badge>
          {user.is_blocked && <Badge variant="tint">已封鎖</Badge>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">資訊</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <SummaryRow term="平台" value={platformLabel(user.platform_type)} />
              <SummaryRow term="平台使用者 ID" value={<span className="font-mono text-xs">{user.platform_user_id}</span>} />
              <SummaryRow term="狀態訊息" value={user.status_message || "—"} />
              <SummaryRow term="語言" value={user.language || "—"} />
              <SummaryRow term="好友" value={user.is_friend ? "是" : "否"} />
              <SummaryRow term="建立時間" value={localTime(user.created_at)} />
              <SummaryRow term="更新時間" value={localTime(user.updated_at)} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">CTOS 綁定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl>
              <SummaryRow term="綁定狀態" value={bindingText(user)} />
            </dl>
            <Link
              to={`/memory?tab=user&target=${encodeURIComponent(user.id)}`}
              className="inline-block text-sm text-primary underline-offset-4 hover:underline"
            >
              查看這位使用者的記憶
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">封鎖</CardTitle>
        </CardHeader>
        <CardContent>
          <BlockSection user={user} />
        </CardContent>
      </Card>
    </div>
  )
}
