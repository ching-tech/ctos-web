import * as React from "react"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DownloadAction } from "@/components/bot/download-action"
import { ImagePreviewDialog } from "@/components/bot/image-preview-dialog"
import { Pagination } from "@/components/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import { botKeys, deleteFile, fileDisplayName, listFiles, type BotFile, type FileFilter, type Platform } from "@/lib/bot"
import { GroupFilterSelect } from "../group-filter"

const PAGE_SIZE = 30
const FILE_TYPES = [
  { value: "image", label: "圖片" },
  { value: "video", label: "影片" },
  { value: "audio", label: "音訊" },
  { value: "file", label: "檔案" },
] as const

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

export default function FilesTab({ platform }: { platform: Platform | "" }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawPage = searchParams.get("page")
  const page = rawPage ? Math.max(1, Number(rawPage) || 1) : 1
  const fileType = searchParams.get("fileType") ?? ""
  const groupId = searchParams.get("group") ?? ""

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

  function setGroup(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value === "all") next.delete("group")
    else next.set("group", value)
    next.delete("page")
    setSearchParams(next)
  }

  const filter: FileFilter = { platform, page, fileType: fileType || undefined, groupId: groupId || undefined }
  const query = useQuery({ queryKey: botKeys.files(filter), queryFn: () => listFiles(filter) })

  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{query.isLoading ? "" : `共 ${total} 個檔案`}</p>
        <div className="flex flex-wrap items-center gap-2">
          <GroupFilterSelect platform={platform} value={groupId} onValueChange={setGroup} ariaLabel="群組" allLabel="所有群組" />
          <Select value={fileType || "all"} onValueChange={setFileType}>
            <SelectTrigger className="w-28" aria-label="檔案類型">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {FILE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{fileDisplayName(f)}</span>
                        {f.nas_path && <Badge variant="tint">NAS</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{f.file_type}</TableCell>
                    <TableCell>{formatSize(f.file_size)}</TableCell>
                    <TableCell>{f.group_name || f.user_display_name || "—"}</TableCell>
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

          <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
        </>
      )}
    </div>
  )
}
