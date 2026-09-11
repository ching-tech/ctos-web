import { Link } from "react-router"
import { Badge } from "@/components/ui/badge"
import {
  CATEGORY_LABEL,
  categoryColor,
  label,
  SCOPE_LABEL,
  TYPE_LABEL,
  type KnowledgeListItem,
} from "@/lib/kb"

function tagsSummary(item: KnowledgeListItem): string {
  return [...item.tags.topics, ...item.tags.roles].join("、")
}

export function KbCard({ item }: { item: KnowledgeListItem }) {
  const summary = item.snippet || tagsSummary(item)
  return (
    <Link
      to={`/kb/${item.id}`}
      className="flex min-h-28 flex-col gap-1.5 rounded-lg border p-4 hover:border-foreground/30"
    >
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="shrink-0">{label(SCOPE_LABEL, item.scope)}</Badge>
        <span className={`text-xs font-medium tracking-wide ${categoryColor(item.category)}`}>
          {label(CATEGORY_LABEL, item.category)}
        </span>
      </div>
      <span className="line-clamp-1 font-medium">{item.title}</span>
      {summary && <p className="line-clamp-2 text-sm text-muted-foreground">{summary}</p>}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
        <span className="truncate">
          {item.author}・{item.updated_at}
        </span>
        <Badge variant="outline" className="shrink-0">{label(TYPE_LABEL, item.type)}</Badge>
      </div>
    </Link>
  )
}
