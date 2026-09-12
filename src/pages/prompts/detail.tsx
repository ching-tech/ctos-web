import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "react-router"
import * as React from "react"
import { BotPromptAlert } from "@/components/ai-management/bot-prompt-alert"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { aiManagementKeys, deletePrompt, getPrompt, isBotPrompt } from "@/lib/ai-management"
import { ApiError } from "@/lib/api"

function InfoRow({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-right break-words">{value}</dd>
    </div>
  )
}

export default function PromptDetailPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)

  const detailQuery = useQuery({ queryKey: aiManagementKeys.promptDetail(id), queryFn: () => getPrompt(id), retry: false })

  const deleteMutation = useMutation({
    mutationFn: () => deletePrompt(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: aiManagementKeys.promptDetail(id) })
      queryClient.invalidateQueries({ queryKey: aiManagementKeys.prompts })
      navigate("/prompts")
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
          <p>找不到這個 Prompt</p>
          <Link to="/prompts" className="text-primary underline underline-offset-4">
            回 Prompt 清單
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

  const prompt = detailQuery.data!
  const variables = Object.entries(prompt.variables ?? {})

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link to="/prompts" className="text-sm text-primary underline-offset-4 hover:underline">
          回 Prompt 清單
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">{prompt.display_name || prompt.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link to={`/prompts/${prompt.id}/edit`}>編輯</Link>
            </Button>
            <Button variant="outline" onClick={() => setConfirmingDelete(true)}>
              刪除
            </Button>
          </div>
        </div>
      </div>

      {isBotPrompt(prompt.name) && <BotPromptAlert name={prompt.name} />}

      <dl className="rounded-lg border px-4">
        <InfoRow term="名稱" value={<span className="font-mono text-xs">{prompt.name}</span>} />
        <InfoRow term="分類" value={prompt.category ? <Badge variant="secondary">{prompt.category}</Badge> : "—"} />
        <InfoRow term="說明" value={prompt.description || "—"} />
        <InfoRow term="建立時間" value={new Date(prompt.created_at).toLocaleString("zh-TW")} />
        <InfoRow term="更新時間" value={new Date(prompt.updated_at).toLocaleString("zh-TW")} />
      </dl>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">內容</h2>
        {/* 提示詞是要原樣送進模型的純文字，不做 Markdown 渲染，免得看到的和送出去的不一樣。 */}
        <pre className="overflow-x-auto rounded-lg border p-4 font-mono text-xs whitespace-pre-wrap" data-testid="prompt-content">
          {prompt.content}
        </pre>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">變數</h2>
        {variables.length === 0 ? (
          <p className="text-sm text-muted-foreground">沒有設定變數</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>變數</TableHead>
                  <TableHead>說明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variables.map(([key, value]) => (
                  <TableRow key={key}>
                    <TableCell className="font-mono text-xs">{key}</TableCell>
                    <TableCell className="break-words">
                      {typeof value === "string" ? value : JSON.stringify(value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* 刪除確認照 PR #29：只掛一個對話框，確定鍵用一般 Button，等請求落地才關。 */}
      <AlertDialog
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setConfirmingDelete(false)
        }}
      >
        {confirmingDelete && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除「{prompt.display_name || prompt.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              刪掉之後無法復原。被 Agent 引用中的 Prompt 後端會擋下來。
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
