import { useQuery } from "@tanstack/react-query"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { aiManagementKeys, getProviderStatus, type ProviderEntry } from "@/lib/ai-management"
import { ApiError } from "@/lib/api"

function pct(v: number | null): string {
  // `services/claude_usage.py` 的 `_normalize_utilization` 已經把值壓成 0–1。
  return v == null ? "—" : `${Math.round(v * 100)}%`
}

function fmtTime(v: string | null): string {
  return v ? new Date(v).toLocaleString("zh-TW") : "—"
}

function ProviderRow({ name, entry }: { name: string; entry: ProviderEntry }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b py-2 text-sm last:border-b-0">
      <span className="font-mono text-xs">{name}</span>
      <Badge variant={entry.ready ? "secondary" : "destructive"}>{entry.ready ? "可用" : "不可用"}</Badge>
      {entry.circuit && (
        <span className="text-xs text-muted-foreground">
          circuit {entry.circuit.state}／連續失敗 {entry.circuit.consecutive_failures}
        </span>
      )}
      {entry.adapter_binary !== undefined && (
        <span className="text-xs text-muted-foreground">adapter {entry.adapter_binary ? "有" : "沒有"}</span>
      )}
      {entry.codex_binary !== undefined && (
        <span className="text-xs text-muted-foreground">codex {entry.codex_binary ? "有" : "沒有"}</span>
      )}
    </div>
  )
}

/**
 * `GET /api/ai/providers/status` 只有管理員能打（`api/ai_management.py` 40 的 `require_admin`），
 * 所以這張卡只在管理員時掛上來，非管理員連請求都不會送出去。
 * 欄位照 `services/ai_router.py` 310–322 的 `provider_status()` 列。
 */
export function ProviderStatusCard() {
  const query = useQuery({ queryKey: aiManagementKeys.providerStatus, queryFn: getProviderStatus, retry: false })

  if (query.isLoading) return <Skeleton className="h-24 w-full" />

  if (query.isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>
          {query.error instanceof ApiError ? query.error.detail : "Provider 狀態載入失敗"}
        </AlertDescription>
      </Alert>
    )
  }

  const status = query.data!
  const usage = status.usage

  return (
    <section className="space-y-2 rounded-lg border p-4" data-testid="provider-status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Provider 狀態</h2>
        <Badge variant="outline">模式 {status.mode}</Badge>
      </div>

      <div>
        {Object.entries(status.providers).map(([name, entry]) => (
          <ProviderRow key={name} name={name} entry={entry} />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>用量狀態 {usage.state}</span>
        <span>整體 {pct(usage.utilization)}</span>
        <span>五小時 {pct(usage.five_hour)}</span>
        <span>七日 {pct(usage.seven_day)}</span>
        <span>更新於 {fmtTime(usage.fetched_at)}</span>
        {usage.last_error && <span>最後錯誤：{usage.last_error}</span>}
        {usage.consecutive_failures > 0 && <span>連續失敗 {usage.consecutive_failures}</span>}
      </div>
    </section>
  )
}
