import * as React from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api"
import { changePassword } from "@/lib/auth"
import { useAuth } from "@/lib/auth-context"
import type { ChangePasswordBody } from "@/lib/types"

/** 後端 `validate_password_strength` 的 `min_length` 預設 8（services/password.py 87–106）。 */
const MIN_PASSWORD_LENGTH = 8

export function PasswordCard() {
  const { user, refresh } = useAuth()
  const hasPassword = Boolean(user?.has_password)
  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(null)

    // 前端只做這兩條，強度規則留在後端（api/auth.py 616–619）。
    if (next !== confirm) {
      setError("兩次輸入的新密碼不一樣。")
      return
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`新密碼需至少 ${MIN_PASSWORD_LENGTH} 個字元。`)
      return
    }

    setBusy(true)
    try {
      const body: ChangePasswordBody = { new_password: next }
      if (hasPassword) body.current_password = current
      const res = await changePassword(body)
      // 失敗是 200 加 success:false 與 error 字串，不是 4xx（api/auth.py 560–564）。
      if (!res.success) {
        setError(res.error ?? "密碼更新失敗，請稍後再試。")
        return
      }
      setCurrent("")
      setNext("")
      setConfirm("")
      setDone(hasPassword ? "密碼已更新。" : "平台密碼已設定，之後可以用平台帳號登入。")
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "密碼更新失敗，請稍後再試。")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>密碼</CardTitle>
        <CardDescription>
          {hasPassword
            ? "變更平台密碼。改完之後其他裝置已登入的 session 與 API 權杖都不受影響，仍然有效。"
            : "你目前用 NAS 帳號登入，設定平台密碼後兩種都能登。"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          {hasPassword && (
            <div className="space-y-2">
              <Label htmlFor="current-password">目前密碼</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-password">新密碼</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">確認新密碼</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <p className="text-sm text-muted-foreground">新密碼至少 {MIN_PASSWORD_LENGTH} 個字元。</p>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {done && (
            <Alert role="status">
              <AlertDescription>{done}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={busy}>
            {hasPassword ? "變更密碼" : "設定密碼"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
