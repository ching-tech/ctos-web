import { useQuery } from "@tanstack/react-query"
import { X } from "lucide-react"
import * as React from "react"
import { NasDownloadButton } from "@/components/files/download-button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { nasKeys, previewKind, readNasFile, readNasText } from "@/lib/nas"

/**
 * 預覽面板：圖片與 PDF 取 blob 做 object URL，文字類直接取回文字。
 *
 * 不用 `?nas_token=` 的 `<img src>`：token 不進網址，過期重連的攔截與重試也跟其他端點同一條路。
 */
export function PreviewPanel({ path, name, onClose }: { path: string; name: string; onClose: () => void }) {
  const kind = previewKind(name)

  const blobQuery = useQuery({
    queryKey: [...nasKeys.preview(path), "blob"],
    queryFn: () => readNasFile(path),
    enabled: kind === "image" || kind === "pdf",
    retry: false,
    // 整份檔案的內容不要留在 query 快取裡，面板收起來就丟掉。
    gcTime: 0,
  })

  const textQuery = useQuery({
    queryKey: [...nasKeys.preview(path), "text"],
    queryFn: () => readNasText(path),
    enabled: kind === "text",
    retry: false,
    gcTime: 0,
  })

  // object URL 只在這一份 blob 活著的期間存在，換檔或卸載就 revoke（同步外部資源，放 effect）
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!blobQuery.data) return
    const url = URL.createObjectURL(blobQuery.data)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 同步外部資源（object URL）的標準寫法
    setObjectUrl(url)
    return () => {
      URL.revokeObjectURL(url)
      setObjectUrl(null)
    }
  }, [blobQuery.data])

  const query = kind === "text" ? textQuery : blobQuery
  const error = query.isError ? (query.error instanceof ApiError ? query.error.detail : "預覽載入失敗，請稍後再試") : null

  return (
    <section aria-label="檔案預覽" className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-medium break-all">{name}</h2>
        <Button variant="ghost" size="icon" aria-label="關閉預覽" onClick={onClose}>
          <X />
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : kind === "none" ? (
        <p className="text-sm text-muted-foreground">這個檔案類型不提供預覽，請下載後開啟。</p>
      ) : query.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : kind === "image" ? (
        objectUrl && <img src={objectUrl} alt={name} className="max-h-[60vh] max-w-full object-contain" />
      ) : kind === "pdf" ? (
        objectUrl && <iframe src={objectUrl} title={name} className="h-[60vh] w-full rounded border" />
      ) : (
        <pre className="max-h-[60vh] overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">{textQuery.data}</pre>
      )}

      <NasDownloadButton path={path} name={name} />
    </section>
  )
}
