import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"
import { Markdown } from "@/components/kb/markdown"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import {
  CATEGORY_LABEL,
  createKnowledge,
  getKnowledge,
  kbKeys,
  label,
  SCOPE_LABEL,
  TYPE_LABEL,
  updateKnowledge,
  type Knowledge,
  type KnowledgeCreate,
  type KnowledgeUpdate,
  type Scope,
} from "@/lib/kb"
import type { UserInfo } from "@/lib/types"

const TYPE_OPTIONS = Object.entries(TYPE_LABEL)
const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL)

interface FormState {
  title: string
  content: string
  type: string
  category: string
  scope: Scope
  is_public: boolean
}

const DEFAULT_FORM: FormState = {
  title: "",
  content: "",
  type: "knowledge",
  category: "technical",
  scope: "personal",
  is_public: false,
}

function formFromKnowledge(kb: Knowledge): FormState {
  return {
    title: kb.title,
    content: kb.content,
    type: kb.type,
    category: kb.category,
    scope: kb.scope,
    is_public: kb.is_public,
  }
}

/** 專案明細的「新增條目」會帶 ?scope=project&project_id=<uuid>，這是專案知識唯一的建立管道。 */
function projectIdFromParams(params: URLSearchParams): string | null {
  if (params.get("scope") !== "project") return null
  return params.get("project_id") || null
}

export default function KbEditorPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const projectId = isEdit ? null : projectIdFromParams(searchParams)

  const detailQuery = useQuery({
    queryKey: kbKeys.detail(id ?? ""),
    queryFn: () => getKnowledge(id!),
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

  // 等表單已經套用讀到的資料再掛載 Select，避免掛載後才把 value 從預設值
  // 程式化改成讀到的值（Radix Select 對此時機敏感，曾觀察到掛載後才變更
  // value 會被內部重設回空字串）。
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
      initial={isEdit ? formFromKnowledge(detailQuery.data!) : projectId ? { ...DEFAULT_FORM, scope: "project" } : DEFAULT_FORM}
      original={detailQuery.data ?? null}
      user={user}
      projectId={projectId}
    />
  )
}

function EditorForm({
  id,
  isEdit,
  initial,
  original,
  user,
  projectId,
}: {
  id: string | undefined
  isEdit: boolean
  initial: FormState
  original: Knowledge | null
  user: UserInfo | null
  projectId: string | null
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = React.useState<FormState>(initial)
  const [preview, setPreview] = React.useState(false)

  // 範圍選項依權限收斂：一般使用者只能選「個人」，選「全域」會清空 owner
  // 導致自己失去編輯權。「專案」不在選項裡：它需要 project_id，只能從專案明細
  // 帶 ?scope=project&project_id=… 進來，此時 scope 會因為不在選項內而鎖死。
  const scopeOptions: [Scope, string][] = user?.is_admin
    ? [["personal", SCOPE_LABEL.personal], ["global", SCOPE_LABEL.global]]
    : [["personal", SCOPE_LABEL.personal]]
  const scopeEditable = scopeOptions.some(([value]) => value === form.scope)

  const createMutation = useMutation({
    mutationFn: (data: KnowledgeCreate) => createKnowledge(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: kbKeys.all })
      navigate(`/kb/${created.id}`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: KnowledgeUpdate) => updateKnowledge(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.detail(id!) })
      queryClient.invalidateQueries({ queryKey: kbKeys.all })
      navigate(`/kb/${id}`)
    },
  })

  const isSaving = createMutation.isPending || updateMutation.isPending
  const saveError = createMutation.error ?? updateMutation.error

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return

    if (isEdit) {
      if (!original) return
      const diff: KnowledgeUpdate = {}
      if (form.title !== original.title) diff.title = form.title
      if (form.content !== original.content) diff.content = form.content
      if (form.type !== original.type) diff.type = form.type
      if (form.category !== original.category) diff.category = form.category
      if (scopeEditable && form.scope !== original.scope) diff.scope = form.scope
      if (form.is_public !== original.is_public) diff.is_public = form.is_public
      if (Object.keys(diff).length === 0) {
        navigate(`/kb/${id}`)
        return
      }
      updateMutation.mutate(diff)
    } else {
      if (!user) return
      createMutation.mutate({
        title: form.title,
        content: form.content,
        type: form.type,
        category: form.category,
        scope: form.scope,
        author: user.username,
        is_public: form.is_public,
        ...(projectId ? { project_id: projectId } : {}),
      })
    }
  }

  function onCancel() {
    navigate(isEdit ? `/kb/${id}` : "/kb")
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{isEdit ? "編輯知識" : "新增知識"}</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="kb-title">標題</Label>
          <Input
            id="kb-title"
            required
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <span className="text-sm font-medium">範圍</span>
            <Select
              value={form.scope}
              onValueChange={(v) => setForm((f) => ({ ...f, scope: v as Scope }))}
              disabled={!scopeEditable}
            >
              <SelectTrigger aria-label="範圍" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scopeEditable ? (
                  scopeOptions.map(([value, text]) => (
                    <SelectItem key={value} value={value}>
                      {text}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value={form.scope}>{label(SCOPE_LABEL, form.scope)}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">類型</span>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger aria-label="類型" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map(([value, text]) => (
                  <SelectItem key={value} value={value}>
                    {text}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">分類</span>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger aria-label="分類" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map(([value, text]) => (
                  <SelectItem key={value} value={value}>
                    {text}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="kb-is-public"
            checked={form.is_public}
            onCheckedChange={(checked) => setForm((f) => ({ ...f, is_public: checked === true }))}
          />
          <Label htmlFor="kb-is-public">允許未綁定的 Bot 使用者查詢</Label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">內容</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setPreview((p) => !p)}>
              {preview ? "編輯" : "預覽"}
            </Button>
          </div>
          {preview ? (
            <div className="min-h-64 rounded-lg border p-4">
              <Markdown content={form.content} />
            </div>
          ) : (
            <Textarea
              aria-label="內容"
              rows={16}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            />
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
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
        </div>
      </form>
    </div>
  )
}
