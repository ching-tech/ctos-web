import { useMutation, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import { ApiError } from "@/lib/api"
import {
  createMilestone,
  MILESTONE_STATUS_LABEL,
  MILESTONE_STATUS_TINT,
  projectKeys,
  projectLabel,
  tint,
  todayIso,
  updateMilestone,
  type ProjectDetail,
} from "@/lib/projects"

function AddMilestoneDialog({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [dueDate, setDueDate] = React.useState("")

  const mutation = useMutation({
    mutationFn: () => createMilestone(projectId, { name: name.trim(), due_date: dueDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
      setOpen(false)
      setName("")
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
          新增里程碑
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增里程碑</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim() || !dueDate) return
            mutation.mutate()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="milestone-name">里程碑名稱</Label>
            <Input id="milestone-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="milestone-due">到期日</Label>
            <Input id="milestone-due" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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

export default function OverviewTab({ project, canEdit }: { project: ProjectDetail; canEdit: boolean }) {
  const queryClient = useQueryClient()

  const completeMutation = useMutation({
    mutationFn: (milestoneId: string) =>
      updateMilestone(project.id, milestoneId, { status: "completed", completed_at: todayIso() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.detail(project.id) }),
  })

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-medium">里程碑</h2>
        {canEdit && <AddMilestoneDialog projectId={project.id} />}
      </div>

      {completeMutation.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {completeMutation.error instanceof ApiError ? completeMutation.error.detail : "更新失敗，請稍後再試"}
          </AlertDescription>
        </Alert>
      )}

      {project.milestones.length === 0 ? (
        <p className="text-muted-foreground">還沒有里程碑</p>
      ) : (
        <ul className="space-y-2">
          {project.milestones.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-medium">{m.name}</span>
                <span className="text-muted-foreground">{m.due_date}</span>
                <Badge variant="tint" className={tint(MILESTONE_STATUS_TINT, m.status)}>
                  {projectLabel(MILESTONE_STATUS_LABEL, m.status)}
                </Badge>
                {m.is_overdue && <span className="font-medium text-destructive">逾期</span>}
              </div>
              {canEdit && m.status !== "completed" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={completeMutation.isPending}
                  onClick={() => completeMutation.mutate(m.id)}
                >
                  完成
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <h2 className="text-base font-medium">描述</h2>
        {project.description ? (
          <p className="text-sm whitespace-pre-wrap">{project.description}</p>
        ) : (
          <p className="text-muted-foreground">還沒有描述</p>
        )}
      </div>
    </div>
  )
}
