import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
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
import { DownloadAction } from "@/components/bot/download-action"
import { ImagePreviewDialog } from "@/components/bot/image-preview-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import { botKeys, deleteFile, fileDisplayName, type BotFile } from "@/lib/bot"

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i

function isImageFile(f: BotFile): boolean {
  return f.file_type === "image" || (!!f.file_name && IMAGE_EXT.test(f.file_name))
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function PreviewAction({ file }: { file: BotFile }) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        預覽
      </Button>
      <ImagePreviewDialog file={file} open={open} onOpenChange={setOpen} />
    </>
  )
}

function DeleteAction({ file }: { file: BotFile }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => deleteFile(file.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...botKeys.all, "files"] }),
  })

  return (
    <div>
      {mutation.isError && (
        <Alert variant="destructive" role="alert" className="mb-2">
          <AlertDescription>{mutation.error instanceof ApiError ? mutation.error.detail : "刪除失敗，請稍後再試"}</AlertDescription>
        </Alert>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm">
            刪除
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除？</AlertDialogTitle>
            <AlertDialogDescription>刪除後無法復原。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => mutation.mutate()}>確定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * Bot 檔案表格：檔案分頁（`/bot?tab=files`）與群組明細的檔案分頁共用同一份列與動作。
 * 群組明細裡「來源」永遠是同一個群組，用 `showSource={false}` 把那一欄收起來。
 */
export function FileTable({ files, showSource = true }: { files: BotFile[]; showSource?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>檔名</TableHead>
            <TableHead>類型</TableHead>
            <TableHead>大小</TableHead>
            {showSource && <TableHead>來源</TableHead>}
            <TableHead>時間</TableHead>
            <TableHead>動作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((f) => (
            <TableRow key={f.id}>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <span>{fileDisplayName(f)}</span>
                  {f.nas_path && <Badge variant="tint">NAS</Badge>}
                </div>
              </TableCell>
              <TableCell>{f.file_type}</TableCell>
              <TableCell>{formatSize(f.file_size)}</TableCell>
              {showSource && <TableCell>{f.group_name || f.user_display_name || "—"}</TableCell>}
              <TableCell>{new Date(f.created_at).toLocaleString("zh-TW")}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  {f.nas_path ? (
                    <>
                      {isImageFile(f) && <PreviewAction file={f} />}
                      <DownloadAction file={f} />
                    </>
                  ) : (
                    <Badge variant="tint">已過期</Badge>
                  )}
                  <DeleteAction file={f} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
