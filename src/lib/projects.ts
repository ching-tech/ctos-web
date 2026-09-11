import { apiFetch } from "./api"
import type { UserInfo } from "./types"

// 型別一律對齊後端 models/project.py（feat/projects-backend），不自己猜欄位。
export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled"
export type MilestoneStatus = "pending" | "in_progress" | "completed"
export type TaskStatus = "todo" | "doing" | "done"
export type MemberRole = "owner" | "member"

export interface ProjectListItem {
  id: string
  name: string
  customer: string | null
  status: string
  owner_id: number | null
  owner_name: string | null
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
  /** 進度百分比 = done 任務數 ÷ 任務總數，沒有任務時為 0 */
  progress: number
  member_count: number
  /** 逾期里程碑數；後端只在專案 status = active 時才算，其他狀態一律 0 */
  overdue_milestones: number
}

export interface ProjectListResponse {
  items: ProjectListItem[]
  total: number
}

export interface ProjectMember {
  user_id: number
  username: string | null
  display_name: string | null
  role: string
}

export interface Milestone {
  id: string
  project_id: string
  name: string
  due_date: string
  completed_at: string | null
  status: string
  sort_order: number
  is_overdue: boolean
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  project_id: string
  title: string
  description: string | null
  milestone_id: string | null
  assignee_id: number | null
  assignee_name: string | null
  status: string
  due_date: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ProjectBotGroup {
  id: string
  platform_type: string
  group_name: string | null
}

export interface ProjectDetail {
  id: string
  name: string
  customer: string | null
  status: string
  owner_id: number | null
  owner_name: string | null
  start_date: string | null
  end_date: string | null
  description: string | null
  created_by: number | null
  created_at: string
  updated_at: string
  progress: number
  member_count: number
  /** 逾期里程碑「數」。ProjectSummary 的同名欄位是「清單」，兩者是不同型別，不要共用別名。 */
  overdue_milestones: number
  members: ProjectMember[]
  milestones: Milestone[]
  tasks: Task[]
  bot_groups: ProjectBotGroup[]
  knowledge_count: number
}

/** dashboard 摘要，PR 3 的首頁用，這裡先把型別放好。 */
export interface OverdueMilestoneItem {
  project_id: string
  project_name: string
  milestone_id: string
  name: string
  due_date: string
  days_overdue: number
}

export interface ProjectSummary {
  active_count: number
  /** 逾期里程碑「清單」。ProjectDetail／ProjectListItem 的同名欄位是「數」。 */
  overdue_milestones: OverdueMilestoneItem[]
}

export interface ProjectCreate {
  name: string
  customer?: string | null
  status?: ProjectStatus
  owner_id?: number | null
  start_date?: string | null
  end_date?: string | null
  description?: string | null
}

export type ProjectUpdate = Partial<ProjectCreate>

export interface MilestoneCreate {
  name: string
  due_date: string
  completed_at?: string | null
  status?: MilestoneStatus
  sort_order?: number
}

export type MilestoneUpdate = Partial<MilestoneCreate>

export interface TaskCreate {
  title: string
  description?: string | null
  milestone_id?: string | null
  assignee_id?: number | null
  status?: TaskStatus
  due_date?: string | null
  sort_order?: number
}

export type TaskUpdate = Partial<TaskCreate>

// ── 中文對照 ──

export const PROJECT_STATUS_LABEL = {
  planning: "規劃中",
  active: "進行中",
  on_hold: "暫停",
  completed: "已完成",
  cancelled: "已取消",
} as const satisfies Record<ProjectStatus, string>

export const MILESTONE_STATUS_LABEL = {
  pending: "未開始",
  in_progress: "進行中",
  completed: "已完成",
} as const satisfies Record<MilestoneStatus, string>

export const TASK_STATUS_LABEL = {
  todo: "待辦",
  doing: "進行中",
  done: "已完成",
} as const satisfies Record<TaskStatus, string>

export const MEMBER_ROLE_LABEL = {
  owner: "負責人",
  member: "成員",
} as const satisfies Record<MemberRole, string>

export const PROJECT_STATUS_OPTIONS: ProjectStatus[] = ["planning", "active", "on_hold", "completed", "cancelled"]
export const MILESTONE_STATUS_OPTIONS: MilestoneStatus[] = ["pending", "in_progress", "completed"]
export const TASK_STATUS_OPTIONS: TaskStatus[] = ["todo", "doing", "done"]

// tint badge 的低飽和底色，沒對到的狀態用預設（Badge variant="tint" 的灰）。
export const PROJECT_STATUS_TINT: Record<string, string> = {
  planning: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  on_hold: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  completed: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  cancelled: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
}

export const MILESTONE_STATUS_TINT: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
}

export const TASK_STATUS_TINT: Record<string, string> = {
  todo: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
  doing: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
}

export function projectLabel(dict: Record<string, string>, key: string): string {
  return dict[key] ?? key
}

export function tint(dict: Record<string, string>, key: string): string {
  return dict[key] ?? ""
}

/** 成員顯示名：優先 display_name，沒有才退回 username。 */
export function memberName(m: { username: string | null; display_name: string | null }): string {
  return m.display_name || m.username || "—"
}

/** 有權限編輯＝管理員或該專案成員（與後端 require_project_editor 同一條規則）。 */
export function canEditProject(user: UserInfo | null, detail: Pick<ProjectDetail, "members">): boolean {
  if (user?.is_admin) return true
  return detail.members.some((m) => m.user_id === user?.id)
}

/** 今天的 YYYY-MM-DD（送 date 欄位用，避免 toISOString 的 UTC 位移）。 */
export function todayIso(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// ── API ──

export interface ProjectFilters {
  status?: ProjectStatus | ""
  q?: string
  page: number
  pageSize?: number
}

export const PROJECT_PAGE_SIZE = 20

export function listProjects(filters: ProjectFilters): Promise<ProjectListResponse> {
  const params = new URLSearchParams()
  if (filters.status) params.set("status", filters.status)
  if (filters.q) params.set("q", filters.q)
  params.set("page", String(filters.page))
  params.set("page_size", String(filters.pageSize ?? PROJECT_PAGE_SIZE))
  return apiFetch<ProjectListResponse>(`/api/projects?${params.toString()}`)
}

export function getProject(id: string): Promise<ProjectDetail> {
  return apiFetch<ProjectDetail>(`/api/projects/${id}`)
}

export function getProjectSummary(): Promise<ProjectSummary> {
  return apiFetch<ProjectSummary>("/api/projects/summary")
}

export function createProject(data: ProjectCreate): Promise<ProjectDetail> {
  return apiFetch<ProjectDetail>("/api/projects", { method: "POST", body: JSON.stringify(data) })
}

export function updateProject(id: string, data: ProjectUpdate): Promise<ProjectDetail> {
  return apiFetch<ProjectDetail>(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(data) })
}

export async function deleteProject(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/projects/${id}`, { method: "DELETE" })
}

export function addMember(projectId: string, userId: number): Promise<ProjectMember> {
  return apiFetch<ProjectMember>(`/api/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  })
}

export async function removeMember(projectId: string, userId: number): Promise<void> {
  await apiFetch<unknown>(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" })
}

export function createMilestone(projectId: string, data: MilestoneCreate): Promise<Milestone> {
  return apiFetch<Milestone>(`/api/projects/${projectId}/milestones`, { method: "POST", body: JSON.stringify(data) })
}

export function updateMilestone(projectId: string, milestoneId: string, data: MilestoneUpdate): Promise<Milestone> {
  return apiFetch<Milestone>(`/api/projects/${projectId}/milestones/${milestoneId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function deleteMilestone(projectId: string, milestoneId: string): Promise<void> {
  await apiFetch<unknown>(`/api/projects/${projectId}/milestones/${milestoneId}`, { method: "DELETE" })
}

export function createTask(projectId: string, data: TaskCreate): Promise<Task> {
  return apiFetch<Task>(`/api/projects/${projectId}/tasks`, { method: "POST", body: JSON.stringify(data) })
}

export function updateTask(projectId: string, taskId: string, data: TaskUpdate): Promise<Task> {
  return apiFetch<Task>(`/api/projects/${projectId}/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(data) })
}

export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  await apiFetch<unknown>(`/api/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" })
}

export const projectKeys = {
  all: ["projects"] as const,
  list: (f: ProjectFilters) => ["projects", "list", f] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
  summary: ["projects", "summary"] as const,
}
