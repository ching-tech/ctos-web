import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Pagination } from "@/components/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import type { Platform } from "@/lib/bot"
import { cn } from "@/lib/utils"

/** 左側清單的一列：群組與使用者攤平成同一個形狀，右邊只認 id 與 kind。 */
export interface MemoryTarget {
  id: string
  name: string
  platform: Platform
  /** 次要說明：群組是人數，使用者是綁定狀態。 */
  meta: string
}

/**
 * 記憶管理左側的對象清單。桌面固定在左欄，手機收進抽屜（`index.tsx` 的 Sheet），兩邊共用這一份。
 * 搜尋是就地過濾當頁資料：群組與使用者端點沒有關鍵字參數（`api/linebot_router.py`
 * 的 `api_list_groups`／`api_list_users_with_binding` 只收 `platform_type`／`limit`／`offset`），
 * 所以搜不到的要翻頁再找。
 */
export function TargetList({
  label,
  items,
  total,
  loading,
  error,
  activeId,
  query,
  onQueryChange,
  page,
  totalPages,
  onPageChange,
  onSelect,
}: {
  label: string
  items: MemoryTarget[]
  total: number
  loading: boolean
  error: string | null
  activeId: string | null
  query: string
  onQueryChange: (v: string) => void
  page: number
  totalPages: number
  onPageChange: (p: number) => void
  onSelect: (t: MemoryTarget) => void
}) {
  const filtered = query.trim()
    ? items.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()))
    : items

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <Input
        aria-label={`搜尋${label}`}
        placeholder={`搜尋${label}`}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">
          {total === 0 ? `沒有${label}` : `這一頁沒有符合的${label}`}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {filtered.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                aria-current={t.id === activeId ? "true" : undefined}
                onClick={() => onSelect(t)}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                  t.id === activeId && "bg-accent font-medium",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Badge variant="tint">{t.platform === "telegram" ? "Telegram" : "Line"}</Badge>
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                </span>
                <span className="text-xs text-muted-foreground">{t.meta}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />}
    </div>
  )
}
