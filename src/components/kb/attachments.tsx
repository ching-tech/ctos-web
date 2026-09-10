import { useMutation, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
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
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { attachmentUrl, deleteAttachment, kbKeys, uploadAttachment, type KnowledgeAttachment } from "@/lib/kb"

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i

function fileName(path: string): string {
  return path.split("/").pop() || path
}

function isImage(a: KnowledgeAttachment): boolean {
  return a.type === "image" || IMAGE_EXT.test(a.path)
}

export function Attachments({
  id,
  attachments,
  canEdit,
}: {
  id: string
  attachments: KnowledgeAttachment[]
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const [error, setError] = React.useState<string | null>(null)

  function invalidate() {
    setError(null)
    void queryClient.invalidateQueries({ queryKey: kbKeys.detail(id) })
  }

  function reportError(e: unknown, fallback: string) {
    setError(e instanceof ApiError ? e.detail : fallback)
  }

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadAttachment(id, file),
    onSuccess: invalidate,
    onError: (e) => reportError(e, "上傳失敗，請稍後再試"),
  })

  const deleteMutation = useMutation({
    mutationFn: (idx: number) => deleteAttachment(id, idx),
    onSuccess: invalidate,
    onError: (e) => reportError(e, "刪除附件失敗，請稍後再試"),
  })

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    uploadMutation.mutate(file)
    e.target.value = ""
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">附件</h2>
        {canEdit && (
          <input
            type="file"
            aria-label="上傳附件"
            onChange={onFileChange}
            disabled={uploadMutation.isPending}
            className="text-sm file:mr-2 file:rounded-lg file:border file:border-input file:bg-transparent file:px-2.5 file:py-1 file:text-sm"
          />
        )}
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚無附件</p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((a, idx) => {
            const name = fileName(a.path)
            const url = attachmentUrl(a.path)
            return (
              <li key={`${idx}-${a.path}`} className="flex items-center gap-3 rounded-lg border p-2">
                {isImage(a) && <img src={url} alt={name} className="size-10 shrink-0 rounded object-cover" />}
                <div className="min-w-0 flex-1">
                  <a href={url} target="_blank" rel="noreferrer" className="break-all text-primary underline underline-offset-4">
                    {name}
                  </a>
                  <div className="text-xs text-muted-foreground">
                    {a.type}
                    {a.size ? `・${a.size}` : ""}
                    {a.description ? `・${a.description}` : ""}
                  </div>
                </div>
                {canEdit && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="shrink-0">
                        刪除附件
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>確定刪除這個附件？</AlertDialogTitle>
                        <AlertDialogDescription>{name} 刪除後無法復原。</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(idx)}>確定</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
