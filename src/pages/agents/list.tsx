import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { Link, useLocation } from "react-router"
import { ProviderStatusCard } from "@/components/ai-management/provider-status-card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { aiManagementKeys, listAgents, type AiAgentListItem } from "@/lib/ai-management"
import { ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { titleForPath } from "@/lib/nav"

function matches(a: AiAgentListItem, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [a.name, a.display_name, a.model, ...(a.tools ?? [])].some((v) => (v ?? "").toLowerCase().includes(needle))
}

function fmtTime(v: string): string {
  return new Date(v).toLocaleString("zh-TW")
}

function ActiveBadge({ active }: { active: boolean }) {
  return <Badge variant={active ? "secondary" : "outline"}>{active ? "啟用" : "停用"}</Badge>
}

function AgentCard({ item }: { item: AiAgentListItem }) {
  return (
    <li className="space-y-2 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/agents/${item.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
          {item.display_name || item.name}
        </Link>
        <ActiveBadge active={item.is_active} />
      </div>
      <p className="font-mono text-xs text-muted-foreground">{item.name}</p>
      <p className="text-sm">模型 {item.model}</p>
      <p className="text-sm text-muted-foreground">工具 {item.tools?.length ? item.tools.join("、") : "—"}</p>
      <p className="text-xs text-muted-foreground">更新於 {fmtTime(item.updated_at)}</p>
    </li>
  )
}

export default function AgentListPage() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const [q, setQ] = React.useState("")
  const query = useQuery({ queryKey: aiManagementKeys.agentList, queryFn: listAgents })
  const items = query.data?.items ?? []
  const filtered = items.filter((a) => matches(a, q))

  return (
    <div className="space-y-4">
      {/* 只有管理員打得到 providers/status，非管理員連請求都不送。 */}
      {user?.is_admin && <ProviderStatusCard />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sr-only">{titleForPath(pathname)}</h1>
        <p className="text-sm text-muted-foreground">{query.isLoading ? "" : `共 ${filtered.length} 筆`}</p>
        <Button asChild>
          <Link to="/agents/new">新增 Agent</Link>
        </Button>
      </div>

      <Input aria-label="搜尋" placeholder="搜尋名稱、顯示名、模型、工具" value={q} onChange={(e) => setQ(e.target.value)} />

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
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">{items.length === 0 ? "還沒有 Agent" : "沒有符合的 Agent"}</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  <TableHead>顯示名</TableHead>
                  <TableHead>模型</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>工具</TableHead>
                  <TableHead>更新時間</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">
                      <Link to={`/agents/${a.id}`} className="text-primary underline-offset-4 hover:underline">
                        {a.name}
                      </Link>
                    </TableCell>
                    <TableCell>{a.display_name || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{a.model}</TableCell>
                    <TableCell>
                      <ActiveBadge active={a.is_active} />
                    </TableCell>
                    <TableCell className="max-w-72 truncate">{a.tools?.length ? a.tools.join("、") : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtTime(a.updated_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {filtered.map((a) => (
              <AgentCard key={a.id} item={a} />
            ))}
          </ul>
        </>
      )}

      {/* 清單端點 `AiAgentListItem` 沒有 `system_prompt_id`，關聯的 Prompt 要進明細才看得到。 */}
      <p className="text-xs text-muted-foreground">關聯的 Prompt 請進 Agent 明細查看（清單端點沒有回這個欄位）。</p>
    </div>
  )
}
