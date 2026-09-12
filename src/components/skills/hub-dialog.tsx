import { useMutation, useQuery } from "@tanstack/react-query"
import * as React from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ApiError } from "@/lib/api"
import {
  hubInspect,
  hubInstall,
  hubSearch,
  listHubSources,
  skillKeys,
  type HubSearchResult,
  type HubSourceId,
} from "@/lib/skills"

function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.detail : fallback
}

/** 兩家 Hub 的欄位名不一致，逐個 fallback（舊桌面 `agent-settings.js` 1294–1301 同一套規則）。 */
function resultSlug(r: HubSearchResult): string {
  return r.slug || r.name || ""
}
function resultTitle(r: HubSearchResult): string {
  return r.displayName || resultSlug(r)
}
function resultSummary(r: HubSearchResult): string {
  return r.summary || r.description || ""
}

/** 搜尋結果的 `source` 是後端補上的（`api/skills.py` 335–336、348）；真的沒有時退回目前選的來源。 */
function resultSource(r: HubSearchResult, fallback: HubSourceId): HubSourceId {
  return r.source ?? fallback
}

export function HubDialog({
  open,
  onOpenChange,
  onInstalled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInstalled: () => void
}) {
  const [source, setSource] = React.useState<"all" | HubSourceId>("all")
  const [term, setTerm] = React.useState("")
  const [notice, setNotice] = React.useState<string | null>(null)
  const [results, setResults] = React.useState<HubSearchResult[] | null>(null)
  const [inspecting, setInspecting] = React.useState<{ slug: string; content: string } | null>(null)
  const [confirming, setConfirming] = React.useState<HubSearchResult | null>(null)

  const sourcesQuery = useQuery({
    queryKey: skillKeys.hubSources(),
    queryFn: listHubSources,
    // 對話框沒開就不要打，這支是管理員端點。
    enabled: open,
  })

  const search = useMutation({
    mutationFn: () => hubSearch(term.trim(), source === "all" ? null : source),
    onMutate: () => {
      setNotice(null)
      setInspecting(null)
    },
    onSuccess: (data) => {
      setResults(data.results)
      // 雙來源時其中一家掛掉，後端把錯誤放 errors 而不是整支失敗（`api/skills.py` 355–364）。
      if (data.errors && data.errors.length > 0) setNotice(data.errors.join("；"))
    },
    onError: (e) => {
      setResults(null)
      setNotice(errorText(e, "搜尋失敗，請稍後再試"))
    },
  })

  const inspect = useMutation({
    mutationFn: (r: HubSearchResult) => hubInspect(resultSlug(r), resultSource(r, source === "all" ? "clawhub" : source)),
    onMutate: () => setNotice(null),
    onSuccess: (data) => setInspecting({ slug: data.slug, content: data.content }),
    onError: (e) => setNotice(errorText(e, "檢視失敗，請稍後再試")),
  })

  const install = useMutation({
    mutationFn: (r: HubSearchResult) =>
      hubInstall(resultSlug(r), resultSource(r, source === "all" ? "clawhub" : source), r.version),
    onMutate: () => setNotice(null),
    onSuccess: (data) => {
      setConfirming(null)
      setNotice(`已安裝 ${data.installed} ${data.version}`)
      onInstalled()
    },
    // 已安裝會 409，detail 原樣顯示（`api/skills.py` 454–457）。
    onError: (e) => {
      setConfirming(null)
      setNotice(errorText(e, "安裝失敗，請稍後再試"))
    },
  })

  const sources = sourcesQuery.data?.sources ?? []

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && install.isPending) return
        onOpenChange(next)
      }}
    >
      {open && (
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>從 Hub 安裝</DialogTitle>
            <DialogDescription>搜尋 Hub 上的 skill，先檢視內容再決定要不要裝進來。</DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (term.trim()) search.mutate()
            }}
          >
            <Select value={source} onValueChange={(v) => setSource(v as "all" | HubSourceId)}>
              <SelectTrigger aria-label="來源" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部來源</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label="搜尋 Hub"
              className="flex-1"
              placeholder="關鍵字"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
            <Button type="submit" disabled={!term.trim() || search.isPending}>
              搜尋
            </Button>
          </form>

          {notice && (
            <Alert role="alert">
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}

          {results !== null &&
            (results.length === 0 ? (
              <p className="text-sm text-muted-foreground">沒有符合的結果</p>
            ) : (
              <ul className="space-y-2">
                {results.map((r) => (
                  <li key={`${resultSource(r, "clawhub")}:${resultSlug(r)}`} className="space-y-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{resultTitle(r)}</span>
                      {r.version && <Badge variant="tint">{r.version}</Badge>}
                      {r.source && <Badge variant="outline">{r.source}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{resultSummary(r)}</p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={inspect.isPending}
                        onClick={() => inspect.mutate(r)}
                      >
                        檢視
                      </Button>
                      <Button type="button" size="sm" disabled={install.isPending} onClick={() => setConfirming(r)}>
                        安裝
                      </Button>
                    </div>
                    {confirming && resultSlug(confirming) === resultSlug(r) && (
                      <div className="space-y-2 rounded-md border border-dashed p-3">
                        <p className="text-sm">確定安裝「{resultTitle(r)}」？裝進來的 skill 會立刻對 AI 生效。</p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={install.isPending}
                            onClick={() => setConfirming(null)}
                          >
                            返回
                          </Button>
                          <Button type="button" size="sm" disabled={install.isPending} onClick={() => install.mutate(r)}>
                            確定安裝
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ))}

          {inspecting && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{inspecting.slug} 的 SKILL.md</h3>
              <pre className="max-h-64 overflow-auto rounded-lg border bg-muted p-3 text-xs whitespace-pre-wrap">
                {inspecting.content || "（Hub 沒有提供內容）"}
              </pre>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={install.isPending} onClick={() => onOpenChange(false)}>
              關閉
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
