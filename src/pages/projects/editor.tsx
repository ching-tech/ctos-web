import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Link, Navigate, useNavigate, useParams } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import {
  canEditProject,
  createProject,
  getProject,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_OPTIONS,
  projectKeys,
  updateProject,
  type ProjectCreate,
  type ProjectDetail,
  type ProjectStatus,
} from "@/lib/projects"
import { listSimpleUsers, simpleUserName, userKeys } from "@/lib/users"

const NO_OWNER = "none"

interface FormState {
  name: string
  customer: string
  status: ProjectStatus
  ownerId: string
  startDate: string
  endDate: string
  description: string
}

const DEFAULT_FORM: FormState = {
  name: "",
  customer: "",
  status: "active",
  ownerId: NO_OWNER,
  startDate: "",
  endDate: "",
  description: "",
}

function formFromProject(p: ProjectDetail): FormState {
  return {
    name: p.name,
    customer: p.customer ?? "",
    status: (PROJECT_STATUS_OPTIONS as string[]).includes(p.status) ? (p.status as ProjectStatus) : "active",
    ownerId: p.owner_id === null ? NO_OWNER : String(p.owner_id),
    startDate: p.start_date ?? "",
    endDate: p.end_date ?? "",
    description: p.description ?? "",
  }
}

export default function ProjectEditorPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { user } = useAuth()

  const detailQuery = useQuery({
    queryKey: projectKeys.detail(id ?? ""),
    queryFn: () => getProject(id!),
    enabled: isEdit,
    retry: false,
  })

  // 新增只有 admin 進得去，其他人導回清單（後端也會擋，這裡只是不給走進死路）。
  if (!isEdit && !user?.is_admin) return <Navigate to="/projects" replace />

  if (isEdit && detailQuery.isError) {
    const err = detailQuery.error
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{err instanceof ApiError ? err.detail : "載入失敗，請稍後再試"}</AlertDescription>
      </Alert>
    )
  }

  // 等讀到資料再掛載表單，避免 Radix Select 在掛載後才被程式化改 value。
  if (isEdit && !detailQuery.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isEdit && !canEditProject(user, detailQuery.data!)) {
    return (
      <div className="space-y-3">
        <Alert variant="destructive" role="alert">
          <AlertDescription>只有專案成員能編輯</AlertDescription>
        </Alert>
        <Link className="text-primary underline underline-offset-4" to={`/projects/${id}`}>
          回專案明細
        </Link>
      </div>
    )
  }

  return (
    <EditorForm
      key={isEdit ? detailQuery.data!.id : "new"}
      id={id}
      isEdit={isEdit}
      initial={isEdit ? formFromProject(detailQuery.data!) : DEFAULT_FORM}
    />
  )
}

function EditorForm({ id, isEdit, initial }: { id: string | undefined; isEdit: boolean; initial: FormState }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState<FormState>(initial)

  const usersQuery = useQuery({ queryKey: userKeys.list, queryFn: listSimpleUsers })
  const users = usersQuery.data?.users ?? []

  const createMutation = useMutation({
    mutationFn: (data: ProjectCreate) => createProject(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
      navigate(`/projects/${created.id}`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: ProjectCreate) => updateProject(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
      navigate(`/projects/${id}`)
    },
  })

  const isSaving = createMutation.isPending || updateMutation.isPending
  const saveError = createMutation.error ?? updateMutation.error

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    const payload: ProjectCreate = {
      name: form.name.trim(),
      customer: form.customer.trim() || null,
      status: form.status,
      owner_id: form.ownerId === NO_OWNER ? null : Number(form.ownerId),
      start_date: form.startDate || null,
      end_date: form.endDate || null,
      description: form.description.trim() || null,
    }
    if (isEdit) updateMutation.mutate(payload)
    else createMutation.mutate(payload)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{isEdit ? "編輯專案" : "新增專案"}</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="project-name">名稱</Label>
          <Input
            id="project-name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="project-customer">客戶</Label>
            <Input
              id="project-customer"
              value={form.customer}
              onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">狀態</span>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as ProjectStatus }))}>
              <SelectTrigger aria-label="狀態" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {PROJECT_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">負責人</span>
            <Select value={form.ownerId} onValueChange={(v) => setForm((f) => ({ ...f, ownerId: v }))}>
              <SelectTrigger aria-label="負責人" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_OWNER}>未指定</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {simpleUserName(u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="project-start">起日</Label>
            <Input
              id="project-start"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-end">迄日</Label>
            <Input
              id="project-end"
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="project-description">描述</Label>
          <Textarea
            id="project-description"
            rows={8}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
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
          <Button type="button" variant="outline" onClick={() => navigate(isEdit ? `/projects/${id}` : "/projects")}>
            取消
          </Button>
        </div>
      </form>
    </div>
  )
}
