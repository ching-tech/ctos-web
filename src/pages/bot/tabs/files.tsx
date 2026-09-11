import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router"
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
import { Pagination } from "@/components/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import { botKeys, deleteFile, downloadFile, listFiles, type BotFile, type FileFilter, type Platform } from "@/lib/bot"

const PAGE_SIZE = 30
const FILE_TYPES = ["image", "video", "audio", "file"] as const

function fileDisplayName(f: BotFile): string {
  return f.file_name || `${f.file_type}_${f.id.slice(0, 8)}`
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function DownloadAction({ file }: { file: BotFile }) {
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

export default function FilesTab({ platform }: { platform: Platform | "" }) {
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

  const filter: FileFilter = { platform, page, fileType: fileType || undefined }
  const query = useQuery({ queryKey: botKeys.files(filter), queryFn: () => listFiles(filter) })

  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{query.isLoading ? "" : `共 ${total} 個檔案`}</p>
        <Select value={fileType || "all"} onValueChange={setFileType}>
          <SelectTrigger className="w-28" aria-label="檔案類型">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            {FILE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
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
        <p className="text-muted-foreground">沒有檔案</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>檔名</TableHead>
                  <TableHead>類型</TableHead>
                  <TableHead>大小</TableHead>
                  <TableHead>來源</TableHead>
                  <TableHead>時間</TableHead>
                  <TableHead>動作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{fileDisplayName(f)}</TableCell>
                    <TableCell>{f.file_type}</TableCell>
                    <TableCell>{formatSize(f.file_size)}</TableCell>
                    <TableCell>{f.group_name || f.user_display_name || "—"}</TableCell>
                    <TableCell>{new Date(f.created_at).toLocaleString("zh-TW")}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <DownloadAction file={f} />
                        <DeleteAction file={f} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
        </>
      )}
    </div>
  )
}
