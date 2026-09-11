import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { aiLogKeys, getLogStats } from "@/lib/ai-log"

function localToday(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}

export function HomeAiUsage() {
  const today = localToday()
  const filters = { from: today, to: today }
  const query = useQuery({ queryKey: aiLogKeys.stats(filters), queryFn: () => getLogStats(filters) })
  const stats = query.data

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <h2 className="text-lg font-semibold">今日 AI 用量</h2>
        <Link to={`/ai-log?from=${today}&to=${today}`} className="text-sm text-primary underline underline-offset-4">
          查看 AI Log
        </Link>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : query.isError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {query.error instanceof ApiError ? query.error.detail : "載入失敗，請稍後再試"}
            </AlertDescription>
          </Alert>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="呼叫次數" value={String(stats.total_calls)} />
            <Stat label="成功率" value={`${Math.round(stats.success_rate)}%`} />
            <Stat label="平均耗時" value={stats.avg_duration_ms == null ? "—" : `${stats.avg_duration_ms} ms`} />
            <Stat label="Token 進／出" value={`${stats.total_input_tokens} / ${stats.total_output_tokens}`} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
