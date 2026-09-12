import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Link, useNavigate, useParams } from "react-router"
import { Markdown } from "@/components/kb/markdown"
import { TagInput } from "@/components/skills/tag-input"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { configAppKeys, listConfigApps, type ConfigApp } from "@/lib/config-apps"
import {
  deleteSkill,
  getSkill,
  getSkillFile,
  requiredApps,
  skillKeys,
  skillUpdatePatch,
  updateSkill,
  type SkillDetail,
} from "@/lib/skills"
import { appLabel, appOptions } from "./apps"

function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.detail : fallback
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

function FileList({ title, paths, emptyText }: { title: string; paths: string[]; emptyText: string }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-medium">{title}</h2>
      {paths.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {paths.map((p) => (
            <li key={p} className="font-mono text-sm">
              {p}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** references 點了才抓內容（`GET /{name}/files/{path}`）；`.md` 用知識庫那支 Markdown 元件渲染。 */
function References({ name, paths }: { name: string; paths: string[] }) {
  const [open, setOpen] = React.useState<string | null>(null)
  const query = useQuery({
    queryKey: skillKeys.file(name, open ?? ""),
    queryFn: () => getSkillFile(name, open as string),
    enabled: open !== null,
  })

  return (
    <section className="space-y-2">
      <h2 className="text-base font-medium">參考資料</h2>
      {paths.length === 0 ? (
        <p className="text-sm text-muted-foreground">沒有參考資料</p>
      ) : (
        <ul className="space-y-1">
          {paths.map((p) => (
            <li key={p}>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 font-mono text-sm"
                onClick={() => setOpen(open === p ? null : p)}
              >
                {p}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {open !== null && (
        <div className="rounded-lg border p-3">
          {query.isError ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{errorText(query.error, "讀不到這份檔案")}</AlertDescription>
            </Alert>
          ) : query.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : open.endsWith(".md") ? (
            <Markdown content={query.data?.content ?? ""} />
          ) : (
            <pre className="overflow-auto text-xs whitespace-pre-wrap">{query.data?.content ?? ""}</pre>
          )}
        </div>
      )}
    </section>
  )
}

function EditForm({ skill, apps }: { skill: SkillDetail; apps: ConfigApp[] }) {
  const queryClient = useQueryClient()
  // 勾起來的 app id；`apps` 這個名字留給後端來的 app 清單（prop）。
  const [selected, setSelected] = React.useState<string[]>(() => requiredApps(skill.requires_app))
  const [tools, setTools] = React.useState<string[]>(() => [...skill.allowed_tools])
  const [servers, setServers] = React.useState<string[]>(() => [...skill.mcp_servers])
  const [notice, setNotice] = React.useState<string | null>(null)

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateSkill>[1]) => updateSkill(skill.name, patch),
    onMutate: () => setNotice(null),
    onSuccess: (data) => {
      // 後端回的是寫回 SKILL.md 之後重讀的值，照它更新畫面，不要拿送出去的草稿當結果。
      setSelected(requiredApps(data.requires_app))
      setTools([...data.allowed_tools])
      setServers([...data.mcp_servers])
      setNotice("已儲存")
      void queryClient.invalidateQueries({ queryKey: skillKeys.all })
    },
    onError: (e) => setNotice(errorText(e, "儲存失敗，請稍後再試")),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const patch = skillUpdatePatch(skill, { requires_app: selected, allowed_tools: tools, mcp_servers: servers })
    // 一個欄位都沒變就不要送：後端會回 400「No fields to update」（`api/skills.py` 273–274）。
    if (!patch) {
      setNotice("沒有變動，不需要儲存")
      return
    }
    save.mutate(patch)
  }

  // 選項＝後端宣告的 app，再併上 SKILL.md 已經寫了、但後端沒宣告的（例如 `debug-skill` 的 `admin`），
  // 不然按一次儲存就會把原本的設定洗掉。
  const options = appOptions(apps, requiredApps(skill.requires_app))

  return (
    <form className="space-y-4 rounded-lg border p-4" onSubmit={submit}>
      <h2 className="text-base font-medium">權限與工具</h2>

      <fieldset className="space-y-2">
        <legend className="text-sm text-muted-foreground">需要的 app（勾多個時只要有其中一個就能用）</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {options.map((app) => (
            <div key={app} className="flex items-center gap-2">
              <Checkbox
                id={`app-${app}`}
                checked={selected.includes(app)}
                onCheckedChange={(checked) =>
                  setSelected(checked === true ? [...selected, app] : selected.filter((a) => a !== app))
                }
              />
              <Label htmlFor={`app-${app}`}>{appLabel(apps, app)}</Label>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">允許的工具</p>
        <TagInput id="allowed-tools" label="新增工具" values={tools} placeholder="工具名稱" onChange={setTools} />
      </div>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">MCP servers</p>
        <TagInput id="mcp-servers" label="新增 MCP server" values={servers} placeholder="server 名稱" onChange={setServers} />
      </div>

      {notice && (
        <Alert role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={save.isPending}>
        儲存
      </Button>
    </form>
  )
}

export default function SkillDetailPage() {
  const { name = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [metaOpen, setMetaOpen] = React.useState(false)

  const query = useQuery({ queryKey: skillKeys.detail(name), queryFn: () => getSkill(name), enabled: name !== "" })
  // app 選項與中文名以後端為準（`GET /api/config/apps`）；抓不到就只剩目前已選的那些，顯示 id。
  const appsQuery = useQuery({ queryKey: configAppKeys.all, queryFn: listConfigApps })

  const remove = useMutation({
    mutationFn: () => deleteSkill(name),
    onMutate: () => setNotice(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillKeys.all })
      void navigate("/skills")
    },
    onError: (e) => setNotice(errorText(e, "移除失敗，請稍後再試")),
    // 等請求落地才關對話框（#29）。
    onSettled: () => setConfirming(false),
  })

  if (query.isError) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive" role="alert">
          <AlertDescription>{errorText(query.error, "載入失敗，請稍後再試")}</AlertDescription>
        </Alert>
        <Link className="text-primary underline underline-offset-4" to="/skills">
          回 Skills
        </Link>
      </div>
    )
  }

  if (query.isLoading || !query.data) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  const skill = query.data
  const meta = skill.meta

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{skill.name}</h1>
          <p className="text-sm text-muted-foreground">{skill.description || "（沒有說明）"}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" asChild>
            <Link to="/skills">回清單</Link>
          </Button>
          <Button type="button" variant="outline" disabled={remove.isPending} onClick={() => setConfirming(true)}>
            刪除
          </Button>
        </div>
      </div>

      {notice && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="來源">
          <Badge variant="outline">{skill.source}</Badge>
        </Field>
        <Field label="授權">{skill.license || "—"}</Field>
        <Field label="相容版本">{skill.compatibility || "—"}</Field>
        <Field label="模組">{skill.has_module ? "有" : "無"}</Field>
      </dl>

      <EditForm key={skill.name} skill={skill} apps={appsQuery.data ?? []} />

      <section className="space-y-2">
        <h2 className="text-base font-medium">提示詞</h2>
        {skill.has_prompt ? (
          <div className="rounded-lg border p-3">
            <Markdown content={skill.prompt} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">沒有提示詞</p>
        )}
      </section>

      <References name={skill.name} paths={skill.references} />

      {/*
        腳本只列名稱，不給執行鈕：`POST /{name}/scripts/{script}/run`（`api/skills.py` 527）
        等於讓網頁跑伺服器上的腳本，那支要先綁工具權限（ching-tech-os #210）才會有 UI。
      */}
      <section className="space-y-2">
        <h2 className="text-base font-medium">腳本</h2>
        <p className="text-sm text-muted-foreground">腳本只在這裡列出，執行由 AI 走工具權限，網頁不提供執行。</p>
        {skill.scripts.length === 0 ? (
          <p className="text-sm text-muted-foreground">沒有腳本</p>
        ) : (
          <ul className="space-y-1">
            {skill.scripts.map((s) => {
              // `script_tools[].path` 是相對 skills 根目錄的（`<skill>/scripts/x.py`，
              // `script_runner.py` 95），`scripts[]` 是相對 skill 目錄的（`scripts/x.py`，
              // `skills/__init__.py` 167–168），兩者永遠對不起來，所以只用 `name` 比。
              const info = skill.script_tools.find((t) => t.name === s.replace(/^scripts\//, "").replace(/\.(py|sh)$/, ""))
              return (
                <li key={s} className="text-sm">
                  <span className="font-mono">{s}</span>
                  {info?.description && <span className="ml-2 text-muted-foreground">{info.description}</span>}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <FileList title="附帶檔案" paths={skill.assets} emptyText="沒有附帶檔案" />

      <section className="space-y-2">
        <h2 className="text-base font-medium">安裝資訊</h2>
        {meta && Object.keys(meta).length > 0 ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setMetaOpen(!metaOpen)}>
              {metaOpen ? "收起" : "展開"}
            </Button>
            {metaOpen && (
              <pre className="overflow-auto rounded-lg border bg-muted p-3 text-xs">{JSON.stringify(meta, null, 2)}</pre>
            )}
          </>
        ) : (
          // 只有從 Hub 裝進來的才有 `_meta.json`（`services/hub_meta.py` 55–83）。
          <p className="text-sm text-muted-foreground">沒有安裝資訊（不是從 Hub 裝的）</p>
        )}
      </section>

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setConfirming(false)
        }}
      >
        {confirming && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確定移除「{skill.name}」？</AlertDialogTitle>
              <AlertDialogDescription>
                移除後這個 skill 的目錄會從伺服器刪掉，AI 立刻用不到；要救回來得重裝一次。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={remove.isPending}>返回</AlertDialogCancel>
              <Button disabled={remove.isPending} onClick={() => remove.mutate()}>
                確定移除
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  )
}
