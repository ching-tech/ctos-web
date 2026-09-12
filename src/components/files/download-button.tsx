import { useMutation } from "@tanstack/react-query"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { downloadNasFile } from "@/lib/nas"

/** 下載鈕：header 帶 session 與 NAS token 取 blob 再觸發存檔，token 不進網址。 */
export function NasDownloadButton({ path, name, className }: { path: string; name: string; className?: string }) {
  const mutation = useMutation({
    mutationFn: () => downloadNasFile(path),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    },
  })

  return (
    <div className={className}>
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
