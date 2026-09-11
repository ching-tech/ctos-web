import { Badge } from "@/components/ui/badge"
import { erpLabel, erpTint, PARTY_ROLE_LABEL, PARTY_ROLE_TINT, partyRoles, type PartyListItem } from "@/lib/erp"

/** 供應商／客戶可以同時成立，兩個 badge 一起出；一個都沒有時顯示破折號。 */
export function PartyRoleBadges({ party }: { party: Pick<PartyListItem, "is_supplier" | "is_customer"> }) {
  const roles = partyRoles(party)
  if (roles.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex flex-wrap items-center gap-1">
      {roles.map((r) => (
        <Badge key={r} variant="tint" className={erpTint(PARTY_ROLE_TINT, r)}>
          {erpLabel(PARTY_ROLE_LABEL, r)}
        </Badge>
      ))}
    </span>
  )
}
