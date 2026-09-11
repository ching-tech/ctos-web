import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toolDisplayName, toolDurationMs } from "@/lib/ai-log"
import type { ParsedResponse, ToolCallEntry } from "@/lib/ai-log"

/**
 * 工具呼叫時間軸。AI Log 明細頁與 AI 助手共用：AI native 的可見性要求是「看得到 AI 做了什麼」，
 * 兩邊得長一樣，所以只維護這一份。
 */

function ToolCallStep({ index, tc, durationMs }: { index: number; tc: ToolCallEntry; durationMs: number | null }) {
  const [inputOpen, setInputOpen] = React.useState(false)
  const [outputOpen, setOutputOpen] = React.useState(false)
  return (
    <li className="space-y-2 border-b py-3 text-sm last:border-b-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">第 {index + 1} 步</span>
        <span>{toolDisplayName(tc)}</span>
        <span className="text-muted-foreground">{durationMs != null ? `${durationMs} ms` : "—"}</span>
        <button
          type="button"
          aria-expanded={inputOpen}
          className="text-primary underline-offset-4 hover:underline"
          onClick={() => setInputOpen((o) => !o)}
        >
          輸入
        </button>
        <button
          type="button"
          aria-expanded={outputOpen}
          className="text-primary underline-offset-4 hover:underline"
          onClick={() => setOutputOpen((o) => !o)}
        >
          輸出
        </button>
      </div>
      {inputOpen && (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(tc.input, null, 2)}</pre>
      )}
      {outputOpen && (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words">{tc.output && tc.output.length > 0 ? tc.output : "（無輸出）"}</pre>
      )}
    </li>
  )
}

/** 工具呼叫清單本體（沒有卡片外框），給要自己包外框的地方用。 */
export function ToolCallList({ parsed }: { parsed: ParsedResponse }) {
  const toolCalls = parsed.tool_calls
  if (!toolCalls || toolCalls.length === 0) return null
  return (
    <ol className="space-y-0">
      {toolCalls.map((tc, i) => (
        <ToolCallStep key={tc.id} index={i} tc={tc} durationMs={toolDurationMs(parsed, i)} />
      ))}
    </ol>
  )
}

/** 帶卡片外框與「工具呼叫」標題的版本（AI Log 明細頁用）。 */
export function ToolCallsCard({ parsed }: { parsed: ParsedResponse | null }) {
  if (!parsed || !parsed.tool_calls || parsed.tool_calls.length === 0) return null
  return (
    <section aria-label="工具呼叫">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">工具呼叫</CardTitle>
        </CardHeader>
        <CardContent>
          <ToolCallList parsed={parsed} />
        </CardContent>
      </Card>
    </section>
  )
}
