import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { Link, useLocation } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { aiManagementKeys, isBotPrompt, listPrompts, type AiPromptListItem } from "@/lib/ai-management"
import { ApiError } from "@/lib/api"
import { titleForPath } from "@/lib/nav"

function matches(p: AiPromptListItem, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [p.name, p.display_name, p.category, p.description].some((v) => (v ?? "").toLowerCase().includes(needle))
}

function fmtTime(v: string): string {
  return new Date(v).toLocaleString("zh-TW")
}

function PromptCard({ item }: { item: AiPromptListItem }) {
  return (
    <li className="space-y-2 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/prompts/${item.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
          {item.display_name || item.name}
        </Link>
        {item.category && <Badge variant="secondary">{item.category}</Badge>}
      </div>
      <p className="font-mono text-xs text-muted-foreground">{item.name}</p>
      {isBotPrompt(item.name) && <Badge variant="outline">bot 使用中</Badge>}
      <p className="text-sm">{item.description || "—"}</p>
      <p className="text-xs text-muted-foreground">更新於 {fmtTime(item.updated_at)}</p>
    </li>
  )
}

export default function PromptListPage() {
  const { pathname } = useLocation()
  const [q, setQ] = React.useState("")
  // 後端 `GET /api/ai/prompts` 沒有關鍵字參數（只有 category），所以搜尋是就地過濾整份清單。
  const query = useQuery({ queryKey: aiManagementKeys.promptList(), queryFn: () => listPrompts() })
  const items = query.data?.items ?? []
  const filtered = items.filter((p) => matches(p, q))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sr-only">{titleForPath(pathname)}</h1>
        <p className="text-sm text-muted-foreground">{query.isLoading ? "" : `共 ${filtered.length} 筆`}</p>
        <Button asChild>
          <Link to="/prompts/new">新增 Prompt</Link>
        </Button>
      </div>

      <Input
        aria-label="搜尋"
        placeholder="搜尋名稱、顯示名、分類、說明"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

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
        <p className="text-muted-foreground">{items.length === 0 ? "還沒有 Prompt" : "沒有符合的 Prompt"}</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  <TableHead>顯示名</TableHead>
                  <TableHead>分類</TableHead>
                  <TableHead>說明</TableHead>
                  <TableHead>更新時間</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">
                      <Link to={`/prompts/${p.id}`} className="text-primary underline-offset-4 hover:underline">
                        {p.name}
                      </Link>
                      {isBotPrompt(p.name) && (
                        <Badge variant="outline" className="ml-2">
                          bot 使用中
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{p.display_name || "—"}</TableCell>
                    <TableCell>{p.category ? <Badge variant="secondary">{p.category}</Badge> : "—"}</TableCell>
                    <TableCell className="max-w-96 truncate">{p.description || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtTime(p.updated_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {filtered.map((p) => (
              <PromptCard key={p.id} item={p} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
