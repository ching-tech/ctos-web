import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { getProjectSummary, projectKeys } from "@/lib/projects"

export function HomeOverdueMilestones() {
  // 與 HomeActiveProjects 用同一個 queryKey，react-query 會合併成一次請求。
  const query = useQuery({ queryKey: projectKeys.summary, queryFn: getProjectSummary })
  const milestones = query.data?.overdue_milestones ?? []

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">逾期里程碑</h2>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : query.isError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {query.error instanceof ApiError ? query.error.detail : "載入失敗，請稍後再試"}
            </AlertDescription>
          </Alert>
        ) : milestones.length === 0 ? (
          <p className="text-sm text-muted-foreground">沒有逾期的里程碑</p>
        ) : (
          <ul className="space-y-2">
            {milestones.map((m) => (
              <li key={m.milestone_id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.name}</p>
                  <Link
                    to={`/projects/${m.project_id}?tab=overview`}
                    className="text-muted-foreground underline-offset-4 hover:underline"
                  >
                    {m.project_name}
                  </Link>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-muted-foreground tabular-nums">{m.due_date}</span>
                  <Badge variant="destructive">逾期 {m.days_overdue} 天</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
