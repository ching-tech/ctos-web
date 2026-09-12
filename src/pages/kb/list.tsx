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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { KbCard } from "@/components/kb/kb-card"
import { titleForPath } from "@/lib/nav"
import { ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import {
  CATEGORY_LABEL,
  getTags,
  kbKeys,
  label,
  listKnowledge,
  rebuildIndex,
  TYPE_LABEL,
  type ListFilters,
  type RebuildIndexResult,
  type Scope,
} from "@/lib/kb"

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "global", label: "全域" },
  { value: "personal", label: "個人" },
  { value: "project", label: "專案" },
]

const SEARCH_DEBOUNCE_MS = 300
const VALID_SCOPES: readonly Scope[] = ["global", "personal", "project"]

/** 後端回的是統計 dict，不是一句話，所以文案在前端組。 */
function rebuildMessage(r: RebuildIndexResult): string {
  const base = `已重建索引，共 ${r.total} 筆，下一個編號 ${r.next_id}`
  return r.errors.length === 0 ? base : `${base}；${r.errors.length} 筆讀不進去：${r.errors.join("、")}`
}

function filtersFromParams(params: URLSearchParams): ListFilters {
  const rawScope = params.get("scope")
  const scope = VALID_SCOPES.includes(rawScope as Scope) ? (rawScope as Scope) : ""
  return {
    q: params.get("q") || undefined,
    scope,
    type: params.get("type") || undefined,
    category: params.get("category") || undefined,
  }
}

export default function KbListPage() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  // 後端只要 `knowledge-base` 的 app 權限（`api/knowledge.py` 193），能進這頁的人都過得了；
  // 但重建是整庫的維護動作，前端收得比後端緊，只給管理員。
  const canRebuild = Boolean(user?.is_admin)
  const [confirmingRebuild, setConfirmingRebuild] = React.useState(false)
  const [rebuildNotice, setRebuildNotice] = React.useState<{ ok: boolean; text: string } | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = filtersFromParams(searchParams)
  const [draftQ, setDraftQ] = React.useState(filters.q ?? "")
  const [syncedQ, setSyncedQ] = React.useState(filters.q)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // 卸載時清掉尚未觸發的 debounce timer，避免離開頁面後才 fire，
  // 把 q 寫進當下已經不是清單頁的網址（例如點進 /kb/kb-001）。
  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // 網址上的 q 被外部改變時（例如 reload、瀏覽器上一頁）同步回搜尋框草稿值。
  // 依 React 建議在渲染期間調整狀態，不用 effect，避免多一次渲染。
  if (filters.q !== syncedQ) {
    setSyncedQ(filters.q)
    setDraftQ(filters.q ?? "")
  }

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  function onSearchChange(value: string) {
    setDraftQ(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => updateParam("q", value), SEARCH_DEBOUNCE_MS)
  }

  function onSearchEnter() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    updateParam("q", draftQ)
  }

  const listQuery = useQuery({ queryKey: kbKeys.list(filters), queryFn: () => listKnowledge(filters) })
  const tagsQuery = useQuery({ queryKey: kbKeys.tags, queryFn: getTags })

  const rebuild = useMutation({
    mutationFn: rebuildIndex,
    onMutate: () => setRebuildNotice(null),
    onSuccess: (data) => {
      setRebuildNotice({ ok: true, text: rebuildMessage(data) })
      setConfirmingRebuild(false)
      void queryClient.invalidateQueries({ queryKey: kbKeys.all })
    },
    onError: (e) => {
      setRebuildNotice({ ok: false, text: e instanceof ApiError ? e.detail : "重建索引失敗，請稍後再試" })
      setConfirmingRebuild(false)
    },
  })

  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sr-only">{titleForPath(pathname)}</h1>
        <p className="text-sm text-muted-foreground">{listQuery.isLoading ? "" : `共 ${total} 筆`}</p>
        <div className="flex gap-2">
          {canRebuild && (
            <Button type="button" variant="outline" disabled={rebuild.isPending} onClick={() => setConfirmingRebuild(true)}>
              {rebuild.isPending ? "重建中…" : "重建索引"}
            </Button>
          )}
          <Button asChild>
            <Link to="/kb/new">新增知識</Link>
          </Button>
        </div>
      </div>

      {rebuildNotice && (
        <Alert variant={rebuildNotice.ok ? "default" : "destructive"}>
          <AlertDescription>{rebuildNotice.text}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="搜尋"
          placeholder="搜尋標題與內容"
          className="min-w-48 flex-1"
          value={draftQ}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearchEnter()
          }}
        />
        <Select value={filters.scope || "all"} onValueChange={(v) => updateParam("scope", v === "all" ? "" : v)}>
          <SelectTrigger className="w-28" aria-label="scope 篩選">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            {SCOPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.type || "all"} onValueChange={(v) => updateParam("type", v === "all" ? "" : v)}>
          <SelectTrigger className="w-28" aria-label="type 篩選">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            {(tagsQuery.data?.types ?? []).map((t) => (
              <SelectItem key={t} value={t}>
                {label(TYPE_LABEL, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.category || "all"} onValueChange={(v) => updateParam("category", v === "all" ? "" : v)}>
          <SelectTrigger className="w-28" aria-label="category 篩選">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            {(tagsQuery.data?.categories ?? []).map((c) => (
              <SelectItem key={c} value={c}>
                {label(CATEGORY_LABEL, c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {listQuery.isError && (
        <Alert variant="destructive">
          <AlertDescription>{listQuery.error instanceof ApiError ? listQuery.error.detail : "載入失敗，請稍後再試"}</AlertDescription>
        </Alert>
      )}

      {listQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <>
          {items.length === 0 ? (
            <p className="text-muted-foreground">沒有符合的知識</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <KbCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </>
      )}

      <AlertDialog
        open={confirmingRebuild}
        onOpenChange={(open) => {
          if (!open && !rebuild.isPending) setConfirmingRebuild(false)
        }}
      >
        {confirmingRebuild && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確定重建索引？</AlertDialogTitle>
              <AlertDialogDescription>
                會重新掃過知識庫目錄裡的每一個檔案，改寫 index.json；條目多的時候要等一下，期間其他人的搜尋結果可能對不上。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={rebuild.isPending}>返回</AlertDialogCancel>
              <Button disabled={rebuild.isPending} onClick={() => rebuild.mutate()}>
                確定重建
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  )
}
