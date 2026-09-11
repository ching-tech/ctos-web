import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { KbCard } from "@/components/kb/kb-card"
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {recent.map((item) => (
              <KbCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
