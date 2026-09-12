import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ApiError } from "@/lib/api"
import {
  apiTokenKeys,
  createApiToken,
  listApiTokens,
  revokeApiToken,
  scopeLabel,
  type ApiTokenCreateResponse,
  type ApiTokenInfo,
} from "@/lib/api-tokens"
import { useAuth } from "@/lib/auth-context"
import { NAV_ITEMS } from "@/lib/nav"
import { canAccessApp } from "@/lib/permissions"

/** `ApiTokenCreateRequest.expires_days` 預設 180，null 代表永不過期（models/auth.py 83）。 */
const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: "30", label: "30 天" },
  { value: "90", label: "90 天" },
  { value: "180", label: "180 天" },
  { value: "365", label: "365 天" },
  { value: "never", label: "永不過期" },
]
const DEFAULT_EXPIRY = "180"

function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.detail : fallback
}

function formatDate(v: string | null): string {
  if (!v) return "永不過期"
  return new Date(v).toLocaleDateString("zh-TW")
}

function formatDateTime(v: string | null): string {
  if (!v) return "—"
  return new Date(v).toLocaleString("zh-TW", { hour12: false })
}

/** 建立成功後的一次性畫面：原始 token 只有這一次看得到（services/api_token.py 6–10）。 */
function CreatedTokenView({ created, onClose }: { created: ApiTokenCreateResponse; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false)
  const [copyFailed, setCopyFailed] = React.useState(false)
  const [acknowledged, setAcknowledged] = React.useState(false)

  async function copy() {
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(created.token)
      setCopied(true)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <div className="space-y-4">
      <Alert role="alert">
        <AlertDescription>
          這是唯一一次看到它，關掉就拿不回來；遺失請撤銷後重建。
        </AlertDescription>
      </Alert>
      <div className="space-y-2">
        <Label htmlFor="created-token">權杖</Label>
        <div className="flex items-center gap-2">
          <Input id="created-token" readOnly value={created.token} className="font-mono" />
          <Button type="button" variant="outline" onClick={() => void copy()}>
            複製
          </Button>
        </div>
        {copied && <p className="text-sm text-muted-foreground">已複製到剪貼簿。</p>}
        {copyFailed && <p className="text-sm text-muted-foreground">瀏覽器不給複製，請手動選取上面的字串。</p>}
      </div>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">ctos CLI 用法（讀環境變數 CTOS_TOKEN）：</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
          export CTOS_TOKEN={created.token}
        </pre>
      </div>
      <Label className="flex items-center gap-2">
        <Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} />
        <span>我已經把權杖保存好了</span>
      </Label>
      <DialogFooter>
        <Button type="button" disabled={!acknowledged} onClick={onClose}>
          關閉
        </Button>
      </DialogFooter>
    </div>
  )
}

function CreateTokenDialog() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [scopes, setScopes] = React.useState<string[]>([])
  const [expiry, setExpiry] = React.useState(DEFAULT_EXPIRY)
  const [readOnly, setReadOnly] = React.useState(true)
  const [created, setCreated] = React.useState<ApiTokenCreateResponse | null>(null)

  // 可勾的範圍＝登入者有權限的 app，順序照側邊欄；`inventory-management` 在側邊欄出現兩次，去重。
  const scopeOptions = React.useMemo(() => {
    const owned = Object.keys(user?.permissions?.apps ?? {})
    const navApps = [...new Set(NAV_ITEMS.map((i) => i.app).filter((a): a is string => Boolean(a)))]
    const ordered = [...new Set([...navApps, ...owned])]
    return ordered.filter((app) => owned.includes(app) && canAccessApp(user, app))
  }, [user])

  const mutation = useMutation({
    mutationFn: () =>
      createApiToken({
        name: name.trim(),
        scopes,
        expires_days: expiry === "never" ? null : Number(expiry),
        read_only: readOnly,
      }),
    onSuccess: (res) => {
      setCreated(res)
      void queryClient.invalidateQueries({ queryKey: apiTokenKeys.list })
    },
  })

  function reset() {
    setName("")
    setScopes([])
    setExpiry(DEFAULT_EXPIRY)
    setReadOnly(true)
    setCreated(null)
    mutation.reset()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        // 一次性畫面只能按「關閉」離開，不給點外面或 Esc 溜掉。
        if (!v && created) return
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>建立權杖</Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
        showCloseButton={!created}
      >
        <DialogHeader>
          <DialogTitle>{created ? "權杖已建立" : "建立權杖"}</DialogTitle>
        </DialogHeader>
        {created ? (
          <CreatedTokenView
            created={created}
            onClose={() => {
              setOpen(false)
              reset()
            }}
          />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              mutation.mutate()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="token-name">名稱</Label>
              <Input
                id="token-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：筆電上的 ctos CLI"
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">範圍</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {scopeOptions.map((app) => (
                  <Label key={app} className="flex items-center gap-2 font-normal">
                    <Checkbox
                      checked={scopes.includes(app)}
                      onCheckedChange={(v) =>
                        setScopes((prev) => (v === true ? [...prev, app] : prev.filter((s) => s !== app)))
                      }
                    />
                    <span>{scopeLabel(app)}</span>
                  </Label>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                全部不勾代表不限縮，這個權杖拿得到你目前全部的 app 權限。
              </p>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="token-expiry">有效天數</Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger id="token-expiry" aria-label="有效天數" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="token-read-only">唯讀</Label>
              <Switch id="token-read-only" checked={readOnly} onCheckedChange={setReadOnly} />
            </div>

            {mutation.isError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{errorText(mutation.error, "建立失敗，請稍後再試")}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending}>
                建立
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function TokenRow({ token, onError }: { token: ApiTokenInfo; onError: (message: string) => void }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => revokeApiToken(token.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: apiTokenKeys.list }),
    onError: (e) => onError(errorText(e, "撤銷失敗，請稍後再試")),
  })

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate font-medium">{token.name}</div>
          <div className="text-sm text-muted-foreground">
            {token.scopes.length === 0 ? "全部權限" : token.scopes.map(scopeLabel).join("、")}
            {" · "}
            {token.read_only ? "唯讀" : "可寫"}
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={mutation.isPending}>
              撤銷
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確定撤銷「{token.name}」？</AlertDialogTitle>
              <AlertDialogDescription>
                撤銷後用這組權杖的程式會立刻失效，無法復原。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>返回</AlertDialogCancel>
              <AlertDialogAction onClick={() => mutation.mutate()}>確定撤銷</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">到期</dt>
          <dd>{formatDate(token.expires_at)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">最後使用</dt>
          <dd>{formatDateTime(token.last_used_at)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">建立</dt>
          <dd>{formatDateTime(token.created_at)}</dd>
        </div>
      </dl>
    </div>
  )
}

export function ApiTokensCard() {
  const [notice, setNotice] = React.useState<string | null>(null)
  const query = useQuery({ queryKey: apiTokenKeys.list, queryFn: listApiTokens })

  return (
    <Card>
      <CardHeader>
        <CardTitle>API 權杖</CardTitle>
        <CardDescription>
          給 ctos CLI 與自動化工具用的長效權杖。原始權杖只在建立時顯示一次，之後拿不回來。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CreateTokenDialog />

        {query.isPending && <Skeleton className="h-20 w-full" />}

        {query.isError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{errorText(query.error, "權杖清單載入失敗，請稍後再試")}</AlertDescription>
          </Alert>
        )}

        {notice && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        {query.data && query.data.tokens.length === 0 && (
          <p className="text-sm text-muted-foreground">還沒有任何權杖。</p>
        )}

        {query.data && query.data.tokens.length > 0 && (
          <div className="space-y-3">
            {query.data.tokens.map((t) => (
              <TokenRow key={t.id} token={t} onError={setNotice} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
