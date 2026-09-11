import { Button } from "@/components/ui/button"

/** 通用「上一頁／下一頁／第 p／P 頁」分頁列。 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        上一頁
      </Button>
      <span className="text-sm text-muted-foreground">
        第 {page}／{totalPages} 頁
      </span>
      <Button variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        下一頁
      </Button>
    </div>
  )
}
