import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Link, useNavigate, useParams } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ApiError } from "@/lib/api"
import { botKeys, deleteGroup, getGroup, listMessages, platformLabel, updateGroup, type BotMessage } from "@/lib/bot"

function SummaryRow({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-right break-words">{value}</dd>
    </div>
  )
}

function messageSender(m: BotMessage): string {
  if (m.is_from_bot) return "Bot"
  return m.user_display_name || "—"
}

function messageContent(m: BotMessage): string {
  if (m.message_type === "text") return m.content || "—"
  return `[${m.message_type}]`
}

export default function BotGroupDetailPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const detailQuery = useQuery({ queryKey: botKeys.group(id), queryFn: () => getGroup(id), retry: false })

  const aiMutation = useMutation({
    mutationFn: (allow: boolean) => updateGroup(id, { allow_ai_response: allow }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: botKeys.group(id) })
      queryClient.invalidateQueries({ queryKey: [...botKeys.all, "groups"] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteGroup(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: botKeys.group(id) })
      queryClient.invalidateQueries({ queryKey: [...botKeys.all, "groups"] })
      navigate("/bot?tab=groups")
    },
  })

  const messageFilter = { groupId: id, page: 1, pageSize: 20 }
  const messagesQuery = useQuery({
    queryKey: botKeys.messages(messageFilter),
    queryFn: () => listMessages(messageFilter),
    enabled: detailQuery.isSuccess,
  })

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (detailQuery.isError) {
    const err = detailQuery.error
    if (err instanceof ApiError && err.status === 404) {
      return (
        <div className="space-y-3">
          <p>找不到這個群組</p>
          <Link to="/bot?tab=groups" className="text-primary underline underline-offset-4">
            回群組清單
          </Link>
        </div>
      )
    }
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{err instanceof ApiError ? err.detail : "載入失敗，請稍後再試"}</AlertDescription>
      </Alert>
    )
  }

  const group = detailQuery.data!
  const messages = messagesQuery.data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link to="/bot?tab=groups" className="text-sm text-primary underline-offset-4 hover:underline">
          回群組清單
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{group.name || "未命名群組"}</h1>
          <Badge variant="tint">{platformLabel(group.platform_type)}</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">資訊</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <SummaryRow term="成員數" value={group.member_count ?? "—"} />
              <SummaryRow term="狀態" value={group.is_active ? "使用中" : "已離開"} />
              <SummaryRow term="加入時間" value={group.joined_at ? new Date(group.joined_at).toLocaleString("zh-TW") : "—"} />
              {group.left_at && <SummaryRow term="離開時間" value={new Date(group.left_at).toLocaleString("zh-TW")} />}
              <SummaryRow
                term="AI 回覆"
                value={
                  <Switch
                    aria-label="AI 回覆"
                    checked={group.allow_ai_response}
                    disabled={aiMutation.isPending}
                    onCheckedChange={(checked) => aiMutation.mutate(checked)}
                  />
                }
              />
              <SummaryRow term="專案" value={group.project_name || "未綁定專案（綁定功能待專案模組）"} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">最近訊息</CardTitle>
          </CardHeader>
          <CardContent>
            {messagesQuery.isError ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>
                  {messagesQuery.error instanceof ApiError ? messagesQuery.error.detail : "載入失敗，請稍後再試"}
                </AlertDescription>
              </Alert>
            ) : messagesQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-muted-foreground">暫無訊息</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {messages.map((m) => (
                  <li key={m.id} className="space-y-0.5 border-b pb-2 last:border-b-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{messageSender(m)}</span>
                      <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("zh-TW")}</span>
                    </div>
                    <p className="break-words">{messageContent(m)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">群組管理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {deleteMutation.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {deleteMutation.error instanceof ApiError ? deleteMutation.error.detail : "刪除失敗，請稍後再試"}
              </AlertDescription>
            </Alert>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">刪除群組</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>確定刪除這個群組？</AlertDialogTitle>
                <AlertDialogDescription>刪除群組將同時刪除所有訊息記錄</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()}>確定</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  )
}
