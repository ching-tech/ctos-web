import { apiFetch } from "./api"

// 型別一律對齊後端 models/erp.py 的 Party* 模型，不自己猜欄位。
// PR 5（物料庫存）、PR 6（採購單）擴充了同一個檔。
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
  items: ["erp", "items"] as const,
  itemList: (f: ItemFilters) => ["erp", "items", "list", f] as const,
  itemDetail: (id: string) => ["erp", "items", "detail", id] as const,
  warehouses: ["erp", "warehouses"] as const,
  warehouseList: ["erp", "warehouses", "list"] as const,
  stock: ["erp", "stock"] as const,
  purchaseOrders: ["erp", "purchase-orders"] as const,
  poList: (f: PurchaseOrderFilters) => ["erp", "purchase-orders", "list", f] as const,
  poDetail: (id: string) => ["erp", "purchase-orders", "detail", id] as const,
  /** 首頁待收貨卡：ordered 與 partial 各一次請求（後端 status 是等值比對，不吃多值）。 */
  poPending: (status: string) => ["erp", "purchase-orders", "pending", status] as const,
}

// ============================================================
// 物料、倉庫、庫存
//
// 型別對 models/erp.py 的 Item*／Warehouse*／Stock*。migration 030 把 qty 與
// qty_delta 開成 Numeric(18,4)、purchase_price 開成 Numeric(14,4)，pydantic v2
// 的 JSON 模式把 Decimal 序列化成字串（"12.0000"），所以數量一律當字串接，
// 顯示前用 formatQty 收尾數，不要當 number 存。
// ============================================================

/** models/erp.py 的 StockReason Literal。 */
export type StockReason = "receipt" | "issue" | "adjust" | "transfer_in" | "transfer_out" | "import"

export interface ItemListItem {
  id: string
  code: string
  name: string
  spec: string | null
  unit: string | null
  item_group: string | null
  default_supplier_id: string | null
  default_supplier_name: string | null
  /** Decimal：後端送字串 */
  purchase_price: string | null
  /** Decimal：各倉合計，後端送字串 */
  total_qty: string
  created_at: string
  updated_at: string
}

export interface ItemListResponse {
  items: ItemListItem[]
  total: number
}

export interface StockBalance {
  warehouse_id: string
  warehouse_code: string | null
  warehouse_name: string | null
  /** Decimal：後端送字串 */
  qty: string
}

export interface StockMovement {
  id: string
  item_id: string
  warehouse_id: string
  warehouse_name: string | null
  /** Decimal：可正可負，後端送字串 */
  qty_delta: string
  reason: string
  ref_type: string | null
  ref_id: string | null
  note: string | null
  actor_user_id: number | null
  created_at: string
}

export interface ItemDetail {
  id: string
  code: string
  name: string
  spec: string | null
  unit: string | null
  item_group: string | null
  default_supplier_id: string | null
  default_supplier_name: string | null
  purchase_price: string | null
  lead_days: number | null
  aliases: string[]
  notes: string | null
  source_ref: string | null
  /** 只有建立／更新的回應才有值，GET 明細是 null */
  audit_id: string | null
  created_by: number | null
  created_at: string
  updated_at: string
  balances: StockBalance[]
  total_qty: string
  /** 後端只回最近 20 筆（erp_inventory.get_item_detail 的 movement_limit） */
  movements: StockMovement[]
}

export interface ItemCreate {
  code: string
  name: string
  spec?: string | null
  unit?: string | null
  item_group?: string | null
  default_supplier_id?: string | null
  /** Decimal：送字串，後端用 pydantic 轉 Decimal */
  purchase_price?: string | null
  lead_days?: number | null
  aliases?: string[]
  notes?: string | null
  source_ref?: string | null
}

export type ItemUpdate = Partial<ItemCreate>

export interface Warehouse {
  id: string
  code: string
  name: string
  /** 只有建立／更新的回應才有值 */
  audit_id: string | null
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface WarehouseListResponse {
  items: Warehouse[]
  total: number
}

export interface WarehouseCreate {
  code: string
  name: string
}

export type WarehouseUpdate = Partial<WarehouseCreate>

export interface StockRow {
  item_id: string
  item_code: string
  item_name: string
  warehouse_id: string
  warehouse_code: string | null
  warehouse_name: string | null
  qty: string
}

export interface StockListResponse {
  items: StockRow[]
  total: number
}

export interface StockAdjustRequest {
  item_id: string
  warehouse_id: string
  /** Decimal：可正可負，0 會被後端擋在 400 */
  qty_delta: string
  reason?: StockReason
  note?: string | null
}

export interface StockTransferRequest {
  item_id: string
  from_warehouse_id: string
  to_warehouse_id: string
  /** Decimal：必須大於 0 */
  qty: string
  note?: string | null
}

/** api/erp.py 的 adjust_stock 只回這三個鍵，不是 StockMutationResponse。 */
export interface StockAdjustResult {
  success: boolean
  audit_id: string
  qty_after: string
}

/** api/erp.py 的 transfer_stock 只回兩倉的新餘額。 */
export interface StockTransferResult {
  success: boolean
  audit_id: string
  balances: { warehouse_id: string; qty: string }[]
}

// ── 中文對照 ──

export const STOCK_REASON_LABEL = {
  receipt: "採購收貨",
  issue: "領用出庫",
  adjust: "調整",
  transfer_in: "調撥入庫",
  transfer_out: "調撥出庫",
  import: "匯入",
} as const satisfies Record<StockReason, string>

export const STOCK_REASON_TINT: Record<string, string> = {
  receipt: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  issue: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  adjust: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  transfer_in: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  transfer_out: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  import: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
}

/**
 * 數量顯示：後端的 Numeric(18,4) 會帶四位小數（"12.0000"），畫面上要收掉尾數，
 * 但小數真的有值時不能砍掉（"1.5000" → "1.5"）。空值與非數字原樣退回破折號。
 */
export function formatQty(value: string | null): string {
  if (value === null || value === "") return "—"
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 4 })
}

/** 異動欄位：正數要看得出是加，負數本來就有負號。 */
export function formatQtyDelta(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  return (n > 0 ? "+" : "") + formatQty(value)
}

/** 交期天數：沒填顯示破折號，有填補上單位。 */
export function formatLeadDays(days: number | null): string {
  return days === null ? "—" : `${days} 天`
}

/** 「問 AI」帶過去的前綴文字（料號與品名一起帶，AI 兩個都認得）。 */
export function itemAskAiHref(code: string, name: string): string {
  return `/assistant?q=${encodeURIComponent(`關於物料「${code} ${name}」：`)}`
}

/** 分類篩選的選項：後端沒有分類端點，從當頁清單資料收集，去重排序。 */
export function itemGroupOptions(items: Pick<ItemListItem, "item_group">[]): string[] {
  const groups = new Set<string>()
  for (const it of items) {
    if (it.item_group) groups.add(it.item_group)
  }
  return [...groups].sort((a, b) => a.localeCompare(b, "zh-TW"))
}

// ── API ──

export interface ItemFilters {
  q?: string
  itemGroup?: string
  page: number
  pageSize?: number
}

export const ITEM_PAGE_SIZE = 20
export const WAREHOUSE_PAGE_SIZE = 50
/** 供應商下拉吃 /api/parties 的上限（後端 page_size 最大 100）。 */
export const SUPPLIER_PAGE_SIZE = 100

export function listItems(filters: ItemFilters): Promise<ItemListResponse> {
  const params = new URLSearchParams()
  if (filters.q) params.set("q", filters.q)
  if (filters.itemGroup) params.set("item_group", filters.itemGroup)
  params.set("page", String(filters.page))
  params.set("page_size", String(filters.pageSize ?? ITEM_PAGE_SIZE))
  return apiFetch<ItemListResponse>(`/api/items?${params.toString()}`)
}

export function getItem(id: string): Promise<ItemDetail> {
  return apiFetch<ItemDetail>(`/api/items/${id}`)
}

export function createItem(data: ItemCreate): Promise<ItemDetail> {
  return apiFetch<ItemDetail>("/api/items", { method: "POST", body: JSON.stringify(data) })
}

export function updateItem(id: string, data: ItemUpdate): Promise<ItemDetail> {
  return apiFetch<ItemDetail>(`/api/items/${id}`, { method: "PUT", body: JSON.stringify(data) })
}

export async function deleteItem(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/items/${id}`, { method: "DELETE" })
}

export function listWarehouses(page = 1, pageSize = WAREHOUSE_PAGE_SIZE): Promise<WarehouseListResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  return apiFetch<WarehouseListResponse>(`/api/warehouses?${params.toString()}`)
}

export function createWarehouse(data: WarehouseCreate): Promise<Warehouse> {
  return apiFetch<Warehouse>("/api/warehouses", { method: "POST", body: JSON.stringify(data) })
}

export function updateWarehouse(id: string, data: WarehouseUpdate): Promise<Warehouse> {
  return apiFetch<Warehouse>(`/api/warehouses/${id}`, { method: "PUT", body: JSON.stringify(data) })
}

export async function deleteWarehouse(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/warehouses/${id}`, { method: "DELETE" })
}

export function getStock(params: { itemId?: string; warehouseId?: string; page?: number; pageSize?: number } = {}): Promise<StockListResponse> {
  const search = new URLSearchParams()
  if (params.itemId) search.set("item_id", params.itemId)
  if (params.warehouseId) search.set("warehouse_id", params.warehouseId)
  search.set("page", String(params.page ?? 1))
  search.set("page_size", String(params.pageSize ?? WAREHOUSE_PAGE_SIZE))
  return apiFetch<StockListResponse>(`/api/stock?${search.toString()}`)
}

export function adjustStock(body: StockAdjustRequest): Promise<StockAdjustResult> {
  return apiFetch<StockAdjustResult>("/api/stock/adjust", { method: "POST", body: JSON.stringify(body) })
}

export function transferStock(body: StockTransferRequest): Promise<StockTransferResult> {
  return apiFetch<StockTransferResult>("/api/stock/transfer", { method: "POST", body: JSON.stringify(body) })
}

// ============================================================
// 採購單
//
// 型別對 models/erp.py 的 PurchaseOrder*／PurchaseOrderLine*／ReceiveLine。
// migration 030 把 qty 與 received_qty 開成 Numeric(18,4)、unit_price 開成
// Numeric(14,4)，pydantic v2 的 JSON 模式一律序列化成字串，所以數量與金額都當
// 字串接、送出時也送字串，不先過 Number() 免得長小數失真。
//
// 兩個後端契約細節值得記著：
// 1. 收貨行項的 key 是 `line_id`，不是 `item_id`：同一張單可以有兩行同一個物料，
//    只給 `item_id` 而該物料有多行時，service 會拋 AmbiguousError（HTTP 409）。
// 2. 收貨請求「全收」的欄位名是 `all`，不是 `receive_all`（`receive_all` 是
//    service 函式的參數名，REST 的 PurchaseOrderReceiveRequest 上叫 `all`）。
// ============================================================

/** models/erp.py 的 EditablePurchaseOrderStatus：PUT 的 status 只收這兩個。 */
export type EditablePurchaseOrderStatus = "draft" | "ordered"

export interface PurchaseOrderLine {
  id: string
  po_id: string
  item_id: string
  item_code: string | null
  item_name: string | null
  description: string | null
  /** Decimal：後端送字串 */
  qty: string
  unit_price: string | null
  received_qty: string
  sort_order: number
}

export interface PurchaseOrderListItem {
  id: string
  po_no: string
  supplier_id: string
  supplier_name: string | null
  project_id: string | null
  project_name: string | null
  status: string
  order_date: string | null
  expected_date: string | null
  line_count: number
  /** Decimal：SUM(qty * COALESCE(unit_price, 0))，後端送字串 */
  total_amount: string | null
  created_at: string
  updated_at: string
}

export interface PurchaseOrderListResponse {
  items: PurchaseOrderListItem[]
  total: number
}

export interface PurchaseOrderDetail {
  id: string
  /** 只有建立／更新的回應才有值，GET 明細是 null */
  audit_id: string | null
  po_no: string
  supplier_id: string
  supplier_name: string | null
  project_id: string | null
  project_name: string | null
  status: string
  order_date: string | null
  expected_date: string | null
  notes: string | null
  created_by: number | null
  created_at: string
  updated_at: string
  lines: PurchaseOrderLine[]
  total_amount: string | null
}

export interface PurchaseOrderLineCreate {
  item_id: string
  /** Decimal：送字串 */
  qty: string
  unit_price?: string | null
  description?: string | null
}

/**
 * PurchaseOrderCreate 是 `extra="forbid"`：`po_no` 由 service 在同一交易內產生，
 * 行項的 `received_qty` 只給匯入腳本用，REST 送這兩個會 422。
 */
export interface PurchaseOrderCreate {
  supplier_id: string
  lines: PurchaseOrderLineCreate[]
  project_id?: string | null
  status?: EditablePurchaseOrderStatus
  order_date?: string | null
  expected_date?: string | null
  notes?: string | null
}

/** 行項不在這裡改；`partial`／`received` 是收貨算出來的，`cancelled` 只能走 cancel。 */
export interface PurchaseOrderUpdate {
  supplier_id?: string
  project_id?: string | null
  status?: EditablePurchaseOrderStatus
  order_date?: string | null
  expected_date?: string | null
  notes?: string | null
}

export interface ReceiveLine {
  line_id: string
  /** Decimal：送字串 */
  qty: string
}

export interface PurchaseOrderReceiveRequest {
  lines?: ReceiveLine[]
  /** 後端欄位就叫 `all`（service 的參數才叫 receive_all）；true 時 lines 會被忽略。 */
  all?: boolean
  warehouse_id?: string | null
  note?: string | null
}

/** receive 與 cancel 都不回明細，只回這三個鍵。 */
export interface PurchaseOrderActionResult {
  success: boolean
  status: string
  audit_id: string
}

// ── 中文對照與規則 ──

export const PO_STATUS_OPTIONS: PurchaseOrderStatus[] = [
  "draft",
  "ordered",
  "partial",
  "received",
  "cancelled",
]

/** PUT 的 status 只收草稿與已下單。 */
export const PO_EDITABLE_STATUS_OPTIONS: EditablePurchaseOrderStatus[] = ["draft", "ordered"]

/** services/erp_purchasing.py 的 _CLOSED_STATUSES：這兩個狀態不給改也不給收貨。 */
const PO_CLOSED_STATUSES = ["received", "cancelled"]

/**
 * 還沒結案的單。編輯、收貨與取消三個動作共用同一條界線：後端對前兩個看
 * `_CLOSED_STATUSES`，取消另外還會擋「已收過貨」（`partial` 按下去會拿到 400，
 * 那個 400 照樣顯示出來，不在前端先猜）。
 */
export function isPurchaseOrderOpen(status: string): boolean {
  return !PO_CLOSED_STATUSES.includes(status)
}

/** 某一行還沒收的數量；四位小數是 Numeric(18,4) 的上限，收掉浮點誤差。 */
export function lineRemainingQty(line: Pick<PurchaseOrderLine, "qty" | "received_qty">): string {
  const remain = Number(line.qty) - Number(line.received_qty)
  if (!Number.isFinite(remain)) return "0"
  return String(Number(Math.max(remain, 0).toFixed(4)))
}

/** 「問 AI」帶過去的前綴文字。 */
export function poAskAiHref(poNo: string): string {
  return `/assistant?q=${encodeURIComponent(`關於採購單「${poNo}」：`)}`
}

/**
 * timestamptz 欄位（`created_at`／`updated_at`）一律讓 Date 轉成瀏覽器所在時區
 * 再印。直接切 ISO 字串會把 UTC 當成本地時間顯示，台北會差八小時。
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("zh-TW", { hour12: false })
}

/** 本地的今天（YYYY-MM-DD）；拿來跟後端的 date 欄位比大小。 */
export function todayIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** 預計到貨已經過了今天就算逾期；沒填日期不算。 */
export function isExpectedOverdue(expectedDate: string | null, today: string = todayIsoDate()): boolean {
  return expectedDate !== null && expectedDate !== "" && expectedDate < today
}

/**
 * 首頁「採購待收貨」卡要的清單：把 `ordered` 與 `partial` 兩次請求的結果合起來，
 * 依預計到貨升冪排序（沒填日期的排最後），取前 `limit` 張。
 */
export function pendingReceiptOrders(
  groups: (PurchaseOrderListItem[] | undefined)[],
  limit = 5,
): PurchaseOrderListItem[] {
  const merged = groups.flatMap((g) => g ?? [])
  return [...merged]
    .sort((a, b) => {
      if (a.expected_date === b.expected_date) return a.po_no.localeCompare(b.po_no)
      if (!a.expected_date) return 1
      if (!b.expected_date) return -1
      return a.expected_date.localeCompare(b.expected_date)
    })
    .slice(0, limit)
}

// ── API ──

export interface PurchaseOrderFilters {
  supplierId?: string
  status?: PurchaseOrderStatus | ""
  projectId?: string
  /** 訂購日起始（YYYY-MM-DD）；後端比的是 COALESCE(order_date, created_at::date) */
  since?: string
  page: number
  pageSize?: number
}

export const PO_PAGE_SIZE = 20
/** 首頁待收貨卡與下拉選單吃的上限（後端 page_size 最大 100）。 */
export const PO_PENDING_PAGE_SIZE = 100

export function listPurchaseOrders(filters: PurchaseOrderFilters): Promise<PurchaseOrderListResponse> {
  const params = new URLSearchParams()
  if (filters.supplierId) params.set("supplier_id", filters.supplierId)
  if (filters.status) params.set("status", filters.status)
  if (filters.projectId) params.set("project_id", filters.projectId)
  if (filters.since) params.set("since", filters.since)
  params.set("page", String(filters.page))
  params.set("page_size", String(filters.pageSize ?? PO_PAGE_SIZE))
  return apiFetch<PurchaseOrderListResponse>(`/api/purchase-orders?${params.toString()}`)
}

export function getPurchaseOrder(id: string): Promise<PurchaseOrderDetail> {
  return apiFetch<PurchaseOrderDetail>(`/api/purchase-orders/${id}`)
}

export function createPurchaseOrder(data: PurchaseOrderCreate): Promise<PurchaseOrderDetail> {
  return apiFetch<PurchaseOrderDetail>("/api/purchase-orders", { method: "POST", body: JSON.stringify(data) })
}

export function updatePurchaseOrder(id: string, data: PurchaseOrderUpdate): Promise<PurchaseOrderDetail> {
  return apiFetch<PurchaseOrderDetail>(`/api/purchase-orders/${id}`, { method: "PUT", body: JSON.stringify(data) })
}

export function receivePurchaseOrder(
  id: string,
  body: PurchaseOrderReceiveRequest,
): Promise<PurchaseOrderActionResult> {
  return apiFetch<PurchaseOrderActionResult>(`/api/purchase-orders/${id}/receive`, {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function cancelPurchaseOrder(id: string, reason: string | null = null): Promise<PurchaseOrderActionResult> {
  return apiFetch<PurchaseOrderActionResult>(`/api/purchase-orders/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  })
}
