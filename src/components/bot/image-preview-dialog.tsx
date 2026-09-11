import * as React from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { downloadFile, type BotFile } from "@/lib/bot"

function fileDisplayName(f: BotFile): string {
  return f.file_name || `${f.file_type}_${f.id.slice(0, 8)}`
}

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

  const imageUrl = React.useMemo(() => (query.data ? URL.createObjectURL(query.data) : null), [query.data])

  React.useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }, [imageUrl])

  const downloadMutation = useMutation({
    mutationFn: () => downloadFile(file.id),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    },
  })

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

        <div>
          <Button variant="outline" size="sm" onClick={() => downloadMutation.mutate()} disabled={downloadMutation.isPending}>
            下載
          </Button>
          {downloadMutation.isError && (
            <Alert variant="destructive" role="alert" className="mt-2">
              <AlertDescription>
                {downloadMutation.error instanceof ApiError ? downloadMutation.error.detail : "下載失敗，請稍後再試"}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
