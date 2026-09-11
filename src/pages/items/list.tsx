import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { Link, useLocation, useSearchParams } from "react-router"
import { Pagination } from "@/components/pagination"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import {
  erpKeys,
  formatQty,
  ITEM_PAGE_SIZE,
  itemGroupOptions,
  listItems,
  type ItemFilters,
  type ItemListItem,
} from "@/lib/erp"
import { titleForPath } from "@/lib/nav"

const SEARCH_DEBOUNCE_MS = 300
const ALL_GROUPS = "all"

function filtersFromParams(params: URLSearchParams): ItemFilters {
  const rawPage = params.get("page")
  return {
    q: params.get("q") || undefined,
    itemGroup: params.get("item_group") || undefined,
    page: rawPage ? Math.max(1, Number(rawPage) || 1) : 1,
  }
}

function SupplierLink({ item }: { item: Pick<ItemListItem, "default_supplier_id" | "default_supplier_name"> }) {
  if (!item.default_supplier_id || !item.default_supplier_name) return <span className="text-muted-foreground">—</span>
  return (
    <Link to={`/parties/${item.default_supplier_id}`} className="text-primary underline-offset-4 hover:underline">
      {item.default_supplier_name}
    </Link>
  )
}

function ItemCard({ item }: { item: ItemListItem }) {
  return (
    <li className="space-y-2 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/items/${item.id}`} className="font-mono font-medium text-primary underline-offset-4 hover:underline">
          {item.code}
        </Link>
        <span className="tabular-nums">{formatQty(item.total_qty)}</span>
      </div>
      <dl className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">品名</dt>
          <dd>{item.name}</dd>
        </div>
        <div className="flex items-start justify-between gap-2">
          <dt className="shrink-0 text-muted-foreground">規格</dt>
          <dd className="min-w-0 text-right break-words">{item.spec || "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">單位</dt>
          <dd>{item.unit || "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">分類</dt>
          <dd>{item.item_group || "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">預設供應商</dt>
          <dd>
            <SupplierLink item={item} />
          </dd>
        </div>
      </dl>
    </li>
  )
}

export default function ItemListPage() {
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

  const query = useQuery({ queryKey: erpKeys.itemList(filters), queryFn: () => listItems(filters) })
  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / (filters.pageSize ?? ITEM_PAGE_SIZE)))
  // 後端沒有分類端點，選項從當頁資料收集；篩選中的那個值即使不在當頁也要留著
  const groups = itemGroupOptions(items)
  const groupOptions = filters.itemGroup && !groups.includes(filters.itemGroup) ? [filters.itemGroup, ...groups] : groups

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sr-only">{titleForPath(pathname)}</h1>
        <p className="text-sm text-muted-foreground">{query.isLoading ? "" : `共 ${total} 筆`}</p>
        {/* 讀寫同一把權限：進得來這頁就寫得動（api/erp.py 的 require_inventory_access） */}
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/warehouses">倉庫</Link>
          </Button>
          <Button asChild>
            <Link to="/items/new">新增物料</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="搜尋"
          // 後端 list_items：料號／品名／規格／別名四欄走 ILIKE
          placeholder="搜尋料號、品名、規格、別名"
          className="min-w-48 flex-1"
          value={draftQ}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearchEnter()
          }}
        />
        <Select
          value={filters.itemGroup || ALL_GROUPS}
          onValueChange={(v) => updateParam("item_group", v === ALL_GROUPS ? "" : v)}
        >
          <SelectTrigger className="w-40" aria-label="分類篩選">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_GROUPS}>全部分類</SelectItem>
            {groupOptions.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
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
        <p className="text-muted-foreground">還沒有物料</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>料號</TableHead>
                  <TableHead>品名</TableHead>
                  <TableHead>規格</TableHead>
                  <TableHead>單位</TableHead>
                  <TableHead>分類</TableHead>
                  <TableHead>預設供應商</TableHead>
                  <TableHead className="text-right">總庫存</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      <Link to={`/items/${it.id}`} className="font-mono text-primary underline-offset-4 hover:underline">
                        {it.code}
                      </Link>
                    </TableCell>
                    <TableCell>{it.name}</TableCell>
                    <TableCell>{it.spec || "—"}</TableCell>
                    <TableCell>{it.unit || "—"}</TableCell>
                    <TableCell>{it.item_group || "—"}</TableCell>
                    <TableCell>
                      <SupplierLink item={it} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatQty(it.total_qty)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {items.map((it) => (
              <ItemCard key={it.id} item={it} />
            ))}
          </ul>

          <Pagination
            page={filters.page}
            totalPages={totalPages}
            onPageChange={(p) => updateParam("page", p <= 1 ? "" : String(p))}
          />
        </>
      )}
    </div>
  )
}
