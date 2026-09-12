import { useQuery } from "@tanstack/react-query"
import { X } from "lucide-react"
import * as React from "react"
import { NasDownloadButton } from "@/components/files/download-button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { filesKeys, readZoneText, zoneDownloadUrl, zoneFileUrl, type LocalZone } from "@/lib/files"
import { nasKeys, previewKind, readNasFile, readNasText } from "@/lib/nas"

/**
 * 預覽面板：圖片與 PDF 取 blob 做 object URL，文字類直接取回文字。
 *
 * 不用 `?nas_token=` 的 `<img src>`：token 不進網址，過期重連的攔截與重試也跟其他端點同一條路。
 *
 * 帶 `zone` 時換成本機儲存區（`/api/files/{zone}/…`）：那組端點沒有 NAS 連線可以過期，
 * 圖片與 PDF 直接用帶 `?token=` 的網址當 `src`（後端回的就是檔案內容加 MIME），
 * 下載也是一條 `<a href>`（後端帶 `Content-Disposition: attachment`），不必先抓 blob。
 */
export function PreviewPanel({
  path,
  name,
  zone,
  onClose,
}: {
  path: string
  name: string
  /** 有值＝本機儲存區；`path` 是相對 zone 根目錄的路徑（開頭的斜線會被忽略）。 */
  zone?: LocalZone
  onClose: () => void
}) {
  const kind = previewKind(name)

  const blobQuery = useQuery({
    queryKey: [...nasKeys.preview(path), "blob"],
    queryFn: () => readNasFile(path),
    enabled: !zone && (kind === "image" || kind === "pdf"),
    retry: false,
    // 整份檔案的內容不要留在 query 快取裡，面板收起來就丟掉。
    gcTime: 0,
  })

  const textQuery = useQuery({
    queryKey: zone ? [...filesKeys.preview(zone, path), "text"] : [...nasKeys.preview(path), "text"],
    queryFn: () => (zone ? readZoneText(zone, path) : readNasText(path)),
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

  // 本機儲存區的圖片與 PDF 不經過 query：網址本身就是內容，交給瀏覽器載。
  const srcUrl = zone ? zoneFileUrl(zone, path) : objectUrl
  const query = kind === "text" ? textQuery : blobQuery
  const pending = kind === "text" ? textQuery.isPending : !zone && blobQuery.isPending
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
      ) : pending ? (
        <Skeleton className="h-48 w-full" />
      ) : kind === "image" ? (
        srcUrl && <img src={srcUrl} alt={name} className="max-h-[60vh] max-w-full object-contain" />
      ) : kind === "pdf" ? (
        srcUrl && <iframe src={srcUrl} title={name} className="h-[60vh] w-full rounded border" />
      ) : (
        <pre className="max-h-[60vh] overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">{textQuery.data}</pre>
      )}

      {zone ? (
        <Button asChild variant="outline" size="sm">
          <a href={zoneDownloadUrl(zone, path)} download={name}>
            下載
          </a>
        </Button>
      ) : (
        <NasDownloadButton path={path} name={name} />
      )}
    </section>
  )
}
