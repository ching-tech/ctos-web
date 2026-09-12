import * as React from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api"
import { bindNas, unbindNas } from "@/lib/auth"
import { useAuth } from "@/lib/auth-context"
import { ApiTokensCard } from "@/pages/settings/api-tokens"
import { PasswordCard } from "@/pages/settings/password"

function NasBindingCard() {
  const { user, refresh } = useAuth()
  const [nasUser, setNasUser] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); await refresh(); setPassword("") }
    catch (e) { setError(e instanceof ApiError ? e.detail : "操作失敗，請稍後再試") }
    finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>NAS 帳號綁定</CardTitle>
        <CardDescription>綁定後可用 NAS 帳號登入，檔案功能也會用這個帳號連線。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {user?.nas_username ? (
          <div className="flex items-center justify-between gap-4">
            <span>已綁定：{user.nas_username}</span>
            <Button variant="outline" disabled={busy} onClick={() => run(unbindNas)}>解除綁定</Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(() => bindNas(nasUser, password)) }}>
            <div className="space-y-2">
              <Label htmlFor="nas-username">NAS 帳號</Label>
              <Input id="nas-username" value={nasUser} onChange={(e) => setNasUser(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nas-password">NAS 密碼</Label>
              <Input id="nas-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" disabled={busy}>綁定</Button>
          </form>
        )}
        {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="text-sm font-medium text-muted-foreground">設定</h1>
      <Card>
        <CardHeader><CardTitle>帳號</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="text-muted-foreground">帳號</div><div>{user.username}</div>
          <div className="text-muted-foreground">顯示名稱</div><div>{user.display_name || "（未設定）"}</div>
          <div className="text-muted-foreground">角色</div><div>{user.role === "admin" ? "管理員" : "使用者"}</div>
          <div className="text-muted-foreground">平台密碼</div><div>{user.has_password ? "已設定平台密碼" : "尚未設定平台密碼"}</div>
        </CardContent>
      </Card>
      <PasswordCard />
      <NasBindingCard />
      <ApiTokensCard />
    </div>
  )
}
