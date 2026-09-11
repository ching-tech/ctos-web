import { useQuery } from "@tanstack/react-query"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { botKeys, listGroups } from "@/lib/bot"

// 群組篩選下拉：訊息／檔案分頁共用。群組清單只取第一頁（照舊桌面 `state.groups` 的用法），
// 超過一頁的群組數量暫不分頁載入。
const GROUPS_FILTER = { page: 1 } as const

export function GroupFilterSelect({
  value,
  onValueChange,
  ariaLabel,
  allLabel,
}: {
  value: string
  onValueChange: (value: string) => void
  ariaLabel: string
  allLabel: string
}) {
  const query = useQuery({ queryKey: botKeys.groups(GROUPS_FILTER), queryFn: () => listGroups(GROUPS_FILTER) })
  const groups = query.data?.items ?? []

  return (
    <Select value={value || "all"} onValueChange={onValueChange}>
      <SelectTrigger className="w-40" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {groups.map((g) => (
          <SelectItem key={g.id} value={g.id}>
            {g.name || "未命名群組"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
