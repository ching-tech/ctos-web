import { useQuery } from "@tanstack/react-query"
import { Link, useLocation, useSearchParams } from "react-router"
import { Pagination } from "@/components/pagination"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import {
  erpKeys,
  erpLabel,
  erpTint,
  formatAmount,
  listParties,
  listPurchaseOrders,
  PO_PAGE_SIZE,
  PO_STATUS_LABEL,
  PO_STATUS_OPTIONS,
  PO_STATUS_TINT,
  SUPPLIER_PAGE_SIZE,
  type PartyFilters,
  type PurchaseOrderFilters,
  type PurchaseOrderListItem,
  type PurchaseOrderStatus,
} from "@/lib/erp"
import { titleForPath } from "@/lib/nav"
import { listProjects, projectKeys, type ProjectFilters } from "@/lib/projects"

const ALL = "all"

// 供應商下拉吃往來對象清單的 role=supplier（後端 list_parties 的 query 是 role，
// 沒有 is_supplier 這個參數）。要 vendor-management 權限，拿不到就停用下拉。
const SUPPLIER_FILTERS: PartyFilters = { role: "supplier", page: 1, pageSize: SUPPLIER_PAGE_SIZE }
// 專案下拉要 project-management 權限，拿不到一樣停用。
const PROJECT_FILTERS: ProjectFilters = { page: 1, pageSize: 100 }

function filtersFromParams(params: URLSearchParams): PurchaseOrderFilters {
  const rawPage = params.get("page")
  const status = params.get("status")
  return {
    status: (PO_STATUS_OPTIONS as string[]).includes(status ?? "") ? (status as PurchaseOrderStatus) : undefined,
    supplierId: params.get("supplier_id") || undefined,
    projectId: params.get("project_id") || undefined,
    page: rawPage ? Math.max(1, Number(rawPage) || 1) : 1,
  }
}

function SupplierLink({ po }: { po: Pick<PurchaseOrderListItem, "supplier_id" | "supplier_name"> }) {
  if (!po.supplier_name) return <span className="text-muted-foreground">—</span>
  return (
    <Link to={`/parties/${po.supplier_id}`} className="text-primary underline-offset-4 hover:underline">
      {po.supplier_name}
    </Link>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="tint" className={erpTint(PO_STATUS_TINT, status)}>
      {erpLabel(PO_STATUS_LABEL, status)}
    </Badge>
  )
}

function PoCard({ po }: { po: PurchaseOrderListItem }) {
  return (
    <li className="space-y-2 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/purchase-orders/${po.id}`} className="font-mono font-medium text-primary underline-offset-4 hover:underline">
          {po.po_no}
        </Link>
        <StatusBadge status={po.status} />
      </div>
      <dl className="space-y-1 text-sm">
        <div className="flex items-start justify-between gap-2">
          <dt className="shrink-0 text-muted-foreground">供應商</dt>
          <dd className="min-w-0 text-right break-words">
            <SupplierLink po={po} />
          </dd>
        </div>
        <div className="flex items-start justify-between gap-2">
          <dt className="shrink-0 text-muted-foreground">專案</dt>
          <dd className="min-w-0 text-right break-words">{po.project_name || "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">下單日</dt>
          <dd className="tabular-nums">{po.order_date || "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">預計到貨</dt>
          <dd className="tabular-nums">{po.expected_date || "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">行項</dt>
          <dd className="tabular-nums">{po.line_count}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">金額</dt>
          <dd className="tabular-nums">{formatAmount(po.total_amount)}</dd>
        </div>
      </dl>
    </li>
  )
}

export default function PurchaseOrderListPage() {
  const { pathname } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = filtersFromParams(searchParams)

  const query = useQuery({ queryKey: erpKeys.poList(filters), queryFn: () => listPurchaseOrders(filters) })
  const suppliersQuery = useQuery({
    queryKey: erpKeys.partyList(SUPPLIER_FILTERS),
    queryFn: () => listParties(SUPPLIER_FILTERS),
    retry: false,
  })
  const projectsQuery = useQuery({
    queryKey: projectKeys.list(PROJECT_FILTERS),
    queryFn: () => listProjects(PROJECT_FILTERS),
    retry: false,
  })

  const orders = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / (filters.pageSize ?? PO_PAGE_SIZE)))
  const suppliers = suppliersQuery.data?.items ?? []
  const projects = projectsQuery.data?.items ?? []

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== "page") next.delete("page")
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sr-only">{titleForPath(pathname)}</h1>
        <p className="text-sm text-muted-foreground">{query.isLoading ? "" : `共 ${total} 筆`}</p>
        {/* 讀寫同一把權限：進得來這頁就寫得動（api/erp.py 的 require_inventory_access） */}
        <Button asChild>
          <Link to="/purchase-orders/new">新增採購單</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filters.status || ALL} onValueChange={(v) => updateParam("status", v === ALL ? "" : v)}>
          <SelectTrigger className="w-36" aria-label="狀態篩選">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部狀態</SelectItem>
            {PO_STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {PO_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.supplierId || ALL}
          onValueChange={(v) => updateParam("supplier_id", v === ALL ? "" : v)}
          disabled={suppliersQuery.isError}
        >
          <SelectTrigger className="w-48" aria-label="供應商篩選">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部供應商</SelectItem>
            {suppliers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.projectId || ALL}
          onValueChange={(v) => updateParam("project_id", v === ALL ? "" : v)}
          disabled={projectsQuery.isError}
        >
          <SelectTrigger className="w-48" aria-label="專案篩選">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部專案</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(suppliersQuery.isError || projectsQuery.isError) && (
        <p className="text-sm text-muted-foreground">
          {suppliersQuery.isError && "沒有往來對象權限，無法用供應商篩選。"}
          {projectsQuery.isError && "沒有專案權限，無法用專案篩選。"}
        </p>
      )}

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
      ) : orders.length === 0 ? (
        <p className="text-muted-foreground">還沒有採購單</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>單號</TableHead>
                  <TableHead>供應商</TableHead>
                  <TableHead>專案</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>下單日</TableHead>
                  <TableHead>預計到貨</TableHead>
                  {/* 清單端點只回 line_count；已收／應收要逐張抓明細才算得出來，見 README */}
                  <TableHead className="text-right">行項</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell>
                      <Link to={`/purchase-orders/${po.id}`} className="font-mono text-primary underline-offset-4 hover:underline">
                        {po.po_no}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <SupplierLink po={po} />
                    </TableCell>
                    <TableCell>{po.project_name || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={po.status} />
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">{po.order_date || "—"}</TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">{po.expected_date || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{po.line_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(po.total_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {orders.map((po) => (
              <PoCard key={po.id} po={po} />
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
