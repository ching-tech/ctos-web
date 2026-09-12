import { Pencil, Trash2 } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import type { Memory } from "@/lib/memory"
import { cn } from "@/lib/utils"

function formatDateTime(v: string): string {
  return new Date(v).toLocaleString("zh-TW", { hour12: false })
}

function MemoryCard({
  memory,
  busy,
  onToggle,
  onEdit,
  onDelete,
}: {
  memory: Memory
  busy: boolean
  onToggle: (active: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = React.useState(false)
  const contentRef = React.useRef<HTMLParagraphElement>(null)
  // 「展開」只在真的被截掉時才出現。用字數當門檻在手機會漏（同一段字在窄螢幕折三行以上、
  // 在桌機沒有），所以直接量三行夾住之後有沒有溢出。
  const [clamped, setClamped] = React.useState(false)
  React.useLayoutEffect(() => {
    const el = contentRef.current
    if (!el || expanded) return
    setClamped(el.scrollHeight > el.clientHeight + 1)
  }, [expanded, memory.content])

  return (
    <div className={cn("space-y-2 rounded-md border p-3", !memory.is_active && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Switch
            aria-label={`啟用「${memory.title}」`}
            checked={memory.is_active}
            disabled={busy}
            onCheckedChange={onToggle}
          />
          <span className="min-w-0 truncate font-medium">{memory.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="icon" aria-label={`編輯「${memory.title}」`} onClick={onEdit}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`刪除「${memory.title}」`} onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      </div>

      {/* 內容照原樣顯示（含換行），不做 Markdown 渲染：bot 讀進提示詞的就是這串純文字。 */}
      <p ref={contentRef} className={cn("text-sm whitespace-pre-wrap", !expanded && "line-clamp-3")}>
        {memory.content}
      </p>
      {(clamped || expanded) && (
        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "收合" : "展開"}
        </Button>
      )}

      <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
        <span>建立於 {formatDateTime(memory.created_at)}</span>
        {memory.created_by_name && <span>由 {memory.created_by_name} 建立</span>}
        {!memory.is_active && <span>已停用，bot 不會讀到</span>}
      </div>
    </div>
  )
}

export function MemoryList({
  memories,
  pendingId,
  onToggle,
  onEdit,
  onDelete,
}: {
  memories: Memory[]
  pendingId: string | null
  onToggle: (memory: Memory, active: boolean) => void
  onEdit: (memory: Memory) => void
  onDelete: (memory: Memory) => void
}) {
  return (
    <div className="space-y-3">
      {memories.map((m) => (
        <MemoryCard
          key={m.id}
          memory={m}
          busy={pendingId === m.id}
          onToggle={(active) => onToggle(m, active)}
          onEdit={() => onEdit(m)}
          onDelete={() => onDelete(m)}
        />
      ))}
    </div>
  )
}
