import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { Link, useParams } from "react-router"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { aiLogKeys, contextLabel, getLog, toolDisplayName, toolDurationMs, usedToolsFrom } from "@/lib/ai-log"
import type { ParsedResponse, ToolCallEntry } from "@/lib/ai-log"
import { ApiError } from "@/lib/api"

function SummaryRow({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-right break-words">{value}</dd>
    </div>
  )
}

function ToolBadges({ title, tools }: { title: string; tools: string[] | null | undefined }) {
  if (!tools || tools.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {tools.map((t) => (
          <Badge key={t} variant="outline">
            {t}
          </Badge>
        ))}
      </CardContent>
    </Card>
  )
}

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

function ToolCallsCard({ parsed }: { parsed: ParsedResponse | null }) {
  if (!parsed || !parsed.tool_calls || parsed.tool_calls.length === 0) return null
  const toolCalls = parsed.tool_calls
  return (
    <section aria-label="工具呼叫">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">工具呼叫</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-0">
            {toolCalls.map((tc, i) => (
              <ToolCallStep key={tc.id} index={i} tc={tc} durationMs={toolDurationMs(parsed, i)} />
            ))}
          </ol>
        </CardContent>
      </Card>
    </section>
  )
}

export default function AiLogDetailPage() {
  const { id = "" } = useParams()
  const [systemPromptOpen, setSystemPromptOpen] = React.useState(false)
  const [parsedResponseOpen, setParsedResponseOpen] = React.useState(false)

  const detailQuery = useQuery({ queryKey: aiLogKeys.detail(id), queryFn: () => getLog(id), retry: false })

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
          <p>找不到這筆紀錄</p>
          <Link to="/ai-log" className="text-primary underline underline-offset-4">
            回清單
          </Link>
        </div>
      )
    }
    return <p className="text-destructive">{err instanceof ApiError ? err.detail : "載入失敗，請稍後再試"}</p>
  }

  if (!detailQuery.data) return null
  const log = detailQuery.data
  const time = new Date(log.created_at).toLocaleString("zh-TW")
  const usedTools = usedToolsFrom(log.parsed_response)

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link to="/ai-log" className="text-sm text-primary underline-offset-4 hover:underline">
          回清單
        </Link>
        <h1 className="text-2xl font-semibold">AI Log 明細</h1>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <SummaryRow term="時間" value={time} />
          <SummaryRow term="Agent" value={log.agent_name ?? "—"} />
          <SummaryRow term="情境" value={contextLabel(log.context_type)} />
          <SummaryRow term="模型" value={log.model ?? "—"} />
          <SummaryRow
            term="結果"
            value={
              <Badge variant={log.success ? "tint" : "destructive"} className={log.success ? "text-emerald-600 dark:text-emerald-400" : undefined}>
                {log.success ? "成功" : "失敗"}
              </Badge>
            }
          />
          <SummaryRow term="耗時" value={log.duration_ms != null ? `${log.duration_ms.toLocaleString("zh-TW")}ms` : "—"} />
          {usedTools.length > 0 && (
            <SummaryRow
              term="使用的工具"
              value={
                <div className="flex flex-wrap justify-end gap-1">
                  {usedTools.map((t) => (
                    <Badge key={t} variant="outline">
                      {t}
                    </Badge>
                  ))}
                </div>
              }
            />
          )}
          <SummaryRow
            term="Token"
            value={`${log.input_tokens?.toLocaleString("zh-TW") ?? "—"} 進／${log.output_tokens?.toLocaleString("zh-TW") ?? "—"} 出`}
          />
          <SummaryRow term="情境 ID" value={log.context_id ?? "—"} />
          <SummaryRow term="Prompt ID" value={log.prompt_id ?? "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">輸入</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">{log.input_prompt}</pre>
        </CardContent>
      </Card>

      {log.system_prompt && (
        <Card>
          <CardHeader>
            <button
              type="button"
              aria-expanded={systemPromptOpen}
              className="text-base font-semibold"
              onClick={() => setSystemPromptOpen((o) => !o)}
            >
              系統提示
            </button>
          </CardHeader>
          {systemPromptOpen && (
            <CardContent>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">{log.system_prompt}</pre>
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">原始回應</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">{log.raw_response ?? "—"}</pre>
        </CardContent>
      </Card>

      {log.parsed_response !== null && (
        <Card>
          <CardHeader>
            <button
              type="button"
              aria-expanded={parsedResponseOpen}
              className="text-base font-semibold"
              onClick={() => setParsedResponseOpen((o) => !o)}
            >
              解析結果（原始 JSON）
            </button>
          </CardHeader>
          {parsedResponseOpen && (
            <CardContent>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">{JSON.stringify(log.parsed_response, null, 2)}</pre>
            </CardContent>
          )}
        </Card>
      )}

      <ToolCallsCard parsed={log.parsed_response} />

      {!log.success && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">錯誤</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap break-words text-sm text-destructive">{log.error_message ?? "—"}</p>
          </CardContent>
        </Card>
      )}

      <ToolBadges title="允許的工具" tools={log.allowed_tools} />
    </div>
  )
}
