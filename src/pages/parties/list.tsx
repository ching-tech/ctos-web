import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { Link, useLocation, useSearchParams } from "react-router"
import { Pagination } from "@/components/pagination"
import { PartyRoleBadges } from "@/components/parties/role-badges"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import {
  erpKeys,
  listParties,
  PARTY_PAGE_SIZE,
  PARTY_ROLE_LABEL,
  PARTY_ROLE_OPTIONS,
  type PartyFilters,
  type PartyListItem,
  type PartyRole,
} from "@/lib/erp"
import { titleForPath } from "@/lib/nav"

const SEARCH_DEBOUNCE_MS = 300

function roleFromParams(params: URLSearchParams): PartyRole | "" {
  const raw = params.get("role")
  return (PARTY_ROLE_OPTIONS as string[]).includes(raw ?? "") ? (raw as PartyRole) : ""
}

function filtersFromParams(params: URLSearchParams): PartyFilters {
  const rawPage = params.get("page")
  return {
    role: roleFromParams(params),
    q: params.get("q") || undefined,
    page: rawPage ? Math.max(1, Number(rawPage) || 1) : 1,
  }
}

function PartyCard({ item }: { item: PartyListItem }) {
  return (
    <li className="space-y-2 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/parties/${item.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
          {item.name}
        </Link>
        <PartyRoleBadges party={item} />
      </div>
      <dl className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">簡稱</dt>
          <dd>{item.short_name || "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">主要聯絡人</dt>
          <dd>{item.primary_contact || "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">電話</dt>
          <dd>{item.primary_phone || "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">統一編號</dt>
          <dd className="tabular-nums">{item.tax_id || "—"}</dd>
        </div>
      </dl>
    </li>
  )
}

export default function PartyListPage() {
  const { pathname } = useLocation()
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

  const query = useQuery({ queryKey: erpKeys.partyList(filters), queryFn: () => listParties(filters) })
  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / (filters.pageSize ?? PARTY_PAGE_SIZE)))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sr-only">{titleForPath(pathname)}</h1>
        <p className="text-sm text-muted-foreground">{query.isLoading ? "" : `共 ${total} 筆`}</p>
        {/* 讀寫同一把權限：進得來這頁就寫得動（api/erp.py 的 require_vendor_access） */}
        <Button asChild>
          <Link to="/parties/new">新增往來對象</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="搜尋"
          // 後端 list_parties 的模糊搜尋只打這四個欄位
          placeholder="搜尋名稱、簡稱、別名與統一編號"
          className="min-w-48 flex-1"
          value={draftQ}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearchEnter()
          }}
        />
        <Select value={filters.role || "all"} onValueChange={(v) => updateParam("role", v === "all" ? "" : v)}>
          <SelectTrigger className="w-28" aria-label="角色篩選">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            {PARTY_ROLE_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {PARTY_ROLE_LABEL[r]}
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
        <p className="text-muted-foreground">還沒有往來對象</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  <TableHead>簡稱</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>主要聯絡人</TableHead>
                  <TableHead>電話</TableHead>
                  <TableHead>統一編號</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link to={`/parties/${p.id}`} className="text-primary underline-offset-4 hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>{p.short_name || "—"}</TableCell>
                    <TableCell>
                      <PartyRoleBadges party={p} />
                    </TableCell>
                    <TableCell>{p.primary_contact || "—"}</TableCell>
                    <TableCell>{p.primary_phone || "—"}</TableCell>
                    <TableCell className="tabular-nums">{p.tax_id || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {items.map((p) => (
              <PartyCard key={p.id} item={p} />
            ))}
          </ul>

          <Pagination page={filters.page} totalPages={totalPages} onPageChange={(p) => updateParam("page", p <= 1 ? "" : String(p))} />
        </>
      )}
    </div>
  )
}
