import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { kbKeys, listKnowledge, type KnowledgeListItem } from "@/lib/kb"

const RECENT_COUNT = 5

export function HomeRecentKb() {
  const query = useQuery({ queryKey: kbKeys.list({}), queryFn: () => listKnowledge({}) })

  const recent: KnowledgeListItem[] = [...(query.data?.items ?? [])]
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
    .slice(0, RECENT_COUNT)

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <h2 className="text-lg font-semibold">知識庫最近更新</h2>
        <Link to="/kb" className="text-sm text-primary underline underline-offset-4">
          查看全部
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {query.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : query.isError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {query.error instanceof ApiError ? query.error.detail : "載入失敗，請稍後再試"}
            </AlertDescription>
          </Alert>
        ) : recent.length === 0 ? (
          <p className="text-muted-foreground">還沒有知識</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <Link to={`/kb/${item.id}`} className="min-w-0 truncate text-primary underline-offset-4 hover:underline">
                  {item.title}
                </Link>
                <span className="shrink-0 text-sm text-muted-foreground">{item.updated_at}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
