import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { getProjectSummary, listProjects, projectKeys, type ProjectListItem } from "@/lib/projects"

const ACTIVE_PROJECTS_DISPLAY_LIMIT = 5
// 後端清單依 updated_at DESC 排序，不是 end_date，所以撈後端允許的最大 page_size（100），
// 在前端依迄日排序後再截取前五，才不會漏掉迄日真正最早的專案。
const ACTIVE_PROJECTS_FETCH_PAGE_SIZE = 100

/** 進度條：與 pages/projects/list.tsx 的 ProgressBar 同樣式，沒有共用 Progress 元件。 */
function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  )
}

/** 依迄日升冪排序，null 排最後。 */
function sortByEndDate(items: ProjectListItem[]): ProjectListItem[] {
  return [...items].sort((a, b) => {
    if (a.end_date === b.end_date) return 0
    if (a.end_date === null) return 1
    if (b.end_date === null) return -1
    return a.end_date < b.end_date ? -1 : 1
  })
}

export function HomeActiveProjects() {
  const summaryQuery = useQuery({ queryKey: projectKeys.summary, queryFn: getProjectSummary })
  const listQuery = useQuery({
    queryKey: projectKeys.list({ status: "active", page: 1, pageSize: ACTIVE_PROJECTS_FETCH_PAGE_SIZE }),
    queryFn: () => listProjects({ status: "active", page: 1, pageSize: ACTIVE_PROJECTS_FETCH_PAGE_SIZE }),
  })

  const isLoading = summaryQuery.isLoading || listQuery.isLoading
  const firstError = summaryQuery.error ?? listQuery.error
  const isError = summaryQuery.isError || listQuery.isError
  const projects = listQuery.data ? sortByEndDate(listQuery.data.items).slice(0, ACTIVE_PROJECTS_DISPLAY_LIMIT) : []

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <h2 className="text-lg font-semibold">進行中專案</h2>
        {!isLoading && !isError && (
          <span className="text-sm text-muted-foreground tabular-nums">{summaryQuery.data?.active_count ?? 0}</span>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : isError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {firstError instanceof ApiError ? firstError.detail : "載入失敗，請稍後再試"}
            </AlertDescription>
          </Alert>
        ) : projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">目前沒有進行中的專案</p>
        ) : (
          <ul className="space-y-2">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <Link to={`/projects/${p.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                  {p.name}
                </Link>
                <div className="flex shrink-0 items-center gap-3">
                  <ProgressBar value={p.progress} />
                  <span className="text-muted-foreground tabular-nums">{p.end_date || "—"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link to="/projects?status=active" className="block text-sm text-primary underline underline-offset-4">
          查看全部專案
        </Link>
      </CardContent>
    </Card>
  )
}
