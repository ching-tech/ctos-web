import { useQuery } from "@tanstack/react-query"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { botKeys, listGroups, type Platform } from "@/lib/bot"

// 群組篩選下拉：訊息／檔案分頁共用。群組清單只取第一頁（照舊桌面 `state.groups` 的用法），
// 超過一頁的群組數量暫不分頁載入；比照舊桌面 `platformQuery()`（linebot.js:307-312），
// 依殼頁目前選的平台縮小範圍，不然切到 Line／Telegram 還是看得到另一平台的群組。
export function GroupFilterSelect({
  platform,
  value,
  onValueChange,
  ariaLabel,
  allLabel,
}: {
  platform: Platform | ""
  value: string
  onValueChange: (value: string) => void
  ariaLabel: string
  allLabel: string
}) {
  const filter = { platform, page: 1 }
  const query = useQuery({ queryKey: botKeys.groups(filter), queryFn: () => listGroups(filter) })
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
