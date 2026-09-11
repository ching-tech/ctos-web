import { Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { chatTimeLabel, type Chat } from "@/lib/assistant"
import { cn } from "@/lib/utils"

/**
 * 對話清單。桌面固定在左欄，手機收進抽屜（`index.tsx` 的 Sheet），兩邊共用這一份。
 * 重新命名與刪除只往上拋事件，對話框放在頁面層，避免抽屜裡再開一層 modal。
 */
export function ChatList({
  chats,
  activeId,
  loading,
  creating,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  chats: Chat[]
  activeId: string | null
  loading: boolean
  creating: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (chat: Chat) => void
  onDelete: (chat: Chat) => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <Button className="w-full justify-start" variant="outline" onClick={onCreate} disabled={creating}>
        <Plus />
        新對話
      </Button>

      {loading ? (
        <div className="space-y-2 px-1">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : chats.length === 0 ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">還沒有對話，先開一個新對話。</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {chats.map((chat) => (
            <li key={chat.id} className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label={chat.title}
                aria-current={chat.id === activeId ? "true" : undefined}
                onClick={() => onSelect(chat.id)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                  chat.id === activeId && "bg-accent font-medium",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{chatTimeLabel(chat.updated_at)}</span>
              </button>
              <Button variant="ghost" size="icon" aria-label={`重新命名「${chat.title}」`} onClick={() => onRename(chat)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon" aria-label={`刪除「${chat.title}」`} onClick={() => onDelete(chat)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
