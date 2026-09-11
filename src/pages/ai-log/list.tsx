import { useQuery } from "@tanstack/react-query"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Pagination } from "@/components/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { titleForPath } from "@/lib/nav"
import {
  aiLogKeys,
  CONTEXT_LABEL,
  contextLabel,
  getLogStats,
  listAgents,
  listLogs,
  listUsers,
  type LogFilters,
} from "@/lib/ai-log"
import { ApiError } from "@/lib/api"

const PAGE_SIZE = 50
const SUCCESS_OPTIONS: { value: "true" | "false"; label: string }[] = [
  { value: "true", label: "成功" },
  { value: "false", label: "失敗" },
]

function filtersFromParams(params: URLSearchParams): LogFilters {
  const rawSuccess = params.get("success")
  const success = rawSuccess === "true" || rawSuccess === "false" ? rawSuccess : undefined
  const rawPage = params.get("page")
  // user 可能是 "0"（未記錄使用者），不能用 || undefined 這種 truthy 判斷把它吃掉
  const rawUser = params.get("user")
  const user = rawUser !== null && /^\d+$/.test(rawUser) ? Number(rawUser) : undefined
  return {
    agent: params.get("agent") || undefined,
    context: params.get("context") || undefined,
    success,
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    page: rawPage ? Math.max(1, Number(rawPage) || 1) : undefined,
    user,
  }
}

function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  return n.toLocaleString("zh-TW")
}

export default function AiLogListPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = filtersFromParams(searchParams)
  const page = filters.page ?? 1

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete("page")
    setSearchParams(next, { replace: true })
  }

  function goToPage(p: number) {
    const next = new URLSearchParams(searchParams)
    if (p <= 1) next.delete("page")
    else next.set("page", String(p))
    setSearchParams(next)
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  const statsFilters = { agent: filters.agent, from: filters.from, to: filters.to, user: filters.user }
  const agentsQuery = useQuery({ queryKey: aiLogKeys.agents, queryFn: listAgents })
  const usersQuery = useQuery({ queryKey: aiLogKeys.users, queryFn: listUsers })
  const statsQuery = useQuery({ queryKey: aiLogKeys.stats(statsFilters), queryFn: () => getLogStats(statsFilters) })
  const listQuery = useQuery({ queryKey: aiLogKeys.list(filters), queryFn: () => listLogs(filters) })

  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const stats = statsQuery.data
  const agentLabelById = new Map(
    (agentsQuery.data?.items ?? []).map((a) => [a.id, a.display_name || a.name]),
  )
  function agentLabel(item: { agent_id: string | null; agent_name: string | null }): string {
    if (item.agent_id) {
      const byId = agentLabelById.get(item.agent_id)
      if (byId) return byId
    }
    return item.agent_name || "—"
  }
  const userLabelById = new Map(
    (usersQuery.data?.users ?? []).map((u) => [u.id, u.display_name || u.username]),
  )
  function userLabel(item: { user_id: number | null; username: string | null }): string {
    if (item.user_id !== null) {
      const byId = userLabelById.get(item.user_id)
      if (byId) return byId
    }
    return item.username || "—"
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sr-only">{titleForPath(pathname)}</h1>
        <p className="text-sm text-muted-foreground">{listQuery.isLoading ? "" : `共 ${total.toLocaleString("zh-TW")} 筆`}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">呼叫次數</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{fmtNumber(stats?.total_calls)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">成功率</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? `${Math.round(stats.success_rate)}%` : "—"}
            </div>
            {stats && (
              <p className="text-xs text-muted-foreground">
                {fmtNumber(stats.success_count)} 成功／{fmtNumber(stats.failure_count)} 失敗
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">平均耗時</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {stats?.avg_duration_ms != null ? `${Math.round(stats.avg_duration_ms).toLocaleString("zh-TW")}ms` : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">Token</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {stats ? `${fmtNumber(stats.total_input_tokens)} 進／${fmtNumber(stats.total_output_tokens)} 出` : "—"}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filters.agent || "all"} onValueChange={(v) => updateFilter("agent", v === "all" ? "" : v)}>
          <SelectTrigger className="w-32" aria-label="Agent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            {(agentsQuery.data?.items ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.display_name || a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.context || "all"} onValueChange={(v) => updateFilter("context", v === "all" ? "" : v)}>
          <SelectTrigger className="w-32" aria-label="情境">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            {Object.entries(CONTEXT_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.success || "all"} onValueChange={(v) => updateFilter("success", v === "all" ? "" : v)}>
          <SelectTrigger className="w-28" aria-label="結果">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            {SUCCESS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.user === undefined ? "all" : String(filters.user)}
          onValueChange={(v) => updateFilter("user", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-36" aria-label="使用者">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="0">未記錄使用者</SelectItem>
            {(usersQuery.data?.users ?? []).map((u) => (
              <SelectItem key={u.id} value={String(u.id)}>
                {u.display_name || u.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          type="date"
          aria-label="起日"
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          value={filters.from ?? ""}
          onChange={(e) => updateFilter("from", e.target.value)}
        />
        <input
          type="date"
          aria-label="迄日"
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          value={filters.to ?? ""}
          onChange={(e) => updateFilter("to", e.target.value)}
        />
        <Button variant="outline" onClick={clearFilters}>
          清除篩選
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">統計只套用 Agent 與日期篩選</p>

      {listQuery.isError ? (
        <Alert variant="destructive">
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
      ) : (
        <>
          {items.length === 0 ? (
            <p className="text-muted-foreground">沒有符合的紀錄</p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>時間</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>情境</TableHead>
                    <TableHead>模型</TableHead>
                    <TableHead>結果</TableHead>
                    <TableHead>耗時</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>工具</TableHead>
                    <TableHead>使用者</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const time = new Date(item.created_at).toLocaleString("zh-TW")
                    return (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/ai-log/${item.id}`)}
                      >
                        <TableCell>
                          <Link
                            to={`/ai-log/${item.id}`}
                            aria-label={`${time} ${item.agent_name ?? item.id}`}
                            className="text-primary underline-offset-4 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {time}
                          </Link>
                        </TableCell>
                        <TableCell>{agentLabel(item)}</TableCell>
                        <TableCell>{contextLabel(item.context_type)}</TableCell>
                        <TableCell>{item.model || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={item.success ? "tint" : "destructive"} className={item.success ? "text-emerald-600 dark:text-emerald-400" : undefined}>
                            {item.success ? "成功" : "失敗"}
                          </Badge>
                        </TableCell>
                        <TableCell>{item.duration_ms != null ? `${item.duration_ms.toLocaleString("zh-TW")}ms` : "—"}</TableCell>
                        <TableCell>
                          {fmtNumber(item.input_tokens)}/{fmtNumber(item.output_tokens)}
                        </TableCell>
                        <TableCell>{item.used_tools?.length ?? 0}</TableCell>
                        <TableCell>{userLabel(item)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
        </>
      )}
    </div>
  )
}
