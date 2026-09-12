import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useNavigate, useParams } from "react-router"
import { ClearUnsupportedNote } from "@/components/ai-management/clear-unsupported-note"
import { TagInput } from "@/components/ai-management/tag-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  AGENT_DISPLAY_NAME_MAX,
  AGENT_MODEL_MAX,
  AGENT_NAME_MAX,
  aiManagementKeys,
  createAgent,
  formatJsonObject,
  getAgent,
  listPrompts,
  MODEL_OPTIONS,
  parseJsonObject,
  TOOL_SUGGESTIONS,
  updateAgent,
  type AiAgent,
  type AiAgentCreate,
  type AiAgentPatch,
} from "@/lib/ai-management"
import { ApiError } from "@/lib/api"

interface FormState {
  name: string
  displayName: string
  description: string
  model: string
  systemPromptId: string
  isActive: boolean
  tools: string[]
  settings: string
}

const DEFAULT_FORM: FormState = {
  name: "",
  displayName: "",
  description: "",
  model: MODEL_OPTIONS[1].id,
  systemPromptId: "",
  isActive: true,
  tools: [],
  settings: "",
}

const NO_PROMPT = "__none__"

function formFromAgent(a: AiAgent): FormState {
  return {
    name: a.name,
    displayName: a.display_name ?? "",
    description: a.description ?? "",
    model: a.model,
    systemPromptId: a.system_prompt_id ?? "",
    isActive: a.is_active,
    tools: a.tools ?? [],
    settings: formatJsonObject(a.settings),
  }
}

export default function AgentEditorPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)

  const detailQuery = useQuery({
    queryKey: aiManagementKeys.agentDetail(id ?? ""),
    queryFn: () => getAgent(id!),
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
      initial={isEdit ? formFromAgent(detailQuery.data!) : DEFAULT_FORM}
    />
  )
}

function sameTools(a: string[], b: string[] | null): boolean {
  const right = b ?? []
  return a.length === right.length && a.every((v, i) => v === right[i])
}

function EditorForm({
  id,
  isEdit,
  original,
  initial,
}: {
  id: string | undefined
  isEdit: boolean
  original: AiAgent | null
  initial: FormState
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState<FormState>(initial)
  const [settingsError, setSettingsError] = React.useState<string | null>(null)

  // System prompt 下拉的選項來自 `GET /api/ai/prompts`（讀取只要登入）。
  const promptsQuery = useQuery({ queryKey: aiManagementKeys.promptList(), queryFn: () => listPrompts() })

  const createMutation = useMutation({
    mutationFn: (data: AiAgentCreate) => createAgent(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: aiManagementKeys.agents })
      navigate(`/agents/${created.id}`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: AiAgentPatch) => updateAgent(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiManagementKeys.agents })
      navigate(`/agents/${id}`)
    },
  })

  const isSaving = createMutation.isPending || updateMutation.isPending
  const saveError = createMutation.error ?? updateMutation.error

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  /**
   * 「原本有值、現在被清空」的欄位。後端 PUT 用 `is not None` 組 SQL，送 `null` 等於沒送
   * （ching-tech-os #252），所以這些欄位一律不進 patch，改在欄位旁邊說清楚。
   * `is_active` 不在名單裡：`false` 不是 `None`，停用送得出去。
   */
  const cleared = {
    displayName: isEdit && original!.display_name !== null && form.displayName.trim() === "",
    description: isEdit && original!.description !== null && form.description.trim() === "",
    systemPromptId: isEdit && original!.system_prompt_id !== null && form.systemPromptId === "",
    tools: isEdit && (original!.tools?.length ?? 0) > 0 && form.tools.length === 0,
    settings: isEdit && original!.settings !== null && form.settings.trim() === "",
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsedSettings = parseJsonObject(form.settings)
    if (!parsedSettings.ok) {
      setSettingsError(parsedSettings.error)
      return
    }
    setSettingsError(null)

    if (!isEdit) {
      createMutation.mutate({
        name: form.name.trim(),
        display_name: form.displayName.trim() || null,
        description: form.description.trim() || null,
        model: form.model.trim(),
        system_prompt_id: form.systemPromptId || null,
        is_active: form.isActive,
        tools: form.tools.length > 0 ? form.tools : null,
        settings: parsedSettings.value,
      })
      return
    }

    // `AiAgentUpdate` 八個欄位都可選，只送真的變動的那幾個。
    const patch: AiAgentPatch = {}
    if (form.name.trim() !== original!.name) patch.name = form.name.trim()
    if (!cleared.displayName && (form.displayName.trim() || null) !== original!.display_name) patch.display_name = form.displayName.trim() || null
    if (!cleared.description && (form.description.trim() || null) !== original!.description) patch.description = form.description.trim() || null
    if (form.model.trim() !== original!.model) patch.model = form.model.trim()
    if (!cleared.systemPromptId && (form.systemPromptId || null) !== original!.system_prompt_id) patch.system_prompt_id = form.systemPromptId || null
    if (form.isActive !== original!.is_active) patch.is_active = form.isActive
    if (!cleared.tools && !sameTools(form.tools, original!.tools)) patch.tools = form.tools.length > 0 ? form.tools : null
    if (!cleared.settings && JSON.stringify(parsedSettings.value) !== JSON.stringify(original!.settings)) patch.settings = parsedSettings.value
    if (Object.keys(patch).length === 0) {
      navigate(`/agents/${id}`)
      return
    }
    updateMutation.mutate(patch)
  }

  const prompts = promptsQuery.data?.items ?? []

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{isEdit ? "編輯 Agent" : "新增 Agent"}</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="agent-name">名稱</Label>
            <Input
              id="agent-name"
              required
              maxLength={AGENT_NAME_MAX}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-display-name">顯示名</Label>
            <Input
              id="agent-display-name"
              maxLength={AGENT_DISPLAY_NAME_MAX}
              value={form.displayName}
              onChange={(e) => set("displayName", e.target.value)}
            />
            {cleared.displayName && <ClearUnsupportedNote />}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="agent-description">說明</Label>
          <Textarea id="agent-description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          {cleared.description && <ClearUnsupportedNote />}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="agent-model">模型</Label>
            {/* 後端沒有「列出可用模型」的端點，欄位是自由字串（max_length=32）；
                這裡直接給輸入框加 datalist，常用值沿用舊桌面寫死的那三個。 */}
            <Input
              id="agent-model"
              required
              list="agent-model-options"
              maxLength={AGENT_MODEL_MAX}
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
            />
            <datalist id="agent-model-options">
              {MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">常用：{MODEL_OPTIONS.map((m) => m.id).join("、")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-system-prompt">System Prompt</Label>
            <Select
              value={form.systemPromptId || NO_PROMPT}
              onValueChange={(v) => set("systemPromptId", v === NO_PROMPT ? "" : v)}
            >
              <SelectTrigger id="agent-system-prompt" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROMPT}>不指定</SelectItem>
                {prompts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.display_name || p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cleared.systemPromptId && <ClearUnsupportedNote />}
            {promptsQuery.isError && <p className="text-xs text-destructive">Prompt 清單載入失敗，只能維持現有設定。</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border p-4">
          <Switch id="agent-is-active" checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
          <Label htmlFor="agent-is-active">啟用</Label>
          <span className="text-xs text-muted-foreground">停用的 Agent 被呼叫時後端直接回「已停用」。</span>
        </div>

        <div className="space-y-2">
          <Label htmlFor="agent-tools">工具</Label>
          <TagInput
            id="agent-tools"
            values={form.tools}
            onChange={(next) => set("tools", next)}
            suggestions={TOOL_SUGGESTIONS}
            placeholder="輸入工具名稱後按 Enter"
          />
          <p className="text-xs text-muted-foreground">後端沒有可用工具的端點，名稱要照 provider 認得的寫法填。</p>
          {cleared.tools && <ClearUnsupportedNote />}
        </div>

        <div className="space-y-2">
          <Label htmlFor="agent-settings">額外設定（JSON 物件）</Label>
          <Textarea
            id="agent-settings"
            rows={6}
            className="font-mono text-xs"
            placeholder='{"temperature": 0.2}'
            value={form.settings}
            onChange={(e) => {
              set("settings", e.target.value)
              if (settingsError) setSettingsError(null)
            }}
          />
          {cleared.settings && <ClearUnsupportedNote />}
          {settingsError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>額外設定：{settingsError}</AlertDescription>
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
          <Button type="button" variant="outline" onClick={() => navigate(isEdit ? `/agents/${id}` : "/agents")}>
            取消
          </Button>
        </div>
      </form>
    </div>
  )
}
