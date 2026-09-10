import * as React from "react"
import { Navigate, useNavigate } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { login } from "@/lib/auth"
import { useAuth } from "@/lib/auth-context"
import type { LoginMethod } from "@/lib/types"

function LoginForm({ method }: { method: LoginMethod }) {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const userLabel = method === "nas" ? "NAS 帳號" : "帳號"

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await login(username, password, method)
      if (!res.success) { setError(res.error ?? "登入失敗"); return }
      await refresh()
      navigate("/", { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "登入失敗")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${method}-username`}>{userLabel}</Label>
        <Input id={`${method}-username`} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${method}-password`}>密碼</Label>
        <Input id={`${method}-password`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "登入中…" : "登入"}</Button>
    </form>
  )
}

export default function LoginPage() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/" replace />
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>ChingTech OS</CardTitle>
          <CardDescription>擎添工業內部系統</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="nas">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="nas">NAS 帳號</TabsTrigger>
              <TabsTrigger value="local">平台帳號</TabsTrigger>
            </TabsList>
            <TabsContent value="nas" aria-labelledby={undefined} aria-label="NAS 登入表單"><LoginForm method="nas" /></TabsContent>
            <TabsContent value="local" aria-labelledby={undefined} aria-label="平台登入表單"><LoginForm method="local" /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  )
}
