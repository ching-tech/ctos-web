import { useMutation } from "@tanstack/react-query"
import * as React from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api"
import { connectNas, NAS_HOST_DEFAULT, type NasConnection } from "@/lib/nas"

/**
 * NAS 連線對話框。
 *
 * 後端帳密錯誤時回的是 200 加 `{success:false, error}`（不是 401），連不到 NAS 才是 503；
 * 兩種都把後端給的字串原樣顯示。
 */
export function ConnectDialog({
  open,
  onOpenChange,
  onConnected,
  username: initialUsername,
  host: initialHost,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected: (conn: NasConnection) => void
  username?: string | null
  host?: string | null
}) {
  const [host, setHost] = React.useState(initialHost || NAS_HOST_DEFAULT)
  const [username, setUsername] = React.useState(initialUsername || "")
  const [password, setPassword] = React.useState("")
  const [failure, setFailure] = React.useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => connectNas({ host, username, password }),
    onSuccess: (data) => {
      if (!data.success || !data.token) {
        setFailure(data.error || "連線失敗，請稍後再試")
        return
      }
      setFailure(null)
      setPassword("")
      onConnected({ token: data.token, host: data.host || host, username })
    },
  })

  function handleOpenChange(next: boolean) {
    if (!next) {
      setPassword("")
      setFailure(null)
      mutation.reset()
    }
    onOpenChange(next)
  }

  const error = failure ?? (mutation.isError ? (mutation.error instanceof ApiError ? mutation.error.detail : "連線失敗，請稍後再試") : null)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>連線 NAS</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            setFailure(null)
            mutation.mutate()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="nas-host">主機位址</Label>
            <Input id="nas-host" aria-label="主機位址" value={host} onChange={(e) => setHost(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nas-username">帳號</Label>
            <Input id="nas-username" aria-label="帳號" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nas-password">密碼</Label>
            <Input
              id="nas-password"
              aria-label="密碼"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={mutation.isPending || !host || !username}>
            連線
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
