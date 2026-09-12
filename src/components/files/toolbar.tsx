import { useMutation, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api"
import { joinPath, mkdirNas, nasKeys, uploadNasFile } from "@/lib/nas"

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.detail : fallback
}

/** 上傳與新資料夾。兩支都是做完重抓目前這一層的清單，不做逐檔進度。 */
export function FilesToolbar({ path }: { path: string }) {
  const queryClient = useQueryClient()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [mkdirOpen, setMkdirOpen] = React.useState(false)
  const [folderName, setFolderName] = React.useState("")

  const refresh = () => queryClient.invalidateQueries({ queryKey: nasKeys.list(path) })

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      // 一次一個檔：後端一支端點只收一個 file，多檔就逐一送。
      for (const file of files) await uploadNasFile(path, file)
    },
    onSuccess: refresh,
  })

  const mkdir = useMutation({
    mutationFn: (name: string) => mkdirNas(joinPath(path, name)),
    onSuccess: () => {
      setMkdirOpen(false)
      setFolderName("")
      return refresh()
    },
  })

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          aria-label="選擇要上傳的檔案"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ""
            if (files.length > 0) upload.mutate(files)
          }}
        />
        <Button variant="outline" size="sm" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
          {upload.isPending ? "上傳中…" : "上傳"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            mkdir.reset()
            setFolderName("")
            setMkdirOpen(true)
          }}
        >
          新資料夾
        </Button>
      </div>

      {upload.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{errorText(upload.error, "上傳失敗，請稍後再試")}</AlertDescription>
        </Alert>
      )}

      <Dialog open={mkdirOpen} onOpenChange={setMkdirOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新資料夾</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (folderName.trim()) mkdir.mutate(folderName.trim())
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="nas-folder-name">資料夾名稱</Label>
              <Input id="nas-folder-name" aria-label="資料夾名稱" value={folderName} onChange={(e) => setFolderName(e.target.value)} />
            </div>
            {mkdir.isError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{errorText(mkdir.error, "建立失敗，請稍後再試")}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={mkdir.isPending || !folderName.trim()}>
              建立
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
