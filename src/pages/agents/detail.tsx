import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Link, useNavigate, useParams } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { aiManagementKeys, deleteAgent, getAgent, testAgent, type AiAgent, type AiTestResponse } from "@/lib/ai-management"
import { ApiError } from "@/lib/api"

function InfoRow({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-right break-words">{value}</dd>
    </div>
  )
}

/**
 * 測試面板。`POST /api/ai/test` 會**真的**呼叫 AI：要 app `agent-settings`，
 * 會計費也會在 ai_logs 留一筆（`services/ai_manager.py` 的 `call_agent` 寫 log）。
 * 失敗不是 HTTP 錯誤，是 200 配 `success:false`＋`error`；停用中的 Agent 後端直接回
 * 「Agent 'x' 已停用」（`services/ai_manager.py` 812–818），所以面板照樣開著，把錯誤顯示出來。
 */
function TestPanel({ agent }: { agent: AiAgent }) {
  const [message, setMessage] = React.useState("")
  const [result, setResult] = React.useState<AiTestResponse | null>(null)

  const mutation = useMutation({
    mutationFn: () => testAgent({ agent_id: agent.id, message }),
    onSuccess: (res) => setResult(res),
  })

  return (
    <section className="space-y-3 rounded-lg border p-4" data-testid="test-panel">
      <h2 className="text-sm font-medium">測試</h2>
      <Alert>
        <AlertDescription>
          送出會真的呼叫 AI：會計入用量，也會在 AI Log 留下一筆紀錄。
          {!agent.is_active && "這個 Agent 目前停用，後端會直接回「已停用」不會呼叫模型。"}
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="agent-test-message">測試訊息</Label>
        <Textarea
          id="agent-test-message"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="例如：用一句話回答 1+1"
        />
      </div>

      <Button disabled={mutation.isPending || !message.trim()} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "測試中…" : "送出測試"}
      </Button>

      {mutation.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {mutation.error instanceof ApiError ? mutation.error.detail : "測試失敗，請稍後再試"}
          </AlertDescription>
        </Alert>
      )}

      {result && (
        <div className="space-y-2" data-testid="test-result">
          {result.success ? (
            <pre className="overflow-x-auto rounded-lg border p-3 font-mono text-xs whitespace-pre-wrap">{result.response}</pre>
          ) : (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{result.error || "測試失敗"}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>耗時 {result.duration_ms != null ? `${result.duration_ms.toLocaleString("zh-TW")}ms` : "—"}</span>
            {result.log_id && (
              <Link to={`/ai-log/${result.log_id}`} className="text-primary underline underline-offset-4">
                看這次的 AI Log
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default function AgentDetailPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)

  const detailQuery = useQuery({ queryKey: aiManagementKeys.agentDetail(id), queryFn: () => getAgent(id), retry: false })

  const deleteMutation = useMutation({
    mutationFn: () => deleteAgent(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: aiManagementKeys.agentDetail(id) })
      queryClient.invalidateQueries({ queryKey: aiManagementKeys.agents })
      navigate("/agents")
    },
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
          <p>找不到這個 Agent</p>
          <Link to="/agents" className="text-primary underline underline-offset-4">
            回 Agent 清單
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

  const agent = detailQuery.data!

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link to="/agents" className="text-sm text-primary underline-offset-4 hover:underline">
          回 Agent 清單
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">{agent.display_name || agent.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link to={`/agents/${agent.id}/edit`}>編輯</Link>
            </Button>
            <Button variant="outline" onClick={() => setConfirmingDelete(true)}>
              刪除
            </Button>
          </div>
        </div>
      </div>

      <dl className="rounded-lg border px-4">
        <InfoRow term="名稱" value={<span className="font-mono text-xs">{agent.name}</span>} />
        <InfoRow term="狀態" value={<Badge variant={agent.is_active ? "secondary" : "outline"}>{agent.is_active ? "啟用" : "停用"}</Badge>} />
        <InfoRow term="模型" value={agent.model} />
        <InfoRow
          term="System Prompt"
          value={
            agent.system_prompt ? (
              <Link to={`/prompts/${agent.system_prompt.id}`} className="text-primary underline underline-offset-4">
                {agent.system_prompt.display_name || agent.system_prompt.name}
              </Link>
            ) : (
              "—"
            )
          }
        />
        <InfoRow term="說明" value={agent.description || "—"} />
        <InfoRow term="工具" value={agent.tools?.length ? agent.tools.join("、") : "—"} />
        <InfoRow term="建立時間" value={new Date(agent.created_at).toLocaleString("zh-TW")} />
        <InfoRow term="更新時間" value={new Date(agent.updated_at).toLocaleString("zh-TW")} />
      </dl>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">額外設定</h2>
        {agent.settings ? (
          <pre className="overflow-x-auto rounded-lg border p-4 font-mono text-xs whitespace-pre-wrap" data-testid="agent-settings">
            {JSON.stringify(agent.settings, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">沒有額外設定</p>
        )}
      </section>

      <TestPanel agent={agent} />

      <AlertDialog
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setConfirmingDelete(false)
        }}
      >
        {confirmingDelete && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確定刪除「{agent.display_name || agent.name}」？</AlertDialogTitle>
              <AlertDialogDescription>
                刪掉之後無法復原；這個 Agent 的 AI Log 會保留，只是不再連到它。
              </AlertDialogDescription>
            </AlertDialogHeader>
            {/* 對話框是 modal，外面的提示讀不到，失敗原因要留在對話框裡。 */}
            {deleteMutation.isError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>
                  {deleteMutation.error instanceof ApiError ? deleteMutation.error.detail : "刪除失敗，請稍後再試"}
                </AlertDescription>
              </Alert>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>返回</AlertDialogCancel>
              <Button disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
                確定刪除
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  )
}
