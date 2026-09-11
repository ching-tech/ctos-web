import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import { partyKbHref, type PartyDetail } from "@/lib/erp"

/**
 * 往來對象沒有知識庫 scope，後端的 knowledge_count 是拿名稱去全文檢索數出來的，
 * 所以這裡的入口也用同一個名稱當關鍵字，不帶 scope／project_id。
 */
export default function PartyKnowledgeTab({ party }: { party: PartyDetail }) {
  return (
    <div className="space-y-4 pt-4">
      <p className="text-sm text-muted-foreground">
        知識庫有 {party.knowledge_count} 筆提到「{party.name}」
      </p>
      <Button asChild variant="outline" size="sm">
        <Link to={partyKbHref(party.name)}>到知識庫查看</Link>
      </Button>
    </div>
  )
}
