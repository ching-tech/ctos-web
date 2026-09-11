import { apiFetch } from "./api"

// 型別一律對齊後端 models/erp.py 的 Party* 模型，不自己猜欄位。
// PR 5（物料庫存）、PR 6（採購單）會擴充同一個檔。
//
// 兩個後端契約細節值得記著：
// 1. Decimal 欄位在 pydantic v2 的 JSON 模式序列化成字串（"128000.00"），不是數字。
// 2. POST /{id}/contacts、/{id}/addresses 回的是 {success, contact_id|address_id,
//    audit_id}，不是建好的那筆；PUT 那兩支才回整筆加 audit_id，DELETE 回
//    {success, audit_id}。子資源的寫入一律重抓明細，不拿回應塞快取。

/** 後端 models/erp.py 的 PartyRole Literal，是清單篩選吃的值。 */
export type PartyRole = "supplier" | "customer" | "both"

/** 掛在一筆往來對象身上的角色，只有兩個（`both` 是篩選條件不是身分）。 */
export type PartyBadgeRole = "supplier" | "customer"

export interface PartyContact {
  id: string
  party_id: string
  name: string
  title: string | null
  phone: string | null
  mobile: string | null
  email: string | null
  is_primary: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PartyAddress {
  id: string
  party_id: string
  label: string | null
  address: string
  city: string | null
  is_primary: boolean
  created_at: string
  updated_at: string
}

export interface PartyListItem {
  id: string
  name: string
  short_name: string | null
  is_supplier: boolean
  is_customer: boolean
  tax_id: string | null
  industry: string | null
  primary_contact: string | null
  primary_phone: string | null
  created_at: string
  updated_at: string
}

export interface PartyListResponse {
  items: PartyListItem[]
  total: number
}

export interface PartyPurchaseOrderItem {
  id: string
  po_no: string
  status: string
  order_date: string | null
  expected_date: string | null
  /** Decimal：後端送字串 */
  total_amount: string | null
}

export interface PartyProjectItem {
  id: string
  name: string
  status: string
}

export interface PartyDetail {
  id: string
  name: string
  short_name: string | null
  aliases: string[]
  is_supplier: boolean
  is_customer: boolean
  tax_id: string | null
  industry: string | null
  payment_terms: string | null
  notes: string | null
  source_ref: string | null
  /** 只有建立／更新／合併的回應才有值，GET 明細是 null */
  audit_id: string | null
  created_by: number | null
  created_at: string
  updated_at: string
  contacts: PartyContact[]
  addresses: PartyAddress[]
  purchase_orders: PartyPurchaseOrderItem[]
  projects: PartyProjectItem[]
  knowledge_count: number
}

export interface PartyContactUpdate {
  name?: string
  title?: string | null
  phone?: string | null
  mobile?: string | null
  email?: string | null
  is_primary?: boolean
  notes?: string | null
}

export interface PartyAddressUpdate {
  address?: string
  label?: string | null
  city?: string | null
  is_primary?: boolean
}

/** PUT 子端點回的是整筆加 `audit_id`（PartyContactUpdateResponse／PartyAddressUpdateResponse）。 */
export type PartyContactUpdated = PartyContact & { audit_id: string | null }
export type PartyAddressUpdated = PartyAddress & { audit_id: string | null }

export interface PartyContactCreate {
  name: string
  title?: string | null
  phone?: string | null
  mobile?: string | null
  email?: string | null
  is_primary?: boolean
  notes?: string | null
}

export interface PartyAddressCreate {
  address: string
  label?: string | null
  city?: string | null
  is_primary?: boolean
}

export interface PartyCreate {
  name: string
  short_name?: string | null
  aliases?: string[]
  is_supplier?: boolean
  is_customer?: boolean
  tax_id?: string | null
  industry?: string | null
  payment_terms?: string | null
  notes?: string | null
  source_ref?: string | null
  contacts?: PartyContactCreate[]
  addresses?: PartyAddressCreate[]
}

/** PartyUpdate 沒有 contacts／addresses，那兩個走各自的子端點。 */
export type PartyUpdate = Partial<Omit<PartyCreate, "contacts" | "addresses">>

export interface PartyMergeRequest {
  keep_id: string
  drop_id: string
}

/** 寫入型子端點的回應（api/erp.py 只回 id 與 audit_id，不回建好的那筆）。 */
export interface PartyChildCreated {
  success: boolean
  contact_id?: string
  address_id?: string
  audit_id: string
}

// ── 中文對照 ──

export const PARTY_ROLE_LABEL = {
  supplier: "供應商",
  customer: "客戶",
  both: "供應商且客戶",
} as const satisfies Record<PartyRole, string>

export const PARTY_ROLE_OPTIONS: PartyRole[] = ["supplier", "customer", "both"]

/** 採購單狀態，對 models/erp.py 的 PurchaseOrderStatus。 */
export type PurchaseOrderStatus = "draft" | "ordered" | "partial" | "received" | "cancelled"

export const PO_STATUS_LABEL = {
  draft: "草稿",
  ordered: "已下單",
  partial: "部分到貨",
  received: "已收貨",
  cancelled: "已取消",
} as const satisfies Record<PurchaseOrderStatus, string>

// tint badge 的低飽和底色，沒對到的值用 Badge variant="tint" 的灰。
export const PARTY_ROLE_TINT: Record<string, string> = {
  supplier: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  customer: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
}

export const PO_STATUS_TINT: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
  ordered: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  partial: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  received: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  cancelled: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
}

export function erpLabel(dict: Record<string, string>, key: string): string {
  return dict[key] ?? key
}

export function erpTint(dict: Record<string, string>, key: string): string {
  return dict[key] ?? ""
}

/** 一筆往來對象身上掛著的角色（可以同時兩個，也可以一個都沒有）。 */
export function partyRoles(p: Pick<PartyListItem, "is_supplier" | "is_customer">): PartyBadgeRole[] {
  const roles: PartyBadgeRole[] = []
  if (p.is_supplier) roles.push("supplier")
  if (p.is_customer) roles.push("customer")
  return roles
}

/** 別名輸入框：半形與全形逗號都算分隔，去頭尾空白、去空字串、去重複。 */
export function parseAliases(raw: string): string[] {
  const seen = new Set<string>()
  for (const part of raw.split(/[,，]/)) {
    const alias = part.trim()
    if (alias) seen.add(alias)
  }
  return [...seen]
}

/** 別名陣列回填輸入框。 */
export function formatAliases(aliases: string[]): string {
  return aliases.join(", ")
}

/** Decimal 字串轉千分位顯示；空值與非數字原樣退回破折號。 */
export function formatAmount(value: string | null): string {
  if (value === null || value === "") return "—"
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  // 金額一律兩位小數，免得同一欄有的對齊有的不對齊
  return n.toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 「問 AI」帶過去的前綴文字。 */
export function askAiHref(name: string): string {
  return `/assistant?q=${encodeURIComponent(`關於往來對象「${name}」：`)}`
}

/** 知識庫入口：往來對象沒有 scope，用名稱當關鍵字搜尋。 */
export function partyKbHref(name: string): string {
  return `/kb?q=${encodeURIComponent(name)}`
}

// ── API ──

export interface PartyFilters {
  role?: PartyRole | ""
  q?: string
  page: number
  pageSize?: number
}

export const PARTY_PAGE_SIZE = 20

export function listParties(filters: PartyFilters): Promise<PartyListResponse> {
  const params = new URLSearchParams()
  if (filters.role) params.set("role", filters.role)
  if (filters.q) params.set("q", filters.q)
  params.set("page", String(filters.page))
  params.set("page_size", String(filters.pageSize ?? PARTY_PAGE_SIZE))
  return apiFetch<PartyListResponse>(`/api/parties?${params.toString()}`)
}

export function getParty(id: string): Promise<PartyDetail> {
  return apiFetch<PartyDetail>(`/api/parties/${id}`)
}

export function createParty(data: PartyCreate): Promise<PartyDetail> {
  return apiFetch<PartyDetail>("/api/parties", { method: "POST", body: JSON.stringify(data) })
}

export function updateParty(id: string, data: PartyUpdate): Promise<PartyDetail> {
  return apiFetch<PartyDetail>(`/api/parties/${id}`, { method: "PUT", body: JSON.stringify(data) })
}

export async function deleteParty(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/parties/${id}`, { method: "DELETE" })
}

export function mergeParties(body: PartyMergeRequest): Promise<PartyDetail> {
  return apiFetch<PartyDetail>("/api/parties/merge", { method: "POST", body: JSON.stringify(body) })
}

export function addPartyContact(partyId: string, data: PartyContactCreate): Promise<PartyChildCreated> {
  return apiFetch<PartyChildCreated>(`/api/parties/${partyId}/contacts`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function updatePartyContact(
  partyId: string,
  contactId: string,
  data: PartyContactUpdate,
): Promise<PartyContactUpdated> {
  return apiFetch<PartyContactUpdated>(`/api/parties/${partyId}/contacts/${contactId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function deletePartyContact(partyId: string, contactId: string): Promise<void> {
  await apiFetch<unknown>(`/api/parties/${partyId}/contacts/${contactId}`, { method: "DELETE" })
}

export function addPartyAddress(partyId: string, data: PartyAddressCreate): Promise<PartyChildCreated> {
  return apiFetch<PartyChildCreated>(`/api/parties/${partyId}/addresses`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function updatePartyAddress(
  partyId: string,
  addressId: string,
  data: PartyAddressUpdate,
): Promise<PartyAddressUpdated> {
  return apiFetch<PartyAddressUpdated>(`/api/parties/${partyId}/addresses/${addressId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function deletePartyAddress(partyId: string, addressId: string): Promise<void> {
  await apiFetch<unknown>(`/api/parties/${partyId}/addresses/${addressId}`, { method: "DELETE" })
}

export const erpKeys = {
  all: ["erp"] as const,
  parties: ["erp", "parties"] as const,
  partyList: (f: PartyFilters) => ["erp", "parties", "list", f] as const,
  partyDetail: (id: string) => ["erp", "parties", "detail", id] as const,
}
