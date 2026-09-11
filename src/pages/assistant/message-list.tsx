import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ToolCallList } from "@/components/ai-log/tool-calls"
import type { ToolCallEntry } from "@/lib/ai-log"
import type { ChatMessage } from "@/lib/assistant"
import { cn } from "@/lib/utils"

/** 助手訊息用 Markdown 渲染；這裡不改寫圖片路徑（那是知識庫附件才需要的事）。 */
function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="md max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

/** 摺疊的工具時間軸：AI native 的可見性要求是看得到「它做了什麼」，預設收起來不吵。 */
function ToolCalls({ calls }: { calls: ToolCallEntry[] }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="mt-2 text-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="text-primary underline-offset-4 hover:underline"
      >
        做了什麼（{calls.length} 個工具）
      </button>
      {open && (
        <div className="mt-1 rounded-md border px-3">
          <ToolCallList parsed={{ tool_calls: calls }} />
        </div>
      )}
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"
  const isSummary = message.role === "system"
  const label = isUser ? "使用者訊息" : isSummary ? "對話摘要" : "助手訊息"
  return (
    <article aria-label={label} className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-full rounded-lg px-3 py-2 text-sm md:max-w-[85%]",
          isUser && "bg-primary text-primary-foreground",
          !isUser && !isSummary && "bg-muted",
          isSummary && "border border-dashed text-muted-foreground",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <AssistantMarkdown content={message.content} />
        )}
      </div>
      {message.tool_calls && message.tool_calls.length > 0 && <ToolCalls calls={message.tool_calls} />}
    </article>
  )
}

export function MessageList({ messages, typing }: { messages: ChatMessage[]; typing: boolean }) {
  const endRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length, typing])

  return (
    <div role="log" aria-label="訊息串" aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-1">
      {messages.length === 0 && !typing && (
        <p className="py-8 text-center text-sm text-muted-foreground">還沒有訊息，從下面開始問吧。</p>
      )}
      {messages.map((m, i) => (
        <MessageBubble key={`${m.timestamp}-${i}`} message={m} />
      ))}
      {typing && <p className="text-sm text-muted-foreground">AI 回覆中…</p>}
      <div ref={endRef} />
    </div>
  )
}
