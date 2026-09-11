import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import {
  createTask,
  deleteTask,
  projectKeys,
  TASK_STATUS_LABEL,
  TASK_STATUS_OPTIONS,
  updateTask,
  type ProjectDetail,
  type Task,
  type TaskStatus,
} from "@/lib/projects"
import { listSimpleUsers, simpleUserName, userKeys } from "@/lib/users"

const NONE = "none"

function AddTaskDialog({ project }: { project: ProjectDetail }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [assigneeId, setAssigneeId] = React.useState(NONE)
  const [milestoneId, setMilestoneId] = React.useState(NONE)
  const [dueDate, setDueDate] = React.useState("")

  const usersQuery = useQuery({ queryKey: userKeys.list, queryFn: listSimpleUsers, enabled: open })
  const users = usersQuery.data?.users ?? []

  const mutation = useMutation({
    mutationFn: () =>
      createTask(project.id, {
        title: title.trim(),
        description: description.trim() || null,
        assignee_id: assigneeId === NONE ? null : Number(assigneeId),
        milestone_id: milestoneId === NONE ? null : milestoneId,
        status: "todo",
        due_date: dueDate || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(project.id) })
      setOpen(false)
      setTitle("")
      setDescription("")
      setAssigneeId(NONE)
      setMilestoneId(NONE)
      setDueDate("")
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) mutation.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          新增任務
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增任務</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!title.trim()) return
            mutation.mutate()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="task-title">任務標題</Label>
            <Input id="task-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">描述</Label>
            <Textarea id="task-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <span className="text-sm font-medium">負責人</span>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger aria-label="任務負責人" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>未指定</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {simpleUserName(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <span className="text-sm font-medium">里程碑</span>
              <Select value={milestoneId} onValueChange={setMilestoneId}>
                <SelectTrigger aria-label="里程碑" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>未指定</SelectItem>
                  {project.milestones.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-due">到期日</Label>
            <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          {mutation.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {mutation.error instanceof ApiError ? mutation.error.detail : "新增失敗，請稍後再試"}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              新增
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TaskRow({
  task,
  project,
  canEdit,
}: {
  task: Task
  project: ProjectDetail
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: projectKeys.detail(project.id) })

  const statusMutation = useMutation({
    mutationFn: (status: TaskStatus) => updateTask(project.id, task.id, { status }),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({
    mutationFn: () => deleteTask(project.id, task.id),
    onSuccess: invalidate,
  })

  const milestoneName = project.milestones.find((m) => m.id === task.milestone_id)?.name
  const error = statusMutation.error ?? deleteMutation.error

  return (
    <li className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{task.title}</span>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <Select value={task.status} onValueChange={(v) => statusMutation.mutate(v as TaskStatus)}>
              <SelectTrigger aria-label="任務狀態" size="sm" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {TASK_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-muted-foreground">{TASK_STATUS_LABEL[task.status as TaskStatus] ?? task.status}</span>
          )}
          {canEdit && (
            <Button variant="ghost" size="sm" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              刪除
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
        <span>{task.assignee_name || "未指派"}</span>
        <span>{milestoneName || "未歸里程碑"}</span>
        <span>{task.due_date || "無到期日"}</span>
      </div>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error instanceof ApiError ? error.detail : "操作失敗，請稍後再試"}</AlertDescription>
        </Alert>
      )}
    </li>
  )
}

export default function TasksTab({ project, canEdit }: { project: ProjectDetail; canEdit: boolean }) {
  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">共 {project.tasks.length} 項任務</p>
        {canEdit && <AddTaskDialog project={project} />}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {TASK_STATUS_OPTIONS.map((status) => {
          const tasks = project.tasks.filter((t) => t.status === status)
          return (
            <section key={status} className="space-y-2">
              <h2 className="text-base font-medium">{TASK_STATUS_LABEL[status]}</h2>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">沒有任務</p>
              ) : (
                <ul className="space-y-2">
                  {tasks.map((t) => (
                    <TaskRow key={t.id} task={t} project={project} canEdit={canEdit} />
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
