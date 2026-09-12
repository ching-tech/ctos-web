import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Link, useLocation, useSearchParams } from "react-router"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ApiError } from "@/lib/api"
import { titleForPath } from "@/lib/nav"
import {
  listShareLinks,
  revokeShareLink,
  shareKeys,
  shareLinkTitle,
  shareResourceHref,
  shareResourceTypeLabel,
  type ShareLinkInfo,
  type ShareView,
} from "@/lib/share"

function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.detail : fallback
}

function formatDateTime(v: string | null): string {
  if (!v) return "—"
  return new Date(v).toLocaleString("zh-TW", { hour12: false })
}

/** 到期：null＝永久（`models/share.py` 29 允許 null）。 */
function formatExpiry(v: string | null): string {
  if (!v) return "永久"
  return new Date(v).toLocaleString("zh-TW", { hour12: false })
}

function TypeBadge({ type }: { type: string }) {
  return <Badge variant="tint">{shareResourceTypeLabel(type)}</Badge>
}

function ExpiredBadge() {
  return (
    <Badge variant="outline" className="ml-2">
      已過期
    </Badge>
  )
}

/** 標題：有對應頁面的給連結，其餘純文字（`shareResourceHref` 有寫哪些類型沒有落點）。 */
function ResourceTitle({ link }: { link: ShareLinkInfo }) {
  const href = shareResourceHref(link)
  const title = shareLinkTitle(link)
  if (!href) return <span className="break-all">{title}</span>
  return (
    <Link to={href} className="break-all text-primary underline-offset-4 hover:underline">
      {title}
    </Link>
  )
}

function CopyButton({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onCopy}>
        複製網址
      </Button>
      {copied && <span className="text-xs text-muted-foreground">已複製</span>}
    </div>
  )
}

function ShareCard({
  link,
  showCreatedBy,
  copied,
  busy,
  onCopy,
  onRevoke,
}: {
  link: ShareLinkInfo
  showCreatedBy: boolean
  copied: boolean
  busy: boolean
  onCopy: () => void
  onRevoke: () => void
}) {
  return (
    <li className={`space-y-2 rounded-lg border p-4 ${link.is_expired ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <ResourceTitle link={link} />
        <TypeBadge type={link.resource_type} />
      </div>
      <p className="font-mono text-xs break-all text-muted-foreground">{link.full_url}</p>
      <dl className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">到期</dt>
          <dd>
            {formatExpiry(link.expires_at)}
            {link.is_expired && <ExpiredBadge />}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">存取次數</dt>
          <dd className="tabular-nums">{link.access_count}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">建立時間</dt>
          <dd>{formatDateTime(link.created_at)}</dd>
        </div>
        {showCreatedBy && (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">建立者</dt>
            <dd>{link.created_by || "—"}</dd>
          </div>
        )}
      </dl>
      <div className="flex items-center justify-between gap-2">
        <CopyButton copied={copied} onCopy={onCopy} />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRevoke}>
          撤銷
        </Button>
      </div>
    </li>
  )
}

export default function SharesPage() {
  const { pathname } = useLocation()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  // 網址是唯一的來源；`?view=all` 以外一律當 mine（後端 `api/share.py` 155 也是這樣判）。
  const view: ShareView = searchParams.get("view") === "all" ? "all" : "mine"
  const [notice, setNotice] = React.useState<string | null>(null)
  const [copiedToken, setCopiedToken] = React.useState<string | null>(null)
  // 確認對話框只有一個，狀態放在頁這一層（#26／#29）：放在每一列裡的話，
  // 那一列因為清單 refetch 或被撤掉而重新渲染時，對話框會連同開關狀態一起被拆掉。
  const [confirming, setConfirming] = React.useState<ShareLinkInfo | null>(null)

  const query = useQuery({ queryKey: shareKeys.list(view), queryFn: () => listShareLinks(view) })

  const revoke = useMutation({
    mutationFn: (token: string) => revokeShareLink(token),
    // 重試前先清掉上一次的錯誤訊息，成功之後也要清，否則失敗訊息會一直掛著。
    onMutate: () => setNotice(null),
    onSuccess: () => {
      setNotice(null)
      // 兩種檢視都失效：管理員撤銷別人的連結之後切回「只看我的」不該看到殘影。
      void queryClient.invalidateQueries({ queryKey: shareKeys.all })
    },
    onError: (e) => setNotice(errorText(e, "撤銷失敗，請稍後再試")),
    // 要等這一趟請求落地才關對話框，「確定撤銷」在送出到收到回應之間必須留在畫面上。
    onSettled: () => setConfirming(null),
  })

  function changeView(next: ShareView) {
    const params = new URLSearchParams(searchParams)
    if (next === "all") params.set("view", "all")
    else params.delete("view")
    setSearchParams(params, { replace: true })
    setCopiedToken(null)
  }

  async function copyUrl(link: ShareLinkInfo) {
    try {
      await navigator.clipboard.writeText(link.full_url)
      setNotice(null)
      setCopiedToken(link.token)
    } catch {
      setCopiedToken(null)
      setNotice("瀏覽器不給複製，請手動選取網址。")
    }
  }

  const links = query.data?.links ?? []
  const isAdmin = query.data?.is_admin ?? false
  // 建立者只在管理員看「全部」時才有意義：`view=mine` 每一列的建立者都是自己。
  const showCreatedBy = isAdmin && view === "all"

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sr-only">{titleForPath(pathname)}</h1>
        <p className="text-sm text-muted-foreground">{query.isLoading ? "" : `共 ${links.length} 筆`}</p>
      </div>

      {isAdmin && (
        <Tabs value={view} onValueChange={(v) => changeView(v === "all" ? "all" : "mine")}>
          <TabsList>
            <TabsTrigger value="mine">只看我的</TabsTrigger>
            <TabsTrigger value="all">全部</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {notice && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {query.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{errorText(query.error, "載入失敗，請稍後再試")}</AlertDescription>
        </Alert>
      ) : query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : links.length === 0 ? (
        <div className="space-y-1">
          <p className="text-muted-foreground">還沒有分享連結</p>
          <p className="text-sm text-muted-foreground">分享連結從知識庫的條目或檔案管理的檔案建立。</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>類型</TableHead>
                  <TableHead>標題</TableHead>
                  <TableHead>網址</TableHead>
                  <TableHead>到期</TableHead>
                  <TableHead>存取次數</TableHead>
                  <TableHead>建立時間</TableHead>
                  {showCreatedBy && <TableHead>建立者</TableHead>}
                  <TableHead>動作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.token} className={link.is_expired ? "opacity-60" : undefined}>
                    <TableCell>
                      <TypeBadge type={link.resource_type} />
                    </TableCell>
                    <TableCell className="max-w-64">
                      <ResourceTitle link={link} />
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-64 truncate font-mono text-xs" title={link.full_url}>
                        {link.full_url}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatExpiry(link.expires_at)}
                      {link.is_expired && <ExpiredBadge />}
                    </TableCell>
                    <TableCell className="tabular-nums">{link.access_count}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(link.created_at)}</TableCell>
                    {showCreatedBy && <TableCell>{link.created_by || "—"}</TableCell>}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CopyButton copied={copiedToken === link.token} onCopy={() => void copyUrl(link)} />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={revoke.isPending && confirming?.token === link.token}
                          onClick={() => setConfirming(link)}
                        >
                          撤銷
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {links.map((link) => (
              <ShareCard
                key={link.token}
                link={link}
                showCreatedBy={showCreatedBy}
                copied={copiedToken === link.token}
                busy={revoke.isPending && confirming?.token === link.token}
                onCopy={() => void copyUrl(link)}
                onRevoke={() => setConfirming(link)}
              />
            ))}
          </ul>
        </>
      )}

      {/*
        只有這一個確認對話框，`open` 由 React state 控制；內容整塊用 `confirming &&` 包住，
        關掉時直接從樹上拿掉，不留 Radix 離場動畫那 100ms 的遮罩去吃掉下一次點擊（#29）。
      */}
      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          // 送出中不讓 Esc／點外面關掉，免得按鈕在請求還沒回來時就消失。
          if (!open && !revoke.isPending) setConfirming(null)
        }}
      >
        {confirming && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確定撤銷「{shareLinkTitle(confirming)}」的分享連結？</AlertDialogTitle>
              <AlertDialogDescription>
                撤銷後這個網址立刻打不開，無法復原；要再分享得重新建立一條。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={revoke.isPending}>返回</AlertDialogCancel>
              {/*
                用一般的 Button 而不是 AlertDialogAction：Action 按下去的同一刻就把對話框關掉，
                按鈕會在請求還在路上時就從 DOM 消失。這裡等 `onSettled` 才關。
              */}
              <Button disabled={revoke.isPending} onClick={() => revoke.mutate(confirming.token)}>
                確定撤銷
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  )
}
