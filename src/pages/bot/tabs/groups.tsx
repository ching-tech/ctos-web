import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useSearchParams } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Pagination } from "@/components/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import { botKeys, listGroups, platformLabel, updateGroup, type BotGroup, type ListFilter, type Platform } from "@/lib/bot"

const PAGE_SIZE = 20

function GroupAiSwitch({ group }: { group: BotGroup }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (allow: boolean) => updateGroup(group.id, { allow_ai_response: allow }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...botKeys.all, "groups"] })
      queryClient.invalidateQueries({ queryKey: botKeys.group(group.id) })
    },
  })

  return (
    <Switch
      aria-label="AI 回覆"
      checked={group.allow_ai_response}
      disabled={mutation.isPending}
      onCheckedChange={(checked) => mutation.mutate(checked)}
    />
  )
}

export default function GroupsTab({ platform }: { platform: Platform | "" }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawPage = searchParams.get("page")
  const page = rawPage ? Math.max(1, Number(rawPage) || 1) : 1

  function goToPage(p: number) {
    const next = new URLSearchParams(searchParams)
    if (p <= 1) next.delete("page")
    else next.set("page", String(p))
    setSearchParams(next)
  }

  const filter: ListFilter = { platform, page }
  const query = useQuery({ queryKey: botKeys.groups(filter), queryFn: () => listGroups(filter) })

  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{query.isLoading ? "" : `共 ${total} 個群組`}</p>

      {query.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{query.error instanceof ApiError ? query.error.detail : "載入失敗，請稍後再試"}</AlertDescription>
        </Alert>
      ) : query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">沒有群組</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>群組名</TableHead>
                  <TableHead>平台</TableHead>
                  <TableHead>成員數</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>AI 回覆</TableHead>
                  <TableHead>專案</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <Link to={`/bot/groups/${g.id}`} className="text-primary underline-offset-4 hover:underline">
                        {g.name || "未命名群組"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="tint">{platformLabel(g.platform_type)}</Badge>
                    </TableCell>
                    <TableCell>{g.member_count ?? "—"}</TableCell>
                    <TableCell>{g.is_active ? "使用中" : "已離開"}</TableCell>
                    <TableCell>
                      <GroupAiSwitch group={g} />
                    </TableCell>
                    <TableCell>{g.project_name || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
        </>
      )}
    </div>
  )
}
