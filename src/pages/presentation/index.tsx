import { useMutation } from "@tanstack/react-query"
import { Check, Copy, LoaderCircle, TriangleAlert } from "lucide-react"
import * as React from "react"
import { useLocation } from "react-router"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import { titleForPath } from "@/lib/nav"
import {
  generatePresentation,
  loadPresentationPrefs,
  NUM_SLIDES_DEFAULT,
  NUM_SLIDES_MAX,
  NUM_SLIDES_MIN,
  PRESENTATION_FORMAT_LABEL,
  PRESENTATION_FORMATS,
  PRESENTATION_IMAGE_SOURCE_LABEL,
  PRESENTATION_IMAGE_SOURCES,
  PRESENTATION_NAS_DIR,
  PRESENTATION_THEME_LABEL,
  PRESENTATION_THEMES,
  savePresentationPrefs,
  validateOutlineJson,
  type PresentationForm,
  type PresentationFormat,
  type PresentationImageSource,
  type PresentationMode,
  type PresentationTheme,
} from "@/lib/presentation"

const OUTLINE_PLACEHOLDER = `{
  "title": "泵浦保養三步驟",
  "slides": [
    { "layout": "title", "title": "泵浦保養三步驟" },
    { "layout": "content", "title": "第一步：停機斷電", "bullets": ["掛牌上鎖", "確認殘壓"] }
  ]
}`

function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.detail : fallback
}

export default function PresentationPage() {
  const { pathname } = useLocation()
  const [prefs] = React.useState(loadPresentationPrefs)
  const [form, setForm] = React.useState<PresentationForm>(() => ({
    mode: "topic",
    topic: "",
    outlineJson: "",
    numSlides: NUM_SLIDES_DEFAULT,
    theme: prefs.theme ?? "uncover",
    includeImages: true,
    imageSource: "pexels",
    outputFormat: prefs.outputFormat ?? "html",
  }))
  const [outlineError, setOutlineError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [copyFailed, setCopyFailed] = React.useState(false)

  function patch(next: Partial<PresentationForm>) {
    setForm((f) => {
      const merged = { ...f, ...next }
      if (next.theme !== undefined || next.outputFormat !== undefined) {
        savePresentationPrefs({ theme: merged.theme, outputFormat: merged.outputFormat })
      }
      return merged
    })
  }

  const mutation = useMutation({
    mutationFn: generatePresentation,
    onSuccess: () => {
      setCopied(false)
      setCopyFailed(false)
    },
  })

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (mutation.isPending) return
    if (form.mode === "outline") {
      const problem = validateOutlineJson(form.outlineJson)
      setOutlineError(problem)
      if (problem) return
    } else {
      setOutlineError(null)
      if (!form.topic.trim()) return
    }
    mutation.mutate(form)
  }

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path)
      setCopied(true)
      setCopyFailed(false)
    } catch {
      setCopied(false)
      setCopyFailed(true)
    }
  }

  const canSubmit = form.mode === "topic" ? form.topic.trim().length > 0 : form.outlineJson.trim().length > 0
  const result = mutation.data

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{titleForPath(pathname)}</h1>

      <Alert>
        <TriangleAlert />
        <AlertTitle>送出會真的產生一份檔案</AlertTitle>
        <AlertDescription>
          按下「產生簡報」之後，後端會呼叫 AI 寫大綱（會計入 AI 用量），開了配圖還會去外部圖庫或生圖服務抓圖，
          最後把檔案寫進 NAS 的 <code className="font-mono">{PRESENTATION_NAS_DIR}</code> 資料夾。
          整段通常要等一到三分鐘，頁數多或選 PDF 會更久，請不要重複送出。
        </AlertDescription>
      </Alert>

      <form onSubmit={submit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>內容</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs
              value={form.mode}
              onValueChange={(v) => {
                patch({ mode: v as PresentationMode })
                setOutlineError(null)
              }}
            >
              <TabsList>
                <TabsTrigger value="topic">給主題</TabsTrigger>
                <TabsTrigger value="outline">用大綱 JSON</TabsTrigger>
              </TabsList>
            </Tabs>

            {form.mode === "topic" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="presentation-topic">主題</Label>
                  <Textarea
                    id="presentation-topic"
                    rows={3}
                    placeholder="例如：泵浦保養三步驟"
                    value={form.topic}
                    onChange={(e) => patch({ topic: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">AI 會照這句話寫出大綱，再轉成投影片。</p>
                </div>

                <div className="space-y-2">
                  <div className="text-sm leading-none font-medium">頁數：{form.numSlides} 頁</div>
                  <Slider
                    thumbLabel="頁數"
                    min={NUM_SLIDES_MIN}
                    max={NUM_SLIDES_MAX}
                    step={1}
                    value={[form.numSlides]}
                    onValueChange={([v]) => patch({ numSlides: v })}
                    className="max-w-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    後端只收 {NUM_SLIDES_MIN}–{NUM_SLIDES_MAX} 頁。
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="presentation-outline">大綱 JSON</Label>
                <Textarea
                  id="presentation-outline"
                  rows={10}
                  className="font-mono text-xs"
                  placeholder={OUTLINE_PLACEHOLDER}
                  value={form.outlineJson}
                  onChange={(e) => {
                    patch({ outlineJson: e.target.value })
                    if (outlineError) setOutlineError(null)
                  }}
                  aria-invalid={outlineError ? true : undefined}
                  aria-describedby={outlineError ? "presentation-outline-error" : undefined}
                />
                {outlineError ? (
                  <p id="presentation-outline-error" className="text-xs text-destructive">
                    {outlineError}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    直接給大綱就不叫 AI 寫，頁數由 slides 的長度決定，這裡的頁數設定不會送出。
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>樣式與輸出</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">版型主題</legend>
              <RadioGroup
                value={form.theme}
                onValueChange={(v) => patch({ theme: v as PresentationTheme })}
                className="sm:grid-cols-2"
              >
                {PRESENTATION_THEMES.map((t) => (
                  <Label key={t} htmlFor={`theme-${t}`} className="items-start gap-3 rounded-lg border p-3 font-normal">
                    <RadioGroupItem id={`theme-${t}`} value={t} className="mt-0.5" />
                    <span className="grid gap-0.5">
                      <span className="font-mono text-sm font-medium">{t}</span>
                      <span className="text-xs text-muted-foreground">{PRESENTATION_THEME_LABEL[t]}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>

            <div className="space-y-3">
              <Label htmlFor="presentation-images" className="justify-between">
                <span>自動配圖</span>
                <Switch
                  id="presentation-images"
                  checked={form.includeImages}
                  onCheckedChange={(v) => patch({ includeImages: v })}
                />
              </Label>
              <p className="text-xs text-muted-foreground">
                開著的話每一頁會去抓一張圖再嵌進檔案裡，比較久也比較容易失敗；只要文字就關掉。
              </p>
              <fieldset className="space-y-2" disabled={!form.includeImages}>
                <legend className="text-sm font-medium">圖片來源</legend>
                <RadioGroup
                  value={form.imageSource}
                  onValueChange={(v) => patch({ imageSource: v as PresentationImageSource })}
                  disabled={!form.includeImages}
                  className="sm:grid-cols-3"
                >
                  {PRESENTATION_IMAGE_SOURCES.map((s) => (
                    <Label key={s} htmlFor={`image-${s}`} className="gap-3 rounded-lg border p-3 font-normal">
                      <RadioGroupItem id={`image-${s}`} value={s} />
                      <span className="text-sm">{PRESENTATION_IMAGE_SOURCE_LABEL[s]}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </fieldset>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">輸出格式</legend>
              <RadioGroup
                value={form.outputFormat}
                onValueChange={(v) => patch({ outputFormat: v as PresentationFormat })}
                className="sm:grid-cols-2"
              >
                {PRESENTATION_FORMATS.map((f) => (
                  <Label key={f} htmlFor={`format-${f}`} className="gap-3 rounded-lg border p-3 font-normal">
                    <RadioGroupItem id={`format-${f}`} value={f} />
                    <span className="text-sm">{PRESENTATION_FORMAT_LABEL[f]}</span>
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? <LoaderCircle className="animate-spin" /> : null}
            {mutation.isPending ? "產生中……" : "產生簡報"}
          </Button>
          {mutation.isPending ? (
            <p className="text-sm text-muted-foreground" role="status">
              正在呼叫 AI 並轉檔，通常要一到三分鐘，這一頁先別關。
            </p>
          ) : null}
        </div>
      </form>

      {mutation.isError ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>產生失敗</AlertTitle>
          <AlertDescription>{errorText(mutation.error, "產生簡報失敗，請稍後再試")}</AlertDescription>
        </Alert>
      ) : null}

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>{result.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{result.message}</p>
            <dl className="grid gap-2 text-sm sm:grid-cols-[6rem_1fr]">
              <dt className="text-muted-foreground">頁數</dt>
              <dd>{result.slides_count} 頁</dd>
              <dt className="text-muted-foreground">格式</dt>
              <dd className="uppercase">{result.format}</dd>
              <dt className="text-muted-foreground">檔名</dt>
              <dd className="font-mono break-all">{result.filename}</dd>
              <dt className="text-muted-foreground">NAS 路徑</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <span className="font-mono break-all">{result.nas_path}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => copyPath(result.nas_path)}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "已複製" : "複製路徑"}
                </Button>
              </dd>
            </dl>
            <p className="text-xs text-muted-foreground">
              路徑是相對於 NAS 上的 <code className="font-mono">ching-tech-os/</code> 資料夾。
              檔案管理列的是 NAS 共用資料夾，對不到後端這個掛載點，所以這裡只給路徑，請自己到 NAS 打開。
            </p>
            {copyFailed ? <p className="text-xs text-destructive">瀏覽器不給複製，請手動選取路徑。</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
