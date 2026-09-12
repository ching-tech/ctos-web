import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useSearchParams } from "react-router"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Pagination } from "@/components/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import { botKeys, listBlockedUsers, platformLabel, unblockUser, type BotUser, type ListFilter, type Platform } from "@/lib/bot"

const PAGE_SIZE = 20

function UnblockAction({ user }: { user: BotUser }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => unblockUser(user.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...botKeys.all, "users"] })
      queryClient.invalidateQueries({ queryKey: [...botKeys.all, "blocked"] })
    },
  })

  return (
    <>
      {mutation.isError && (
        <Alert variant="destructive" role="alert" className="mb-2">
          <AlertDescription>
            {mutation.error instanceof ApiError ? mutation.error.detail : "解除封鎖失敗，請稍後再試"}
          </AlertDescription>
        </Alert>
      )}
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
            <AlertDialogAction onClick={() => mutation.mutate()}>確定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default function BlocklistTab({ platform }: { platform: Platform | "" }) {
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
  const query = useQuery({ queryKey: botKeys.blocked(filter), queryFn: () => listBlockedUsers(filter) })

  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{query.isLoading ? "" : `共 ${total} 位`}</p>

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
        <p className="text-muted-foreground">黑名單是空的</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  <TableHead>平台</TableHead>
                  <TableHead>封鎖時間</TableHead>
                  <TableHead>原因</TableHead>
                  <TableHead>動作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Link to={`/bot/users/${u.id}?from=blocklist`} className="text-primary underline-offset-4 hover:underline">
                        {u.display_name || "未命名使用者"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="tint">{platformLabel(u.platform_type)}</Badge>
                    </TableCell>
                    <TableCell>{u.blocked_at ? new Date(u.blocked_at).toLocaleString("zh-TW") : "—"}</TableCell>
                    <TableCell>{u.blocked_reason || "—"}</TableCell>
                    <TableCell>
                      <UnblockAction user={u} />
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
