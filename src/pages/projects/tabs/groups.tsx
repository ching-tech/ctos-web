import { Link } from "react-router"
import { Badge } from "@/components/ui/badge"
import { PLATFORM_LABEL } from "@/lib/bot"
import { projectLabel, type ProjectDetail } from "@/lib/projects"

export default function GroupsTab({ project }: { project: ProjectDetail }) {
  if (project.bot_groups.length === 0) {
    return <p className="pt-4 text-muted-foreground">尚未綁定群組</p>
  }

  return (
    <ul className="space-y-2 pt-4">
      {project.bot_groups.map((g) => (
        <li key={g.id} className="rounded-lg border p-3 text-sm">
          <Link to={`/bot/groups/${g.id}`} className="flex items-center gap-2 underline-offset-4 hover:underline">
            <Badge variant="tint">{projectLabel(PLATFORM_LABEL, g.platform_type)}</Badge>
            <span className="font-medium text-primary">{g.group_name || "未命名群組"}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
