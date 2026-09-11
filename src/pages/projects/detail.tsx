import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import {
  canEditProject,
  deleteProject,
  getProject,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TINT,
  projectKeys,
  projectLabel,
  tint,
} from "@/lib/projects"
import GroupsTab from "./tabs/groups"
import KnowledgeTab from "./tabs/knowledge"
import MembersTab from "./tabs/members"
import OverviewTab from "./tabs/overview"
import TasksTab from "./tabs/tasks"

const TAB_VALUES = ["overview", "tasks", "members", "knowledge", "groups"] as const
type TabValue = (typeof TAB_VALUES)[number]

const TAB_LABEL: Record<TabValue, string> = {
  overview: "總覽",
  tasks: "任務",
  members: "成員",
  knowledge: "知識庫",
  groups: "群組",
}

function tabFromParams(params: URLSearchParams): TabValue {
  const raw = params.get("tab")
  return (TAB_VALUES as readonly string[]).includes(raw ?? "") ? (raw as TabValue) : "overview"
}

function InfoRow({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-right break-words">{value}</dd>
    </div>
  )
}

export default function ProjectDetailPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = tabFromParams(searchParams)

  const detailQuery = useQuery({ queryKey: projectKeys.detail(id), queryFn: () => getProject(id), retry: false })

  const deleteMutation = useMutation({
    mutationFn: () => deleteProject(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: projectKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
      navigate("/projects")
    },
  })

  function setTab(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value === "overview") next.delete("tab")
    else next.set("tab", value)
    setSearchParams(next, { replace: true })
  }

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (detailQuery.isError) {
    const err = detailQuery.error
    if (err instanceof ApiError && err.status === 404) {
      return (
        <div className="space-y-3">
          <p>找不到這個專案</p>
          <Link to="/projects" className="text-primary underline underline-offset-4">
            回專案清單
          </Link>
        </div>
      )
    }
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{err instanceof ApiError ? err.detail : "載入失敗，請稍後再試"}</AlertDescription>
      </Alert>
    )
  }

  const project = detailQuery.data!
  const canEdit = canEditProject(user, project)
  const progress = Math.min(100, Math.max(0, project.progress))

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link to="/projects" className="text-sm text-primary underline-offset-4 hover:underline">
          回專案清單
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button asChild variant="outline">
                <Link to={`/projects/${project.id}/edit`}>編輯</Link>
              </Button>
            )}
            {user?.is_admin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">刪除專案</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>確定刪除這個專案？</AlertDialogTitle>
                    <AlertDialogDescription>里程碑、任務與成員會一併刪除，綁定的群組會解除綁定。</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMutation.mutate()}>確定</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      {deleteMutation.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {deleteMutation.error instanceof ApiError ? deleteMutation.error.detail : "刪除失敗，請稍後再試"}
          </AlertDescription>
        </Alert>
      )}

      <section aria-label="專案資訊" className="rounded-lg border p-4">
        <dl>
          <InfoRow term="客戶" value={project.customer || "—"} />
          <InfoRow
            term="狀態"
            value={
              <Badge variant="tint" className={tint(PROJECT_STATUS_TINT, project.status)}>
                {projectLabel(PROJECT_STATUS_LABEL, project.status)}
              </Badge>
            }
          />
          <InfoRow term="負責人" value={project.owner_name || "—"} />
          <InfoRow term="起日" value={project.start_date || "—"} />
          <InfoRow term="迄日" value={project.end_date || "—"} />
          <InfoRow
            term="進度"
            value={
              <span className="flex items-center justify-end gap-2">
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                </span>
                <span className="tabular-nums">{progress}%</span>
              </span>
            }
          />
          <InfoRow term="成員數" value={<span aria-label="成員數" className="tabular-nums">{project.member_count}</span>} />
          <InfoRow
            term="逾期里程碑"
            value={
              <span
                aria-label="逾期里程碑數"
                className={project.overdue_milestones > 0 ? "font-medium text-destructive tabular-nums" : "tabular-nums"}
              >
                {project.overdue_milestones}
              </span>
            }
          />
        </dl>
      </section>

      <Tabs value={tab} onValueChange={setTab}>
        {/* 窄螢幕讓 TabsList 自己橫向捲動，不要把整頁撐寬。 */}
        <div className="overflow-x-auto">
          <TabsList>
            {TAB_VALUES.map((v) => (
              <TabsTrigger key={v} value={v}>
                {TAB_LABEL[v]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <OverviewTab project={project} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="tasks">
          <TasksTab project={project} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="members">
          <MembersTab project={project} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="knowledge">
          <KnowledgeTab project={project} />
        </TabsContent>
        <TabsContent value="groups">
          <GroupsTab project={project} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
