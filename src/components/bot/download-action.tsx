import { useMutation } from "@tanstack/react-query"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { downloadFile, fileDisplayName, type BotFile } from "@/lib/bot"

/** 檔案列與預覽對話框共用的下載鈕：Bearer 取 blob 再觸發瀏覽器下載，token 不進網址 */
export function DownloadAction({ file }: { file: BotFile }) {
  const mutation = useMutation({
    mutationFn: () => downloadFile(file.id),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileDisplayName(file)
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    },
  })

  return (
    <div>
      <Button variant="outline" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        下載
      </Button>
      {mutation.isError && (
        <Alert variant="destructive" role="alert" className="mt-2">
          <AlertDescription>{mutation.error instanceof ApiError ? mutation.error.detail : "下載失敗，請稍後再試"}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
