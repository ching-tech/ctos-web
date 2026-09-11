import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { Link, useLocation, useSearchParams } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { KbCard } from "@/components/kb/kb-card"
import { titleForPath } from "@/lib/nav"
import { ApiError } from "@/lib/api"
import {
  CATEGORY_LABEL,
  getTags,
  kbKeys,
  label,
  listKnowledge,
  TYPE_LABEL,
  type ListFilters,
  type Scope,
} from "@/lib/kb"

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "global", label: "全域" },
  { value: "personal", label: "個人" },
  { value: "project", label: "專案" },
]

const SEARCH_DEBOUNCE_MS = 300
const VALID_SCOPES: readonly Scope[] = ["global", "personal", "project"]

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

  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sr-only">{titleForPath(pathname)}</h1>
        <p className="text-sm text-muted-foreground">{listQuery.isLoading ? "" : `共 ${total} 筆`}</p>
        <Button asChild>
          <Link to="/kb/new">新增知識</Link>
        </Button>
      </div>

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
    </div>
  )
}
