import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { botKeys, getBindingStatus, listBlockedUsers, listGroups } from "@/lib/bot"

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}

export function HomeBotSummary() {
  const groupsQuery = useQuery({ queryKey: botKeys.groups({ page: 1 }), queryFn: () => listGroups({ page: 1 }) })
  const blockedQuery = useQuery({ queryKey: botKeys.blocked({ page: 1 }), queryFn: () => listBlockedUsers({ page: 1 }) })
  const bindingQuery = useQuery({ queryKey: botKeys.binding, queryFn: getBindingStatus })

  const isLoading = groupsQuery.isLoading || blockedQuery.isLoading || bindingQuery.isLoading
  const firstError = groupsQuery.error ?? blockedQuery.error ?? bindingQuery.error
  const isError = groupsQuery.isError || blockedQuery.isError || bindingQuery.isError

  const lineBound = bindingQuery.data?.line?.is_bound ?? false
  const telegramBound = bindingQuery.data?.telegram?.is_bound ?? false

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <h2 className="text-lg font-semibold">Bot 概況</h2>
        <Link to="/bot" className="text-sm text-primary underline underline-offset-4">
          前往 Bot 管理
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : isError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {firstError instanceof ApiError ? firstError.detail : "載入失敗，請稍後再試"}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="群組數" value={String(groupsQuery.data?.total ?? 0)} />
            <Stat label="黑名單" value={String(blockedQuery.data?.total ?? 0)} />
            <div>
              <p className="text-xs text-muted-foreground">我的綁定</p>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge variant="tint">Line {lineBound ? "已綁定" : "未綁定"}</Badge>
                <Badge variant="tint">Telegram {telegramBound ? "已綁定" : "未綁定"}</Badge>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
