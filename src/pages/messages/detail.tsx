import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Link, useParams } from "react-router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import {
  getMessage,
  markRead,
  messageKeys,
  SEVERITY_CLASS,
  SEVERITY_LABEL,
  SOURCE_LABEL,
} from "@/lib/messages"

function SummaryRow({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-right break-words">{value}</dd>
    </div>
  )
}

export default function MessageDetailPage() {
  const { id = "" } = useParams()
  const messageId = Number(id)
  const queryClient = useQueryClient()
  const [metadataOpen, setMetadataOpen] = React.useState(false)

  const detailQuery = useQuery({
    queryKey: messageKeys.detail(messageId),
    queryFn: () => getMessage(messageId),
    retry: false,
    enabled: Number.isInteger(messageId) && messageId > 0,
  })

  const mark = useMutation({
    mutationFn: (body: Parameters<typeof markRead>[0]) => markRead(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: messageKeys.all })
    },
  })

  /*
    後端的 `GET /api/messages/{id}`（ching-tech-os api/messages.py 116–146）只讀不寫，
    不會順手標已讀，所以由前端補一次 `mark-read {ids:[id]}`。
    用 ref 記住已經送過的 id：invalidate 之後這支 query 會重抓，重抓回來的那一刻
    `is_read` 可能還是舊值，沒有這道閘會一直重送。
  */
  const markedRef = React.useRef<number | null>(null)
  const isUnread = detailQuery.data?.is_read === false
  const markMutate = mark.mutate
  React.useEffect(() => {
    if (!isUnread) return
    if (markedRef.current === messageId) return
    markedRef.current = messageId
    markMutate({ ids: [messageId] })
  }, [isUnread, messageId, markMutate])

  if (!Number.isInteger(messageId) || messageId <= 0) {
    return (
      <div className="space-y-3">
        <p>找不到這則訊息</p>
        <Link to="/messages" className="text-primary underline underline-offset-4">
          回清單
        </Link>
      </div>
    )
  }

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
          <p>找不到這則訊息</p>
          <Link to="/messages" className="text-primary underline underline-offset-4">
            回清單
          </Link>
        </div>
      )
    }
    return <p className="text-destructive">{err instanceof ApiError ? err.detail : "載入失敗，請稍後再試"}</p>
  }

  if (!detailQuery.data) return null
  const message = detailQuery.data

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link to="/messages" className="text-sm text-primary underline-offset-4 hover:underline">
          回清單
        </Link>
        <h1 className="text-2xl font-semibold break-words">{message.title}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">摘要</CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            <SummaryRow
              term="嚴重程度"
              value={
                <Badge variant="tint" className={SEVERITY_CLASS[message.severity]}>
                  {SEVERITY_LABEL[message.severity]}
                </Badge>
              }
            />
            <SummaryRow term="來源" value={SOURCE_LABEL[message.source]} />
            <SummaryRow term="分類" value={message.category || "—"} />
            <SummaryRow term="時間" value={new Date(message.created_at).toLocaleString("zh-TW")} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">內容</CardTitle>
        </CardHeader>
        <CardContent>
          {message.content ? (
            <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
          ) : (
            <p className="text-sm text-muted-foreground">沒有內容</p>
          )}
        </CardContent>
      </Card>

      {message.metadata && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <Button variant="ghost" onClick={() => setMetadataOpen((v) => !v)} aria-expanded={metadataOpen}>
                附加資料
              </Button>
            </CardTitle>
          </CardHeader>
          {metadataOpen && (
            <CardContent>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(message.metadata, null, 2)}
              </pre>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  )
}
