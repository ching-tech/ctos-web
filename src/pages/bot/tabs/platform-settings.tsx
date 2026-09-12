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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ApiError } from "@/lib/api"
import { PLATFORM_LABEL, type Platform } from "@/lib/bot"
import {
  botSettingsKeys,
  deleteBotSettings,
  FIELD_LABEL,
  getBotSettings,
  isSensitiveField,
  PLATFORM_FIELDS,
  sourceLabel,
  testBotConnection,
  updateBotSettings,
  type BotFieldStatus,
  type BotSettingsField,
} from "@/lib/bot-settings"

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.detail : fallback
}

/**
 * 一個憑證欄位。明文只存在於這個元件的 state 與送出的 body 裡：不寫進網址、不進 query 快取，
 * 送出後立刻清掉；輸入框一律 `autoComplete="off"`，敏感欄位再加 `type="password"`。
 */
function FieldRow({
  platform,
  field,
  status,
}: {
  platform: Platform
  field: BotSettingsField
  status: BotFieldStatus | undefined
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = React.useState(false)
  const [value, setValue] = React.useState("")
  const inputId = `${platform}-${field}`

  const mutation = useMutation({
    mutationFn: (next: string) => updateBotSettings(platform, { [field]: next }),
    onSuccess: () => {
      setValue("")
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: botSettingsKeys.platform(platform) })
    },
  })

  function cancel() {
    setValue("")
    setEditing(false)
    mutation.reset()
  }

  const source = status?.source ?? "none"

  return (
    <div className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{FIELD_LABEL[field]}</span>
        <Badge variant="tint">{sourceLabel(source)}</Badge>
        <span className="font-mono text-sm text-muted-foreground">
          {status?.has_value ? status.masked_value : "—"}
        </span>
        {status?.updated_at && (
          <span className="text-xs text-muted-foreground">
            更新於 {new Date(status.updated_at).toLocaleString("zh-TW")}
          </span>
        )}
        {!editing && (
          <Button
            className="ms-auto"
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            aria-label={`更換 ${FIELD_LABEL[field]}`}
          >
            更換
          </Button>
        )}
      </div>

      {editing && (
        <div className="space-y-2">
          <Label htmlFor={inputId}>新的 {FIELD_LABEL[field]}</Label>
          <Input
            id={inputId}
            type={isSensitiveField(field) ? "password" : "text"}
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {mutation.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{errorText(mutation.error, "儲存失敗，請稍後再試")}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={value === "" || mutation.isPending}
              onClick={() => mutation.mutate(value)}
              aria-label={`儲存 ${FIELD_LABEL[field]}`}
            >
              儲存
            </Button>
            <Button size="sm" variant="outline" onClick={cancel}>
              取消
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProactivePushSwitch({ platform, enabled }: { platform: Platform; enabled: boolean }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (next: boolean) => updateBotSettings(platform, { proactive_push_enabled: next }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: botSettingsKeys.platform(platform) }),
  })
  const id = `${platform}-proactive-push`

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center gap-2">
        <Switch
          id={id}
          checked={enabled}
          disabled={mutation.isPending}
          onCheckedChange={(v) => mutation.mutate(v)}
        />
        <Label htmlFor={id}>主動推送</Label>
      </div>
      {mutation.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{errorText(mutation.error, "更新失敗，請稍後再試")}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

/** 卡片下方的兩個動作：測試連線與清除資料庫設定。訊息放在按鈕列下方，佔整張卡的寬度。 */
function PlatformActions({ platform }: { platform: Platform }) {
  const queryClient = useQueryClient()
  const test = useMutation({ mutationFn: () => testBotConnection(platform) })
  const clear = useMutation({
    mutationFn: () => deleteBotSettings(platform),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: botSettingsKeys.platform(platform) }),
  })

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={test.isPending} onClick={() => test.mutate()}>
          測試連線
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline">清除資料庫設定</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確定清除 {PLATFORM_LABEL[platform]} 的資料庫設定？</AlertDialogTitle>
              <AlertDialogDescription>
                清除後改用 .env 的值；若 .env 也沒有設定，這個 Bot 會停止運作。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={() => clear.mutate()}>確定</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* 後端連線失敗也是 200 加 success:false（api/bot_settings.py 165–184），訊息原樣顯示。 */}
      {test.data && (
        <Alert variant={test.data.success ? "default" : "destructive"} role={test.data.success ? "status" : "alert"}>
          <AlertDescription>{test.data.message}</AlertDescription>
        </Alert>
      )}
      {test.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{errorText(test.error, "測試失敗，請稍後再試")}</AlertDescription>
        </Alert>
      )}
      {clear.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{errorText(clear.error, "清除失敗，請稍後再試")}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function PlatformCard({ platform }: { platform: Platform }) {
  const query = useQuery({
    queryKey: botSettingsKeys.platform(platform),
    queryFn: () => getBotSettings(platform),
  })

  return (
    <section aria-label={`${PLATFORM_LABEL[platform]} 平台設定`}>
      <Card>
        <CardHeader>
          <CardTitle>{PLATFORM_LABEL[platform]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.isError ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{errorText(query.error, "載入失敗，請稍後再試")}</AlertDescription>
            </Alert>
          ) : query.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              {PLATFORM_FIELDS[platform].map((field) => (
                <FieldRow key={field} platform={platform} field={field} status={query.data?.fields[field]} />
              ))}
              <ProactivePushSwitch platform={platform} enabled={query.data?.proactive_push_enabled ?? false} />
              <PlatformActions platform={platform} />
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

export default function PlatformSettingsTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        憑證只顯示遮罩值，後端不會回明文。資料庫沒有值時自動改用 .env 的設定。
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <PlatformCard platform="line" />
        <PlatformCard platform="telegram" />
      </div>
    </div>
  )
}
