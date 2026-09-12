import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Link, useLocation } from "react-router"
import { HubDialog } from "@/components/skills/hub-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import { titleForPath } from "@/lib/nav"
import { appLabel } from "@/pages/skills/apps"
import { listSkills, reloadSkills, requiredApps, skillKeys, type SkillSummary } from "@/lib/skills"

function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.detail : fallback
}

/** 需要的 app：清單語意是「任一」（`skills/__init__.py` 103–105），所以每個都列出來。 */
function RequiresApp({ skill }: { skill: SkillSummary }) {
  const apps = requiredApps(skill.requires_app)
  if (apps.length === 0) return <span className="text-muted-foreground">不限</span>
  return (
    <span className="flex flex-wrap gap-1">
      {apps.map((a) => (
        <Badge key={a} variant="tint">
          {appLabel(a)}
        </Badge>
      ))}
    </span>
  )
}

function SkillCard({ skill }: { skill: SkillSummary }) {
  return (
    <li className="space-y-2 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/skills/${encodeURIComponent(skill.name)}`} className="font-medium text-primary underline-offset-4 hover:underline">
          {skill.name}
        </Link>
        <Badge variant="outline">{skill.source}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{skill.description || "（沒有說明）"}</p>
      <dl className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">需要的 app</dt>
          <dd>
            <RequiresApp skill={skill} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">工具數</dt>
          <dd className="tabular-nums">{skill.tools_count}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">提示詞</dt>
          <dd>{skill.has_prompt ? "有" : "無"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">模組</dt>
          <dd>{skill.has_module ? "有" : "無"}</dd>
        </div>
      </dl>
    </li>
  )
}

export default function SkillListPage() {
  const { pathname } = useLocation()
  const queryClient = useQueryClient()
  const [term, setTerm] = React.useState("")
  const [notice, setNotice] = React.useState<string | null>(null)
  const [hubOpen, setHubOpen] = React.useState(false)

  const query = useQuery({ queryKey: skillKeys.list(), queryFn: listSkills })

  const reload = useMutation({
    mutationFn: reloadSkills,
    onMutate: () => setNotice(null),
    onSuccess: (data) => {
      setNotice(`已重新載入 ${data.reloaded} 個 skill`)
      void queryClient.invalidateQueries({ queryKey: skillKeys.all })
    },
    onError: (e) => setNotice(errorText(e, "重新載入失敗，請稍後再試")),
  })

  const skills = query.data?.skills ?? []
  // 後端這支沒有關鍵字參數，搜尋是就地過濾：名稱與說明都比對。
  const keyword = term.trim().toLowerCase()
  const visible = keyword
    ? skills.filter((s) => s.name.toLowerCase().includes(keyword) || s.description.toLowerCase().includes(keyword))
    : skills

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sr-only">{titleForPath(pathname)}</h1>
        <p className="text-sm text-muted-foreground">{query.isLoading ? "" : `共 ${visible.length} 個`}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={reload.isPending} onClick={() => reload.mutate()}>
            重新載入
          </Button>
          <Button type="button" onClick={() => setHubOpen(true)}>
            從 Hub 安裝
          </Button>
        </div>
      </div>

      <Input
        aria-label="搜尋 skill"
        placeholder="搜尋名稱或說明"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />

      {notice && (
        <Alert role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {query.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{errorText(query.error, "載入失敗，請稍後再試")}</AlertDescription>
        </Alert>
      ) : query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground">{skills.length === 0 ? "還沒有任何 skill" : "沒有符合的 skill"}</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  <TableHead>說明</TableHead>
                  <TableHead>需要的 app</TableHead>
                  <TableHead>工具數</TableHead>
                  <TableHead>提示詞</TableHead>
                  <TableHead>來源</TableHead>
                  <TableHead>模組</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((skill) => (
                  <TableRow key={skill.name}>
                    <TableCell>
                      <Link
                        to={`/skills/${encodeURIComponent(skill.name)}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {skill.name}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-96">
                      <span className="block truncate" title={skill.description}>
                        {skill.description || "（沒有說明）"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <RequiresApp skill={skill} />
                    </TableCell>
                    <TableCell className="tabular-nums">{skill.tools_count}</TableCell>
                    <TableCell>{skill.has_prompt ? "有" : "無"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{skill.source}</Badge>
                    </TableCell>
                    <TableCell>{skill.has_module ? "有" : "無"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {visible.map((skill) => (
              <SkillCard key={skill.name} skill={skill} />
            ))}
          </ul>
        </>
      )}

      <HubDialog
        open={hubOpen}
        onOpenChange={setHubOpen}
        onInstalled={() => void queryClient.invalidateQueries({ queryKey: skillKeys.all })}
      />
    </div>
  )
}
