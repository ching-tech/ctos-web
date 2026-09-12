import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FileTable } from "@/components/bot/file-table"
import { Pagination } from "@/components/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { botKeys, FILE_TYPE_OPTIONS, listGroupFiles, type GroupFileFilter } from "@/lib/bot"

const PAGE_SIZE = 30

/** 群組明細的「檔案」分頁：打專用端點 `GET /api/bot/groups/{id}/files`，群組在路徑上。 */
export default function GroupFilesTab({ groupId }: { groupId: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawPage = searchParams.get("page")
  const page = rawPage ? Math.max(1, Number(rawPage) || 1) : 1
  const fileType = searchParams.get("fileType") ?? ""

  function goToPage(p: number) {
    const next = new URLSearchParams(searchParams)
    if (p <= 1) next.delete("page")
    else next.set("page", String(p))
    setSearchParams(next)
  }

  function setFileType(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value === "all") next.delete("fileType")
    else next.set("fileType", value)
    next.delete("page")
    setSearchParams(next)
  }

  const filter: GroupFileFilter = { page, fileType: fileType || undefined }
  const query = useQuery({
    queryKey: botKeys.groupFiles(groupId, filter),
    queryFn: () => listGroupFiles(groupId, filter),
  })

  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{query.isLoading ? "" : `共 ${total} 個檔案`}</p>
        <Select value={fileType || "all"} onValueChange={setFileType}>
          <SelectTrigger className="w-28" aria-label="檔案類型">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            {FILE_TYPE_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{query.error instanceof ApiError ? query.error.detail : "載入失敗，請稍後再試"}</AlertDescription>
        </Alert>
      ) : query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">這個群組沒有檔案</p>
      ) : (
        <>
          {/* 來源欄在這裡永遠是同一個群組，收起來。 */}
          <FileTable files={items} showSource={false} />
          <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
        </>
      )}
    </div>
  )
}
