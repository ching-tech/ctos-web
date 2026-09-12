import { useMutation, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { ShareDialog } from "@/components/share-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api"
import { createNasShareLink, deleteNasItem, nasKeys, renameNas, type NasItemType } from "@/lib/nas"

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.detail : fallback
}

/**
 * 每一列的動作：重新命名、刪除，以及有權限又在可分享路徑底下才出現的分享連結。
 *
 * `shareResourceId` 由呼叫端算好（見 `lib/nas.ts` 的 `toShareResourceId`），
 * null 代表這個檔案不在可分享的掛載點底下，不顯示按鈕。
 */
export function FileRowActions({
  path,
  name,
  type,
  listPath,
  shareResourceId,
  onDeleted,
  onRenamed,
}: {
  path: string
  name: string
  type: NasItemType
  listPath: string
  shareResourceId: string | null
  onDeleted: () => void
  /** 改名成功後通知呼叫端，開著的預覽要跟著換路徑（否則預覽會指到不存在的舊檔名）。 */
  onRenamed: (newName: string) => void
}) {
  const queryClient = useQueryClient()
  const [dialog, setDialog] = React.useState<"rename" | "delete" | "share" | null>(null)
  const [newName, setNewName] = React.useState(name)
  const [recursive, setRecursive] = React.useState(false)

  const refresh = () => queryClient.invalidateQueries({ queryKey: nasKeys.list(listPath) })

  const rename = useMutation({
    mutationFn: () => renameNas(path, newName.trim()),
    onSuccess: () => {
      setDialog(null)
      onRenamed(newName.trim())
      return refresh()
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteNasItem(path, recursive),
    onSuccess: () => {
      setDialog(null)
      onDeleted()
      return refresh()
    },
  })

  function open(next: "rename" | "delete" | "share") {
    rename.reset()
    remove.reset()
    setNewName(name)
    setRecursive(false)
    setDialog(next)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label={`${name} 的動作`}>
            動作
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => open("rename")}>重新命名</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open("delete")}>刪除</DropdownMenuItem>
          {shareResourceId && <DropdownMenuItem onSelect={() => open("share")}>分享連結</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "rename"} onOpenChange={(o) => setDialog(o ? "rename" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重新命名</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (newName.trim() && newName.trim() !== name) rename.mutate()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="nas-new-name">新名稱</Label>
              <Input id="nas-new-name" aria-label="新名稱" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            {rename.isError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{errorText(rename.error, "重新命名失敗，請稍後再試")}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={rename.isPending || !newName.trim() || newName.trim() === name}>
              儲存
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(o) => setDialog(o ? "delete" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>刪除確認</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm break-all">確定要刪除「{name}」嗎？這個動作無法復原。</p>
            {type === "directory" && (
              <div className="flex items-center gap-2">
                <Checkbox id="nas-recursive" checked={recursive} onCheckedChange={(c) => setRecursive(c === true)} />
                <Label htmlFor="nas-recursive">連同資料夾裡的內容一起刪除</Label>
              </div>
            )}
            {remove.isError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{errorText(remove.error, "刪除失敗，請稍後再試")}</AlertDescription>
              </Alert>
            )}
            <div className="flex items-center gap-2">
              <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
                刪除
              </Button>
              <Button variant="outline" onClick={() => setDialog(null)}>
                取消
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {shareResourceId && (
        <ShareDialog
          open={dialog === "share"}
          onOpenChange={(o) => setDialog(o ? "share" : null)}
          ariaLabel="分享此份檔案"
          createLink={(opts) => createNasShareLink(shareResourceId, opts)}
        />
      )}
    </>
  )
}
