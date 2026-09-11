import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { Link, useLocation, useSearchParams } from "react-router"
import { Pagination } from "@/components/pagination"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { titleForPath } from "@/lib/nav"
import {
  listProjects,
  PROJECT_PAGE_SIZE,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_OPTIONS,
  PROJECT_STATUS_TINT,
  projectKeys,
  projectLabel,
  tint,
  type ProjectFilters,
  type ProjectListItem,
  type ProjectStatus,
} from "@/lib/projects"

const SEARCH_DEBOUNCE_MS = 300

function statusFromParams(params: URLSearchParams): ProjectStatus | "" {
  const raw = params.get("status")
  return (PROJECT_STATUS_OPTIONS as string[]).includes(raw ?? "") ? (raw as ProjectStatus) : ""
}

function filtersFromParams(params: URLSearchParams): ProjectFilters {
  const rawPage = params.get("page")
  return {
    status: statusFromParams(params),
    q: params.get("q") || undefined,
    page: rawPage ? Math.max(1, Number(rawPage) || 1) : 1,
  }
}

/** 進度條：沒有 Progress 元件，用兩層 div，寬度照百分比。 */
function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  )
}

/** 逾期里程碑數的樣式；大於 0 標紅（後端只在專案 active 時才算逾期）。 */
function overdueClass(value: number): string {
  return value > 0 ? "font-medium text-destructive tabular-nums" : "tabular-nums"
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="tint" className={tint(PROJECT_STATUS_TINT, status)}>
      {projectLabel(PROJECT_STATUS_LABEL, status)}
    </Badge>
  )
}

function ProjectCard({ item }: { item: ProjectListItem }) {
  return (
    <li className="space-y-2 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/projects/${item.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
          {item.name}
        </Link>
        <StatusBadge status={item.status} />
      </div>
      <dl className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">客戶</dt>
          <dd>{item.customer || "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">負責人</dt>
          <dd>{item.owner_name || "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">進度</dt>
          <dd>
            <ProgressBar value={item.progress} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">迄日</dt>
          <dd>{item.end_date || "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">逾期里程碑</dt>
          <dd className={overdueClass(item.overdue_milestones)}>{item.overdue_milestones}</dd>
        </div>
      </dl>
    </li>
  )
}

export default function ProjectListPage() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = filtersFromParams(searchParams)
  const [draftQ, setDraftQ] = React.useState(filters.q ?? "")
  const [syncedQ, setSyncedQ] = React.useState(filters.q)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // 卸載時清掉尚未觸發的 debounce timer，避免離開頁面後才把 q 寫進別頁網址。
  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // 網址上的 q 被外部改變時（reload、上一頁）同步回搜尋框草稿值。
  if (filters.q !== syncedQ) {
    setSyncedQ(filters.q)
    setDraftQ(filters.q ?? "")
  }

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== "page") next.delete("page")
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

  const query = useQuery({ queryKey: projectKeys.list(filters), queryFn: () => listProjects(filters) })
  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / (filters.pageSize ?? PROJECT_PAGE_SIZE)))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sr-only">{titleForPath(pathname)}</h1>
        <p className="text-sm text-muted-foreground">{query.isLoading ? "" : `共 ${total} 筆`}</p>
        {user?.is_admin && (
          <Button asChild>
            <Link to="/projects/new">新增專案</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="搜尋"
          placeholder="搜尋名稱與客戶"
          className="min-w-48 flex-1"
          value={draftQ}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearchEnter()
          }}
        />
        <Select value={filters.status || "all"} onValueChange={(v) => updateParam("status", v === "all" ? "" : v)}>
          <SelectTrigger className="w-28" aria-label="狀態篩選">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            {PROJECT_STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {PROJECT_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{query.error instanceof ApiError ? query.error.detail : "載入失敗，請稍後再試"}</AlertDescription>
        </Alert>
      ) : query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">還沒有專案</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  <TableHead>客戶</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>負責人</TableHead>
                  <TableHead>進度</TableHead>
                  <TableHead>迄日</TableHead>
                  <TableHead>逾期里程碑</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link to={`/projects/${p.id}`} className="text-primary underline-offset-4 hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>{p.customer || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                    <TableCell>{p.owner_name || "—"}</TableCell>
                    <TableCell>
                      <ProgressBar value={p.progress} />
                    </TableCell>
                    <TableCell>{p.end_date || "—"}</TableCell>
                    <TableCell className={overdueClass(p.overdue_milestones)}>{p.overdue_milestones}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {items.map((p) => (
              <ProjectCard key={p.id} item={p} />
            ))}
          </ul>

          <Pagination page={filters.page} totalPages={totalPages} onPageChange={(p) => updateParam("page", p <= 1 ? "" : String(p))} />
        </>
      )}
    </div>
  )
}
