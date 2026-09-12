import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Link, useNavigate, useParams } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Attachments } from "@/components/kb/attachments"
import { HistorySheet } from "@/components/kb/history-sheet"
import { Markdown } from "@/components/kb/markdown"
import { ShareDialog } from "@/components/share-dialog"
import { ApiError } from "@/lib/api"
import { CATEGORY_LABEL, categoryColor, createShareLink, deleteKnowledge, getKnowledge, kbKeys, label, SCOPE_LABEL, TYPE_LABEL } from "@/lib/kb"
import { Skeleton } from "@/components/ui/skeleton"

function MetaRow({ term, value }: { term: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-right break-words">{value}</dd>
    </div>
  )
}

export default function KbDetailPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [shareOpen, setShareOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)

  const detailQuery = useQuery({ queryKey: kbKeys.detail(id), queryFn: () => getKnowledge(id), retry: false })

  const deleteMutation = useMutation({
    mutationFn: () => deleteKnowledge(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: kbKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: kbKeys.all })
      navigate("/kb")
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
          <p>找不到這篇知識</p>
          <Link to="/kb" className="text-primary underline underline-offset-4">
            回知識庫
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

  const kb = detailQuery.data!
  const tags = kb.tags

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold">{kb.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{label(TYPE_LABEL, kb.type)}</Badge>
            <Badge variant="tint" className={categoryColor(kb.category)}>{label(CATEGORY_LABEL, kb.category)}</Badge>
            <Badge variant="tint" className={kb.is_public ? "text-emerald-600 dark:text-emerald-400" : undefined}>
              {kb.is_public ? "公開" : "不公開"}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link to={`/kb/${id}/edit`}>編輯</Link>
          </Button>
          <Button variant="outline" onClick={() => setShareOpen(true)}>
            分享
          </Button>
          <Button variant="outline" onClick={() => setHistoryOpen(true)}>
            版本歷史
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">刪除</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>確定刪除這篇知識？</AlertDialogTitle>
                <AlertDialogDescription>刪除後無法復原。</AlertDialogDescription>
              </AlertDialogHeader>
              {deleteMutation.isError && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>
                    {deleteMutation.error instanceof ApiError ? deleteMutation.error.detail : "刪除失敗，請稍後再試"}
                  </AlertDescription>
                </Alert>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()}>確定</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_280px]">
        <article className="min-w-0 space-y-6">
          <Markdown content={kb.content} />
          <Attachments id={id} attachments={kb.attachments} canEdit />
        </article>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">資訊</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <MetaRow term="作者" value={kb.author} />
              <MetaRow term="建立" value={kb.created_at} />
              <MetaRow term="更新" value={kb.updated_at} />
              <MetaRow term="範圍" value={label(SCOPE_LABEL, kb.scope)} />
              <MetaRow term="擁有者" value={kb.owner} />
              <MetaRow term="專案" value={kb.project_id} />
              <MetaRow term="專案標籤" value={tags.projects.length > 0 ? tags.projects.join("、") : null} />
              <MetaRow term="角色" value={tags.roles.length > 0 ? tags.roles.join("、") : null} />
              <MetaRow term="主題" value={tags.topics.length > 0 ? tags.topics.join("、") : null} />
              <MetaRow term="等級" value={tags.level} />
            </dl>
            {kb.related.length > 0 && (
              <div className="mt-3 space-y-1 text-sm">
                <div className="text-muted-foreground">相關知識</div>
                <ul className="space-y-1">
                  {kb.related.map((rid) => (
                    <li key={rid}>
                      <Link to={`/kb/${rid}`} className="text-primary underline underline-offset-4">
                        {rid}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        ariaLabel="分享此篇知識"
        createLink={(opts) => createShareLink(id, opts)}
      />
      <HistorySheet id={id} open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  )
}
