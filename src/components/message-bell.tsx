import { useQuery } from "@tanstack/react-query"
import { Bell } from "lucide-react"
import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import { getUnreadCount, messageKeys } from "@/lib/messages"

/**
 * Header 的未讀訊息鈴鐺。
 *
 * 後端有 socket 事件 `message:unread_count`（ching-tech-os api/message_events.py 135–158），
 * 但 ctos-web 目前只在 AI 助手頁連 socket（見 README），所以這裡用輪詢：每分鐘一次，
 * 外加視窗重新取得焦點時補一次。要做到即時，改接 `message:unread_count` 就好。
 */
export function MessageBell({ className }: { className?: string }) {
  const query = useQuery({
    queryKey: messageKeys.unreadCount,
    queryFn: getUnreadCount,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    // 拿不到未讀數只是少一顆 badge，不值得讓它一直重試。
    retry: false,
  })
  const count = query.data?.count ?? 0
  const label = count > 0 ? `訊息中心，${count} 則未讀` : "訊息中心"

  return (
    <Button asChild variant="ghost" size="icon-sm" className={className}>
      <Link to="/messages?is_read=false" aria-label={label} title={label}>
        <span className="relative inline-flex">
          <Bell aria-hidden="true" />
          {count > 0 && (
            <span
              data-testid="unread-badge"
              className="absolute -top-1.5 -right-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-medium text-white tabular-nums"
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </span>
      </Link>
    </Button>
  )
}
