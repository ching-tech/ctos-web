import { Link } from "react-router"
import { Badge } from "@/components/ui/badge"
import type { PartyDetail } from "@/lib/erp"
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TINT, projectLabel, tint } from "@/lib/projects"

/** 相關專案＝這家供應商的採購單掛到的專案（後端 DISTINCT 出來的）。 */
export default function PartyProjectsTab({ party }: { party: PartyDetail }) {
  return (
    <div className="space-y-4 pt-4">
      <p className="text-sm text-muted-foreground">共 {party.projects.length} 個相關專案</p>

      {party.projects.length === 0 ? (
        <p className="text-muted-foreground">還沒有相關專案</p>
      ) : (
        <ul className="space-y-2">
          {party.projects.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <Link to={`/projects/${p.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                {p.name}
              </Link>
              <Badge variant="tint" className={tint(PROJECT_STATUS_TINT, p.status)}>
                {projectLabel(PROJECT_STATUS_LABEL, p.status)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
