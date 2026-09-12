import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import {
  deleteVoiceSettings,
  getVoiceScopes,
  getVoiceSettings,
  getVoices,
  previewVoice,
  saveVoiceSettings,
  voiceKeys,
  type VoiceConfigField,
  type VoiceConfigSchema,
  type VoiceScope,
  type VoiceSettingsResponse,
  type VoicesResponse,
} from "@/lib/voice"

/** 引擎名稱沒有中文對照表可拿，後端回的是 `get_available_engines()` 的字串（voice_tts.py 385–388）。 */
const ENGINE_LABELS: Record<string, string> = {
  edge: "Edge TTS",
  gemini: "Gemini",
  google_cloud: "Google Cloud TTS",
}

function engineLabel(name: string): string {
  return ENGINE_LABELS[name] ?? name
}

const GENDER_LABELS: Record<string, string> = { female: "女聲", male: "男聲", neutral: "中性" }

/**
 * Edge 的 `name` 是 edge-tts 的 FriendlyName（一長串英文，看不出性別），Gemini 的 `name`
 * 本來就帶了「（女聲）」（voice_tts.py 的 `_GEMINI_VOICES`），所以只在名稱裡還沒有的時候才補。
 */
function voiceOptionLabel(v: { name: string; gender: string }): string {
  const g = GENDER_LABELS[v.gender]
  if (!g || v.name.includes(g)) return v.name
  return `${v.name}（${g}）`
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.detail : fallback
}

/** 「自己／某群組／某 Agent」在下拉裡是一個字串，拆成後端要的 scope 與 scope_id。 */
function parseScopeValue(value: string): { scope: VoiceScope; scopeId: string } {
  if (value === "user") return { scope: "user", scopeId: "" }
  const [scope, ...rest] = value.split(":")
  return { scope: scope as VoiceScope, scopeId: rest.join(":") }
}

function paramText(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value)
}

/** 摘要用：把 `tts_params` 依 schema 的 label 攤成「標籤：值」，schema 沒提到的鍵照樣列出來。 */
function summarize(params: Record<string, unknown>, schema: VoiceConfigSchema): string[] {
  return Object.entries(params).map(([key, value]) => {
    const label = schema[key]?.label ?? key
    return `${label}：${paramText(value) || "（未設定）"}`
  })
}

function SchemaField({
  name,
  field,
  value,
  voices,
  onChange,
}: {
  name: string
  field: VoiceConfigField
  value: unknown
  voices: VoicesResponse["voices"]
  onChange: (value: string | number) => void
}) {
  const id = `voice-param-${name}`
  const label = field.label ?? name

  if (field.type === "select") {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Select value={paramText(value) || undefined} onValueChange={onChange}>
          <SelectTrigger id={id} aria-label={label} className="w-full">
            <SelectValue placeholder={voices.length === 0 ? "這個引擎沒有回傳語音角色" : "請選擇"} />
          </SelectTrigger>
          <SelectContent>
            {voices.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {voiceOptionLabel(v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (field.type === "slider") {
    const min = field.min ?? 0
    const max = field.max ?? 1
    const step = field.step ?? 0.1
    const current = value === undefined || value === "" ? (field.default ?? min) : value
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={id}>{label}</Label>
          <span className="text-sm tabular-nums text-muted-foreground">{paramText(current)}</span>
        </div>
        <input
          id={id}
          type="range"
          className="w-full accent-primary"
          min={min}
          max={max}
          step={step}
          value={Number(current)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={paramText(value)}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function VoiceCard() {
  const queryClient = useQueryClient()
  const [scopeValue, setScopeValue] = React.useState("user")
  const { scope, scopeId } = parseScopeValue(scopeValue)

  const scopes = useQuery({ queryKey: voiceKeys.scopes(), queryFn: getVoiceScopes })

  const settings = useQuery({
    queryKey: voiceKeys.settings(scope, scopeId),
    queryFn: () => getVoiceSettings(scope, scopeId),
    enabled: scope === "user" || scopeId !== "",
  })

  // 表單的引擎與參數。null 代表「還沒從後端的設定帶進來」，資料一到（或換了範圍）就重新帶。
  const [engine, setEngine] = React.useState<string | null>(null)
  const [params, setParams] = React.useState<Record<string, unknown>>({})
  const seededFor = React.useRef<string | null>(null)

  const settingsData: VoiceSettingsResponse | undefined = settings.data
  React.useEffect(() => {
    if (!settingsData) return
    const key = `${scope}:${scopeId}`
    if (seededFor.current === key) return
    seededFor.current = key
    const source = settingsData.current ?? settingsData.effective
    setEngine(source.tts_engine)
    setParams({ ...source.tts_params })
  }, [settingsData, scope, scopeId])

  const voices = useQuery({
    queryKey: voiceKeys.voices(engine ?? ""),
    queryFn: () => getVoices(engine ?? ""),
    enabled: engine !== null,
  })

  const voicesData = voices.data
  const schema: VoiceConfigSchema = React.useMemo(() => voicesData?.config_schema ?? {}, [voicesData])
  const engineOptions = React.useMemo(() => {
    const list = voices.data?.available_engines ?? []
    const all = new Set(list)
    if (engine) all.add(engine)
    if (voices.data?.engine) all.add(voices.data.engine)
    return [...all]
  }, [voices.data, engine])

  /**
   * schema 有 default 的欄位（slider／text）在使用者還沒動過時就算預設值，
   * 顯示與送出都用這一份——不寫回 state，免得 effect 連鎖重繪。
   */
  const resolvedParams = React.useMemo(() => {
    const out: Record<string, unknown> = { ...params }
    for (const [key, field] of Object.entries(schema)) {
      if ((out[key] === undefined || out[key] === "") && field.default !== undefined) out[key] = field.default
    }
    return out
  }, [params, schema])

  function changeEngine(next: string) {
    setEngine(next)
    // 換引擎等於換一套參數表：舊引擎的語音角色在新引擎不存在，留著會送出無效值。
    setParams({})
  }

  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)

  const save = useMutation({
    mutationFn: () =>
      saveVoiceSettings({
        scope,
        scopeId: scopeId || null,
        ttsEngine: engine ?? "",
        ttsParams: resolvedParams,
      }),
    onMutate: () => { setSaveError(null); setSaved(false) },
    onSuccess: async () => {
      setSaved(true)
      await queryClient.invalidateQueries({ queryKey: voiceKeys.settings(scope, scopeId) })
    },
    onError: (e) => setSaveError(errorText(e, "儲存失敗，請稍後再試")),
  })

  const [confirmingClear, setConfirmingClear] = React.useState(false)
  const clear = useMutation({
    mutationFn: () => deleteVoiceSettings(scope, scopeId || null),
    onMutate: () => { setSaveError(null); setSaved(false) },
    onSuccess: async () => {
      seededFor.current = null
      await queryClient.invalidateQueries({ queryKey: voiceKeys.settings(scope, scopeId) })
    },
    onError: (e) => setSaveError(errorText(e, "清除失敗，請稍後再試")),
    onSettled: () => setConfirmingClear(false),
  })

  // ── 試聽 ──
  const [previewText, setPreviewText] = React.useState("你好，這是語音預覽測試")
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [previewError, setPreviewError] = React.useState<string | null>(null)
  // 換掉或離開頁面時要把上一個 object URL 收掉，否則 blob 會留在記憶體裡。
  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const preview = useMutation({
    mutationFn: () => previewVoice({ engine: engine ?? "", params: resolvedParams, text: previewText }),
    onMutate: () => setPreviewError(null),
    onSuccess: (blob) => setPreviewUrl(URL.createObjectURL(blob)),
    onError: (e) => setPreviewError(errorText(e, "試聽失敗，請稍後再試")),
  })

  const isAdmin = scopes.data?.is_admin ?? false
  const effective = settingsData?.effective
  const effectiveSchema = engine === effective?.tts_engine ? schema : {}
  const busy = save.isPending || clear.isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle>語音</CardTitle>
        <CardDescription>
          Bot 用語音回覆時要用哪個引擎與哪個聲音。沒有自己的設定就沿用上一層，一路退到系統預設。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isAdmin && (
          <div className="space-y-2">
            <Label htmlFor="voice-scope">套用範圍</Label>
            <Select value={scopeValue} onValueChange={setScopeValue}>
              <SelectTrigger id="voice-scope" aria-label="套用範圍" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">自己</SelectItem>
                {scopes.data?.groups.map((g) => (
                  <SelectItem key={g.id} value={`group:${g.id}`}>
                    群組：{g.name}
                  </SelectItem>
                ))}
                {scopes.data?.agents.map((a) => (
                  <SelectItem key={a.id} value={`agent:${a.id}`}>
                    Agent：{a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {settings.isPending && <Skeleton className="h-20 w-full" />}
        {settings.isError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{errorText(settings.error, "讀不到語音設定")}</AlertDescription>
          </Alert>
        )}

        {effective && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm" data-testid="voice-effective">
            <p className="font-medium">目前生效</p>
            <p className="text-muted-foreground">引擎：{engineLabel(effective.tts_engine)}</p>
            {summarize(effective.tts_params, effectiveSchema).map((line) => (
              <p key={line} className="text-muted-foreground">{line}</p>
            ))}
            <p className="text-muted-foreground">
              {settingsData?.current ? "這一層有自己的設定。" : "這一層沒有設定，用的是繼承來的值。"}
            </p>
          </div>
        )}

        {engine !== null && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="voice-engine">引擎</Label>
              <Select value={engine} onValueChange={changeEngine}>
                <SelectTrigger id="voice-engine" aria-label="引擎" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {engineOptions.map((name) => (
                    <SelectItem key={name} value={name}>{engineLabel(name)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {voices.isPending && <Skeleton className="h-10 w-full" />}
            {voices.isError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{errorText(voices.error, "讀不到語音角色")}</AlertDescription>
              </Alert>
            )}

            {Object.entries(schema).map(([name, field]) => (
              <SchemaField
                key={name}
                name={name}
                field={field}
                value={resolvedParams[name]}
                voices={voices.data?.voices ?? []}
                onChange={(v) => setParams((prev) => ({ ...prev, [name]: v }))}
              />
            ))}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" disabled={busy} onClick={() => save.mutate()}>儲存</Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !settingsData?.current}
                onClick={() => setConfirmingClear(true)}
              >
                清除
              </Button>
              {saved && <span className="text-sm text-muted-foreground">已儲存。</span>}
            </div>
            {saveError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="voice-preview-text">試聽文字</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="voice-preview-text"
                  className="max-w-xs"
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={preview.isPending}
                  onClick={() => preview.mutate()}
                >
                  試聽
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">每次試聽之間要隔十秒。</p>
              {previewUrl && (
                <audio data-testid="voice-preview-audio" controls src={previewUrl} className="w-full" />
              )}
              {previewError && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{previewError}</AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        )}

        {/*
          照 #29：對話框收在 CardContent 底下、用 open 控制，內容在 confirming 為真時才渲染，
          關閉的退場動畫不會留下吃點擊的 overlay。
        */}
        <AlertDialog
          open={confirmingClear}
          onOpenChange={(open) => { if (!open && !clear.isPending) setConfirmingClear(false) }}
        >
          {confirmingClear && (
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>確定清除這一層的語音設定？</AlertDialogTitle>
                <AlertDialogDescription>
                  清除後這一層會退回繼承上一層的設定，最後退到系統預設。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={clear.isPending}>返回</AlertDialogCancel>
                <Button type="button" variant="destructive" disabled={clear.isPending} onClick={() => clear.mutate()}>
                  確定清除
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          )}
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
