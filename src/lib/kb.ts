import { API_BASE, apiFetch } from "./api"
import { getToken } from "./token"

export type Scope = "global" | "personal" | "project"

export interface KnowledgeTags {
  projects: string[]
  roles: string[]
  topics: string[]
  level: string | null
}

export interface KnowledgeAttachment {
  type: string
  path: string
  size: string | null
  description: string | null
}

export interface KnowledgeListItem {
  id: string
  title: string
  type: string
  category: string
  scope: Scope
  owner: string | null
  project_id: string | null
  is_public: boolean
  tags: KnowledgeTags
  author: string
  updated_at: string
  snippet: string | null
}

export interface KnowledgeListResponse {
  items: KnowledgeListItem[]
  total: number
  query: string | null
}

export interface Knowledge extends Omit<KnowledgeListItem, "snippet"> {
  source: { project: string | null; path: string | null; commit: string | null }
  related: string[]
  attachments: KnowledgeAttachment[]
  created_at: string
  content: string
}

export interface TagsResponse {
  projects: string[]
  types: string[]
  categories: string[]
  roles: string[]
  levels: string[]
  topics: string[]
}

export interface KnowledgeCreate {
  title: string
  content: string
  type: string
  category: string
  scope: Scope
  author: string
  tags?: Partial<KnowledgeTags>
  is_public?: boolean
}

export type KnowledgeUpdate = Partial<Pick<KnowledgeCreate, "title" | "content" | "type" | "category" | "scope" | "is_public">> & {
  tags?: Partial<KnowledgeTags>
}

export interface HistoryEntry {
  commit: string
  author: string
  date: string
  message: string
}

export interface ShareLink {
  token: string
  url: string
  full_url: string
  resource_type: string
  resource_id: string
  resource_title: string
}

export interface ListFilters {
  q?: string
  scope?: Scope | ""
  type?: string
  category?: string
  project?: string
}

export const SCOPE_LABEL = { global: "全域", personal: "個人", project: "專案" } as const satisfies Record<Scope, string>
export const TYPE_LABEL: Record<string, string> = { context: "脈絡", knowledge: "知識", operations: "作業", reference: "參考" }
export const CATEGORY_LABEL: Record<string, string> = { technical: "技術", business: "業務", management: "管理" }
export function label(dict: Record<string, string>, key: string): string {
  return dict[key] ?? key
}

export function listKnowledge(filters: ListFilters): Promise<KnowledgeListResponse> {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v)
  const qs = params.toString()
  return apiFetch<KnowledgeListResponse>(`/api/knowledge${qs ? `?${qs}` : ""}`)
}

export function getKnowledge(id: string): Promise<Knowledge> {
  return apiFetch<Knowledge>(`/api/knowledge/${id}`)
}

export function getTags(): Promise<TagsResponse> {
  return apiFetch<TagsResponse>("/api/knowledge/tags")
}

export function createKnowledge(data: KnowledgeCreate): Promise<Knowledge> {
  return apiFetch<Knowledge>("/api/knowledge", { method: "POST", body: JSON.stringify(data) })
}

export function updateKnowledge(id: string, data: KnowledgeUpdate): Promise<Knowledge> {
  return apiFetch<Knowledge>(`/api/knowledge/${id}`, { method: "PUT", body: JSON.stringify(data) })
}

export async function deleteKnowledge(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/knowledge/${id}`, { method: "DELETE" })
}

export function getHistory(id: string): Promise<{ id: string; entries: HistoryEntry[] }> {
  return apiFetch<{ id: string; entries: HistoryEntry[] }>(`/api/knowledge/${id}/history`)
}

export function getVersion(id: string, commit: string): Promise<{ id: string; commit: string; content: string }> {
  return apiFetch<{ id: string; commit: string; content: string }>(`/api/knowledge/${id}/version/${commit}`)
}

export function uploadAttachment(id: string, file: File): Promise<unknown> {
  const fd = new FormData()
  fd.append("file", file)
  return apiFetch<unknown>(`/api/knowledge/${id}/attachments`, { method: "POST", body: fd })
}

export async function deleteAttachment(id: string, idx: number): Promise<void> {
  await apiFetch<unknown>(`/api/knowledge/${id}/attachments/${idx}`, { method: "DELETE" })
}

export function createShareLink(id: string, opts: { expires_in: "1h" | "24h" | "7d" | null; password?: string }): Promise<ShareLink> {
  return apiFetch<ShareLink>("/api/share", {
    method: "POST",
    body: JSON.stringify({ resource_type: "knowledge", resource_id: id, expires_in: opts.expires_in, password: opts.password || undefined }),
  })
}

function withToken(url: string): string {
  const t = getToken()
  return t ? `${url}?token=${encodeURIComponent(t)}` : url
}

export function attachmentUrl(path: string): string {
  if (path.startsWith("nas://knowledge/")) return withToken(`${API_BASE}/api/knowledge/${path.slice("nas://knowledge/".length)}`)
  const file = path.split("/").pop() ?? path
  return withToken(`${API_BASE}/api/knowledge/assets/images/${file}`)
}

export function rewriteImageSrc(src: string): string {
  if (/^(https?:)?\/\//.test(src) || src.startsWith("data:")) return src
  return attachmentUrl(src)
}

export const kbKeys = {
  all: ["kb"] as const,
  list: (f: ListFilters) => ["kb", "list", f] as const,
  detail: (id: string) => ["kb", "detail", id] as const,
  tags: ["kb", "tags"] as const,
  history: (id: string) => ["kb", "history", id] as const,
}
