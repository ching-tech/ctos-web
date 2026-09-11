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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import {
  botKeys,
  generateBindingCode,
  getBindingStatus,
  PLATFORM_LABEL,
  unbind,
  type Platform,
  type PlatformBindingStatus,
} from "@/lib/bot"

function PlatformAvatar({ pictureUrl, name }: { pictureUrl: string | null; name: string }) {
  if (pictureUrl) {
    return <img src={pictureUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
  }
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
      {name.slice(0, 1)}
    </div>
  )
}

function PlatformCard({ platform, status }: { platform: Platform; status: PlatformBindingStatus | null }) {
  const queryClient = useQueryClient()
  const [copyStatus, setCopyStatus] = React.useState<string | null>(null)

  const codeMutation = useMutation({ mutationFn: () => generateBindingCode(platform) })
  const unbindMutation = useMutation({
    mutationFn: () => unbind(platform),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: botKeys.binding }),
  })

  const isBound = status?.is_bound ?? false

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopyStatus("已複製")
    } catch {
      setCopyStatus("請手動複製")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{PLATFORM_LABEL[platform]}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isBound ? (
          <>
            <div className="flex items-center gap-3">
              <PlatformAvatar pictureUrl={status?.picture_url ?? null} name={status?.display_name || PLATFORM_LABEL[platform]} />
              <div className="min-w-0">
                <p className="truncate font-medium">{status?.display_name || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  綁定時間：{status?.bound_at ? new Date(status.bound_at).toLocaleString("zh-TW") : "—"}
                </p>
              </div>
            </div>

            {unbindMutation.isError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>
                  {unbindMutation.error instanceof ApiError ? unbindMutation.error.detail : "解除綁定失敗，請稍後再試"}
                </AlertDescription>
              </Alert>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">解除綁定</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>確定解除 {PLATFORM_LABEL[platform]} 綁定？</AlertDialogTitle>
                  <AlertDialogDescription>解除後需重新產生驗證碼才能再次綁定。</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={() => unbindMutation.mutate()}>確定</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : codeMutation.data ? (
          <div className="space-y-2">
            <p className="text-3xl font-bold tracking-widest">{codeMutation.data.code}</p>
            <p className="text-xs text-muted-foreground">
              到期時間：{new Date(codeMutation.data.expires_at).toLocaleString("zh-TW")}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => copyCode(codeMutation.data!.code)}>
                複製
              </Button>
              {copyStatus && <span className="text-xs text-muted-foreground">{copyStatus}</span>}
            </div>
            <p className="text-xs text-muted-foreground">在 Bot 對話輸入此驗證碼完成綁定</p>
          </div>
        ) : (
          <>
            {codeMutation.isError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>
                  {codeMutation.error instanceof ApiError ? codeMutation.error.detail : "產生驗證碼失敗，請稍後再試"}
                </AlertDescription>
              </Alert>
            )}
            <Button onClick={() => codeMutation.mutate()}>產生驗證碼</Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function BindingTab() {
  const bindingQuery = useQuery({ queryKey: botKeys.binding, queryFn: getBindingStatus })

  if (bindingQuery.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (bindingQuery.isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>
          {bindingQuery.error instanceof ApiError ? bindingQuery.error.detail : "載入失敗，請稍後再試"}
        </AlertDescription>
      </Alert>
    )
  }

  const data = bindingQuery.data!

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <PlatformCard platform="line" status={data.line} />
      <PlatformCard platform="telegram" status={data.telegram} />
    </div>
  )
}
