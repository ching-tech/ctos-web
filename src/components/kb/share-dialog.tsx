import { useMutation } from "@tanstack/react-query"
import * as React from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ApiError } from "@/lib/api"
import { createShareLink } from "@/lib/kb"

type ExpiryOption = "1h" | "24h" | "7d" | "never"

const EXPIRY_OPTIONS: { value: ExpiryOption; label: string }[] = [
  { value: "1h", label: "1 小時" },
  { value: "24h", label: "24 小時" },
  { value: "7d", label: "7 天" },
  { value: "never", label: "永久" },
]

export function ShareDialog({
  id,
  open,
  onOpenChange,
}: {
  id: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [expiry, setExpiry] = React.useState<ExpiryOption>("24h")
  const [password, setPassword] = React.useState("")
  const [copyStatus, setCopyStatus] = React.useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => createShareLink(id, { expires_in: expiry === "never" ? null : expiry, password }),
  })

  function reset() {
    setExpiry("24h")
    setPassword("")
    setCopyStatus(null)
    mutation.reset()
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function copyLink(fullUrl: string) {
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopyStatus("已複製")
    } catch {
      setCopyStatus("請手動複製")
    }
  }

  const link = mutation.data

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* 標題用純文字 h2 而非 DialogTitle：
          Radix 會把 DialogTitle 的文字透過 aria-labelledby 接到 DialogContent 上，
          若與下方「分享連結」欄位的 aria-label 完全相同，會讓 getByLabel 同時配對到對話框本身。
          這裡改給 DialogContent 一個語意相近但不同字串的 aria-label 來避免衝突。 */}
      <DialogContent aria-label="分享此篇知識">
        <DialogHeader>
          <h2 className="font-heading text-base leading-none font-medium">分享連結</h2>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-medium">有效期</span>
            <RadioGroup value={expiry} onValueChange={(v) => setExpiry(v as ExpiryOption)}>
              {EXPIRY_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center gap-2">
                  <RadioGroupItem value={opt.value} id={`share-expiry-${opt.value}`} />
                  <Label htmlFor={`share-expiry-${opt.value}`}>{opt.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="share-password">密碼（選填）</Label>
            <Input
              id="share-password"
              aria-label="密碼（選填）"
              maxLength={4}
              inputMode="numeric"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {mutation.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {mutation.error instanceof ApiError ? mutation.error.detail : "建立連結失敗，請稍後再試"}
              </AlertDescription>
            </Alert>
          )}

          {!link ? (
            <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              建立連結
            </Button>
          ) : (
            <div className="space-y-2">
              <Input readOnly aria-label="分享連結" value={link.full_url} />
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => copyLink(link.full_url)}>
                  複製
                </Button>
                {copyStatus && <span className="text-sm text-muted-foreground">{copyStatus}</span>}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
