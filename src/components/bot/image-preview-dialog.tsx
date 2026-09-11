import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { DownloadAction } from "@/components/bot/download-action"
import { ApiError } from "@/lib/api"
import { downloadFile, fileDisplayName, type BotFile } from "@/lib/bot"

export function ImagePreviewDialog({
  file,
  open,
  onOpenChange,
}: {
  file: BotFile
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const fileName = fileDisplayName(file)

  const query = useQuery({
    queryKey: ["bot", "file-preview", file.id],
    queryFn: () => downloadFile(file.id),
    enabled: open,
  })

  // object URL 只在對話框開著時存在：關閉或換圖就 revoke（外部資源同步，放 effect）
  const [imageUrl, setImageUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!open || !query.data) return
    const url = URL.createObjectURL(query.data)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 同步外部資源（object URL）的標準寫法
    setImageUrl(url)
    return () => {
      URL.revokeObjectURL(url)
      setImageUrl(null)
    }
  }, [open, query.data])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{fileName}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-40 items-center justify-center">
          {query.isError ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {query.error instanceof ApiError ? query.error.detail : "預覽載入失敗，請稍後再試"}
              </AlertDescription>
            </Alert>
          ) : imageUrl ? (
            <img src={imageUrl} alt={fileName} className="max-h-[80vh] max-w-full object-contain" />
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </div>

        <DownloadAction file={file} />
      </DialogContent>
    </Dialog>
  )
}
