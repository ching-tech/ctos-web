import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Pagination } from "@/components/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { botKeys, listMessages, type MessageFilter, type Platform } from "@/lib/bot"

const PAGE_SIZE = 50

export default function MessagesTab({ platform }: { platform: Platform | "" }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawPage = searchParams.get("page")
  const page = rawPage ? Math.max(1, Number(rawPage) || 1) : 1

  function goToPage(p: number) {
    const next = new URLSearchParams(searchParams)
    if (p <= 1) next.delete("page")
    else next.set("page", String(p))
    setSearchParams(next)
  }

  const filter: MessageFilter = { platform, page }
  const query = useQuery({ queryKey: botKeys.messages(filter), queryFn: () => listMessages(filter) })

  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{query.isLoading ? "" : `共 ${total} 則`}</p>

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
        <p className="text-muted-foreground">沒有訊息</p>
      ) : (
        <>
          <ul className="divide-y rounded-lg border">
            {items.map((m) => (
              <li key={m.id} className="space-y-1 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {m.is_from_bot ? (
                      <Badge variant="tint">Bot</Badge>
                    ) : (
                      <span className="font-medium">{m.user_display_name || "—"}</span>
                    )}
                    {m.ai_processed && <Badge variant="tint">AI 已處理</Badge>}
                  </div>
                  <time className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("zh-TW")}</time>
                </div>
                <p className="text-sm">{m.message_type === "text" ? m.content || "—" : `[${m.message_type}]`}</p>
              </li>
            ))}
          </ul>

          <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
        </>
      )}
    </div>
  )
}
