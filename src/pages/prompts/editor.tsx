import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useNavigate, useParams } from "react-router"
import { BotPromptAlert } from "@/components/ai-management/bot-prompt-alert"
import { ClearUnsupportedNote } from "@/components/ai-management/clear-unsupported-note"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  aiManagementKeys,
  createPrompt,
  formatJsonObject,
  getPrompt,
  isBotPrompt,
  parseJsonObject,
  PROMPT_CATEGORY_OPTIONS,
  PROMPT_DISPLAY_NAME_MAX,
  PROMPT_NAME_MAX,
  updatePrompt,
  type AiPrompt,
  type AiPromptCreate,
  type AiPromptPatch,
} from "@/lib/ai-management"
import { ApiError } from "@/lib/api"

interface FormState {
  name: string
  displayName: string
  category: string
  content: string
  description: string
  variables: string
}

const DEFAULT_FORM: FormState = { name: "", displayName: "", category: "", content: "", description: "", variables: "" }

const NO_CATEGORY = "__none__"

function formFromPrompt(p: AiPrompt): FormState {
  return {
    name: p.name,
    displayName: p.display_name ?? "",
    category: p.category ?? "",
    content: p.content,
    description: p.description ?? "",
    variables: formatJsonObject(p.variables),
  }
}

export default function PromptEditorPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)

  const detailQuery = useQuery({
    queryKey: aiManagementKeys.promptDetail(id ?? ""),
    queryFn: () => getPrompt(id!),
    enabled: isEdit,
    retry: false,
  })

  if (isEdit && detailQuery.isError) {
    const err = detailQuery.error
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{err instanceof ApiError ? err.detail : "載入失敗，請稍後再試"}</AlertDescription>
      </Alert>
    )
  }

  if (isEdit && !detailQuery.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <EditorForm
      key={isEdit ? detailQuery.data!.id : "new"}
      id={id}
      isEdit={isEdit}
      original={isEdit ? detailQuery.data! : null}
      initial={isEdit ? formFromPrompt(detailQuery.data!) : DEFAULT_FORM}
    />
  )
}

function EditorForm({
  id,
  isEdit,
  original,
  initial,
}: {
  id: string | undefined
  isEdit: boolean
  original: AiPrompt | null
  initial: FormState
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState<FormState>(initial)
  const [variablesError, setVariablesError] = React.useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (data: AiPromptCreate) => createPrompt(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: aiManagementKeys.prompts })
      navigate(`/prompts/${created.id}`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: AiPromptPatch) => updatePrompt(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiManagementKeys.prompts })
      navigate(`/prompts/${id}`)
    },
  })

  const isSaving = createMutation.isPending || updateMutation.isPending
  const saveError = createMutation.error ?? updateMutation.error

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  /**
   * 「原本有值、現在被清空」的欄位。後端的 PUT 用 `is not None` 組 SQL，送 `null` 等於沒送
   * （ching-tech-os #252），所以這些欄位一律不進 patch，改在欄位旁邊說清楚。
   */
  const cleared = {
    displayName: isEdit && original!.display_name !== null && form.displayName.trim() === "",
    category: isEdit && original!.category !== null && form.category === "",
    description: isEdit && original!.description !== null && form.description.trim() === "",
    variables: isEdit && original!.variables !== null && form.variables.trim() === "",
  }

  // 既有值不在預設選項裡時把它補進去，免得開編輯頁就把別人設的分類洗掉。
  const categoryOptions = React.useMemo(() => {
    const known = [...PROMPT_CATEGORY_OPTIONS] as string[]
    if (initial.category && !known.includes(initial.category)) known.push(initial.category)
    return known
  }, [initial.category])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsedVariables = parseJsonObject(form.variables)
    if (!parsedVariables.ok) {
      setVariablesError(parsedVariables.error)
      return
    }
    setVariablesError(null)

    if (!isEdit) {
      createMutation.mutate({
        name: form.name.trim(),
        display_name: form.displayName.trim() || null,
        category: form.category || null,
        content: form.content,
        description: form.description.trim() || null,
        variables: parsedVariables.value,
      })
      return
    }

    // `AiPromptUpdate` 每個欄位都可選，只送真的變動的那幾個。
    const patch: AiPromptPatch = {}
    if (form.name.trim() !== original!.name) patch.name = form.name.trim()
    if (!cleared.displayName && (form.displayName.trim() || null) !== original!.display_name) patch.display_name = form.displayName.trim() || null
    if (!cleared.category && (form.category || null) !== original!.category) patch.category = form.category || null
    if (form.content !== original!.content) patch.content = form.content
    if (!cleared.description && (form.description.trim() || null) !== original!.description) patch.description = form.description.trim() || null
    if (!cleared.variables && JSON.stringify(parsedVariables.value) !== JSON.stringify(original!.variables)) patch.variables = parsedVariables.value
    if (Object.keys(patch).length === 0) {
      navigate(`/prompts/${id}`)
      return
    }
    updateMutation.mutate(patch)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{isEdit ? "編輯 Prompt" : "新增 Prompt"}</h1>

      {isEdit && isBotPrompt(initial.name) && <BotPromptAlert name={initial.name} />}

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="prompt-name">名稱</Label>
            <Input
              id="prompt-name"
              required
              maxLength={PROMPT_NAME_MAX}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">唯一識別名，Agent 與程式碼用它找這份提示詞。</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prompt-display-name">顯示名</Label>
            <Input
              id="prompt-display-name"
              maxLength={PROMPT_DISPLAY_NAME_MAX}
              value={form.displayName}
              onChange={(e) => set("displayName", e.target.value)}
            />
            {cleared.displayName && <ClearUnsupportedNote />}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="prompt-category">分類</Label>
          <Select
            value={form.category || NO_CATEGORY}
            onValueChange={(v) => set("category", v === NO_CATEGORY ? "" : v)}
          >
            <SelectTrigger id="prompt-category" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>不指定</SelectItem>
              {categoryOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {cleared.category && <ClearUnsupportedNote />}
        </div>

        <div className="space-y-2">
          <Label htmlFor="prompt-content">內容</Label>
          <Textarea
            id="prompt-content"
            required
            rows={16}
            className="font-mono text-xs"
            value={form.content}
            onChange={(e) => set("content", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="prompt-description">說明</Label>
          <Textarea id="prompt-description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          {cleared.description && <ClearUnsupportedNote />}
        </div>

        <div className="space-y-2">
          <Label htmlFor="prompt-variables">變數（JSON 物件）</Label>
          <Textarea
            id="prompt-variables"
            rows={6}
            className="font-mono text-xs"
            placeholder='{"user_name": "使用者名稱"}'
            value={form.variables}
            onChange={(e) => {
              set("variables", e.target.value)
              if (variablesError) setVariablesError(null)
            }}
          />
          <p className="text-xs text-muted-foreground">留空代表沒有變數。後端收的是物件，陣列或純量會被擋下來。</p>
          {cleared.variables && <ClearUnsupportedNote />}
          {variablesError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>變數：{variablesError}</AlertDescription>
            </Alert>
          )}
        </div>

        {saveError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{saveError instanceof ApiError ? saveError.detail : "儲存失敗，請稍後再試"}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "儲存中…" : "儲存"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(isEdit ? `/prompts/${id}` : "/prompts")}>
            取消
          </Button>
        </div>
      </form>
    </div>
  )
}
