import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { CATEGORY_LABEL, kbKeys, label, listKnowledge, TYPE_LABEL, type ListFilters } from "@/lib/kb"
import type { ProjectDetail } from "@/lib/projects"

export default function KnowledgeTab({ project }: { project: ProjectDetail }) {
  const filters: ListFilters = { scope: "project", project_id: project.id }
  const query = useQuery({ queryKey: kbKeys.list(filters), queryFn: () => listKnowledge(filters) })

  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{query.isLoading ? "" : `共 ${total} 筆`}</p>
        <Button asChild variant="outline" size="sm">
          <Link to={`/kb/new?scope=project&project_id=${project.id}`}>新增條目</Link>
        </Button>
      </div>

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
        <p className="text-muted-foreground">還沒有專案知識</p>
      ) : (
        <ul className="space-y-2">
          {items.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <Link to={`/kb/${k.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                {k.title}
              </Link>
              <div className="flex items-center gap-2">
                <Badge variant="tint">{label(TYPE_LABEL, k.type)}</Badge>
                <Badge variant="outline">{label(CATEGORY_LABEL, k.category)}</Badge>
                <span className="text-muted-foreground">{k.updated_at}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
