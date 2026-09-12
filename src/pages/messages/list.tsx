import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Link, useSearchParams } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Pagination } from "@/components/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import {
  isSeverity,
  isSource,
  listMessages,
  markRead,
  messageKeys,
  SEVERITY_CLASS,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  SOURCE_LABEL,
  SOURCE_ORDER,
  type MessageFilters,
  type MessageListItem,
  type MessageSeverity,
} from "@/lib/messages"
import { listSimpleUsers, simpleUserName, userKeys } from "@/lib/users"

function filtersFromParams(params: URLSearchParams): MessageFilters {
  const rawIsRead = params.get("is_read")
  const rawPage = params.get("page")
  const rawUserId = params.get("user_id")
  const userId = rawUserId !== null && rawUserId !== "" && !Number.isNaN(Number(rawUserId)) ? Number(rawUserId) : undefined
  return {
    severity: params.getAll("severity").filter(isSeverity),
    source: params.getAll("source").filter(isSource),
    search: params.get("search") || undefined,
    isRead: rawIsRead === "true" ? true : rawIsRead === "false" ? false : undefined,
    userId,
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    page: rawPage ? Math.max(1, Number(rawPage) || 1) : undefined,
  }
}

function SeverityBadge({ severity }: { severity: MessageSeverity }) {
  return (
    <Badge variant="tint" className={SEVERITY_CLASS[severity]}>
      {SEVERITY_LABEL[severity]}
    </Badge>
  )
}

function MessageCard({
  item,
  checked,
  onCheckedChange,
}: {
  item: MessageListItem
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          aria-label={`選取「${item.title}」`}
          className="mt-1"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <Link
            to={`/messages/${item.id}`}
            className={`block break-words text-primary underline-offset-4 hover:underline ${item.is_read ? "" : "font-semibold"}`}
          >
            {item.title}
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <SeverityBadge severity={item.severity} />
            <span>{SOURCE_LABEL[item.source]}</span>
            {item.category && <span>{item.category}</span>}
            <span>{new Date(item.created_at).toLocaleString("zh-TW")}</span>
            <span>{item.is_read ? "已讀" : "未讀"}</span>
          </div>
        </div>
      </div>
    </li>
  )
}

export default function MessageListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isAdmin = Boolean(user?.is_admin)
  const rawFilters = filtersFromParams(searchParams)
  // user_id 只有管理員送出去有效（api/messages.py 38、51–57），非管理員一律不帶，
  // 避免手改網址也打出一個後端會忽略的參數。
  const filters: MessageFilters = isAdmin ? rawFilters : { ...rawFilters, userId: undefined }
  const page = filters.page ?? 1

  const usersQuery = useQuery({ queryKey: userKeys.list, queryFn: listSimpleUsers, enabled: isAdmin })
  const users = usersQuery.data?.users ?? []
  const selectedUserLabel = filters.userId !== undefined ? users.find((u) => u.id === filters.userId) : undefined

  const [selected, setSelected] = React.useState<number[]>([])
  const [confirmAll, setConfirmAll] = React.useState(false)
  const [searchDraft, setSearchDraft] = React.useState(filters.search ?? "")
  // 網址被外面改掉（例如鈴鐺帶著 is_read=false 進來、或按上一頁）時，讓搜尋框跟上。
  const urlSearch = filters.search ?? ""
  const [lastUrlSearch, setLastUrlSearch] = React.useState(urlSearch)
  if (urlSearch !== lastUrlSearch) {
    setLastUrlSearch(urlSearch)
    setSearchDraft(urlSearch)
  }

  const listQuery = useQuery({ queryKey: messageKeys.list(filters), queryFn: () => listMessages(filters) })
  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const totalPages = Math.max(1, listQuery.data?.total_pages ?? 1)

  const mark = useMutation({
    mutationFn: (vars: { body: Parameters<typeof markRead>[0]; userId?: number }) => markRead(vars.body, vars.userId),
    onSuccess: () => {
      setSelected([])
      void queryClient.invalidateQueries({ queryKey: messageKeys.all })
    },
    onSettled: () => setConfirmAll(false),
  })

  function setParams(mutate: (next: URLSearchParams) => void, opts: { keepPage?: boolean } = {}) {
    const next = new URLSearchParams(searchParams)
    mutate(next)
    if (!opts.keepPage) next.delete("page")
    setSearchParams(next, { replace: !opts.keepPage })
    setSelected([])
  }

  function toggleMulti(key: "severity" | "source", value: string, on: boolean) {
    setParams((next) => {
      const current = next.getAll(key)
      next.delete(key)
      const kept = on ? [...current, value] : current.filter((v) => v !== value)
      for (const v of kept) next.append(key, v)
    })
  }

  function clearFilters() {
    setSearchDraft("")
    setSearchParams(new URLSearchParams(), { replace: true })
    setSelected([])
  }

  const allOnPageSelected = items.length > 0 && items.every((i) => selected.includes(i.id))
  function toggleAllOnPage(on: boolean) {
    setSelected(on ? items.map((i) => i.id) : [])
  }
  function toggleOne(id: number, on: boolean) {
    setSelected((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  const severityPicked = filters.severity ?? []
  const sourcePicked = filters.source ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">訊息中心</h1>
        <p className="text-sm text-muted-foreground">
          {listQuery.isLoading ? "" : `共 ${total.toLocaleString("zh-TW")} 筆`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" aria-label="嚴重程度">
              嚴重程度{severityPicked.length > 0 ? `（${severityPicked.length}）` : ""}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SEVERITY_ORDER.map((s) => (
              <DropdownMenuCheckboxItem
                key={s}
                checked={severityPicked.includes(s)}
                onCheckedChange={(v) => toggleMulti("severity", s, v === true)}
                onSelect={(e) => e.preventDefault()}
              >
                {SEVERITY_LABEL[s]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" aria-label="來源">
              來源{sourcePicked.length > 0 ? `（${sourcePicked.length}）` : ""}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SOURCE_ORDER.map((s) => (
              <DropdownMenuCheckboxItem
                key={s}
                checked={sourcePicked.includes(s)}
                onCheckedChange={(v) => toggleMulti("source", s, v === true)}
                onSelect={(e) => e.preventDefault()}
              >
                {SOURCE_LABEL[s]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Select
          value={filters.isRead === undefined ? "all" : String(filters.isRead)}
          onValueChange={(v) => setParams((next) => (v === "all" ? next.delete("is_read") : next.set("is_read", v)))}
        >
          <SelectTrigger className="w-28" aria-label="已讀狀態">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="false">未讀</SelectItem>
            <SelectItem value="true">已讀</SelectItem>
          </SelectContent>
        </Select>

        {/* 只有管理員看得到：後端 user_id 篩選對非管理員一律被忽略（api/messages.py 38、51–57）。 */}
        {isAdmin && (
          <Select
            value={filters.userId === undefined ? "all" : String(filters.userId)}
            onValueChange={(v) => setParams((next) => (v === "all" ? next.delete("user_id") : next.set("user_id", v)))}
          >
            <SelectTrigger className="w-32" aria-label="使用者">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部使用者</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {simpleUserName(u)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setParams((next) => (searchDraft ? next.set("search", searchDraft) : next.delete("search")))
          }}
        >
          <Input
            aria-label="搜尋"
            placeholder="搜尋標題或內容"
            className="w-44"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
          />
          <Button type="submit" variant="outline">
            搜尋
          </Button>
        </form>

        <input
          type="date"
          aria-label="起日"
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          value={filters.from ?? ""}
          onChange={(e) => setParams((next) => (e.target.value ? next.set("from", e.target.value) : next.delete("from")))}
        />
        <input
          type="date"
          aria-label="迄日"
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          value={filters.to ?? ""}
          onChange={(e) => setParams((next) => (e.target.value ? next.set("to", e.target.value) : next.delete("to")))}
        />
        <Button variant="outline" onClick={clearFilters}>
          清除篩選
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={selected.length === 0 || mark.isPending}
          onClick={() => mark.mutate({ body: { ids: selected } })}
        >
          標為已讀{selected.length > 0 ? `（${selected.length}）` : ""}
        </Button>
        <Button variant="outline" disabled={mark.isPending} onClick={() => setConfirmAll(true)}>
          全部標為已讀
        </Button>
      </div>

      {mark.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {mark.error instanceof ApiError ? mark.error.detail : "標記失敗，請稍後再試"}
          </AlertDescription>
        </Alert>
      )}

      {listQuery.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {listQuery.error instanceof ApiError ? listQuery.error.detail : "載入失敗，請稍後再試"}
          </AlertDescription>
        </Alert>
      ) : listQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">沒有符合的訊息</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allOnPageSelected}
                      onCheckedChange={(v) => toggleAllOnPage(v === true)}
                      aria-label="選取本頁全部"
                    />
                  </TableHead>
                  <TableHead>嚴重程度</TableHead>
                  <TableHead>來源</TableHead>
                  <TableHead>分類</TableHead>
                  <TableHead>標題</TableHead>
                  <TableHead>時間</TableHead>
                  <TableHead>狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} className={item.is_read ? undefined : "font-semibold"}>
                    <TableCell>
                      <Checkbox
                        checked={selected.includes(item.id)}
                        onCheckedChange={(v) => toggleOne(item.id, v === true)}
                        aria-label={`選取「${item.title}」`}
                      />
                    </TableCell>
                    <TableCell>
                      <SeverityBadge severity={item.severity} />
                    </TableCell>
                    <TableCell>{SOURCE_LABEL[item.source]}</TableCell>
                    <TableCell>{item.category || "—"}</TableCell>
                    <TableCell>
                      <Link
                        to={`/messages/${item.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {item.title}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {new Date(item.created_at).toLocaleString("zh-TW")}
                    </TableCell>
                    <TableCell>{item.is_read ? "已讀" : "未讀"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {items.map((item) => (
              <MessageCard
                key={item.id}
                item={item}
                checked={selected.includes(item.id)}
                onCheckedChange={(v) => toggleOne(item.id, v)}
              />
            ))}
          </ul>

          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={(p) => setParams((next) => (p <= 1 ? next.delete("page") : next.set("page", String(p))), { keepPage: true })}
          />
        </>
      )}

      {/*
        關掉時整塊從樹上拿掉，避免 Radix 離場動畫留下的遮罩吃掉下一次點擊（同 #26 的處理）。
      */}
      <AlertDialog
        open={confirmAll}
        onOpenChange={(open) => {
          if (!open && !mark.isPending) setConfirmAll(false)
        }}
      >
        {confirmAll && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確定把全部訊息標為已讀？</AlertDialogTitle>
              <AlertDialogDescription>
                {isAdmin && filters.userId !== undefined
                  ? `這會把「${selectedUserLabel ? simpleUserName(selectedUserLabel) : filters.userId}」看得到的所有未讀訊息標為已讀（含全系統訊息），不只目前這一頁；其他篩選條件不影響範圍。`
                  : "這會標記你看得到的所有訊息，不只目前這一頁，也不受其他篩選條件影響。"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={mark.isPending}>返回</AlertDialogCancel>
              {/* 用一般的 Button：AlertDialogAction 會在請求還在路上時就把按鈕關掉。 */}
              <Button
                disabled={mark.isPending}
                onClick={() => mark.mutate({ body: { all: true }, userId: isAdmin ? filters.userId : undefined })}
              >
                確定
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  )
}
