import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Link, useNavigate, useParams } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import { listAgents } from "@/lib/ai-log"
import {
  createScheduledTask,
  CRON_FIELDS,
  CRON_PRESETS,
  diffTaskUpdate,
  EMPTY_CRON,
  getScheduledTask,
  isEditableTask,
  listSkillsForPicker,
  schedulerKeys,
  updateScheduledTask,
  validateJsonInput,
  type CronTriggerConfig,
  type ExecutorConfig,
  type ExecutorType,
  type IntervalTriggerConfig,
  type NotifyConfig,
  type NotifyPlatform,
  type ScheduledTask,
  type ScheduledTaskCreate,
  type TriggerType,
} from "@/lib/scheduler"

const NO_NOTIFY = "none"

const INTERVAL_FIELDS: { key: keyof IntervalTriggerConfig; label: string }[] = [
  { key: "weeks", label: "週" },
  { key: "days", label: "天" },
  { key: "hours", label: "小時" },
  { key: "minutes", label: "分" },
  { key: "seconds", label: "秒" },
]

interface EditorForm {
  name: string
  description: string
  triggerType: TriggerType
  cron: CronTriggerConfig
  /** interval 五欄在表單裡是字串，送出前才轉整數；空字串當成 0。 */
  interval: Record<keyof IntervalTriggerConfig, string>
  executorType: ExecutorType
  agentName: string
  prompt: string
  skill: string
  script: string
  input: string
  notifyPlatform: NotifyPlatform | typeof NO_NOTIFY
  notifyIsGroup: boolean
  notifyId: string
  isEnabled: boolean
}

const EMPTY_FORM: EditorForm = {
  name: "",
  description: "",
  triggerType: "cron",
  cron: { ...EMPTY_CRON },
  interval: { weeks: "0", days: "0", hours: "1", minutes: "0", seconds: "0" },
  executorType: "agent",
  agentName: "",
  prompt: "",
  skill: "",
  script: "",
  input: "",
  notifyPlatform: NO_NOTIFY,
  notifyIsGroup: false,
  notifyId: "",
  isEnabled: true,
}

/** 把後端的任務攤平成表單狀態。 */
function formFromTask(task: ScheduledTask): EditorForm {
  const notify = task.executor_config.notify ?? null
  const interval = { ...EMPTY_FORM.interval }
  for (const { key } of INTERVAL_FIELDS) {
    interval[key] = String(task.trigger_config[key] ?? 0)
  }
  return {
    name: task.name,
    description: task.description ?? "",
    triggerType: task.trigger_type,
    cron: {
      minute: task.trigger_config.minute ?? "*",
      hour: task.trigger_config.hour ?? "*",
      day: task.trigger_config.day ?? "*",
      month: task.trigger_config.month ?? "*",
      day_of_week: task.trigger_config.day_of_week ?? "*",
    },
    interval: task.trigger_type === "interval" ? interval : { ...EMPTY_FORM.interval },
    executorType: task.executor_type,
    agentName: task.executor_config.agent_name ?? "",
    prompt: task.executor_config.prompt ?? "",
    skill: task.executor_config.skill ?? "",
    script: task.executor_config.script ?? "",
    input: task.executor_config.input ?? "",
    notifyPlatform: notify?.platform ?? NO_NOTIFY,
    notifyIsGroup: notify?.is_group ?? false,
    notifyId: (notify?.is_group ? notify?.group_id : notify?.target_id) ?? "",
    isEnabled: task.is_enabled,
  }
}

/**
 * 組出送給後端的 body。`executor_config` 後端不驗證（models/scheduled_task.py 39–41），
 * 但欄位名稱必須照 `_execute_agent_task`／`_execute_skill_script_task` 讀的那幾個
 * （services/task_scheduler.py 299–300、384–386）。
 */
function payloadFromForm(form: EditorForm, original: ScheduledTask | null): ScheduledTaskCreate {
  const notify: NotifyConfig | null =
    form.notifyPlatform === NO_NOTIFY
      ? null
      : {
          platform: form.notifyPlatform,
          is_group: form.notifyIsGroup,
          target_id: form.notifyIsGroup ? null : form.notifyId.trim() || null,
          group_id: form.notifyIsGroup ? form.notifyId.trim() || null : null,
        }

  // 執行身份不在畫面上，沿用原本的設定，不要編一次就把它弄丟。
  const ctosUserId = original?.executor_config.ctos_user_id ?? null

  const executorConfig: ExecutorConfig =
    form.executorType === "agent"
      ? { agent_name: form.agentName, prompt: form.prompt }
      : { skill: form.skill, script: form.script, input: form.input.trim() }
  if (ctosUserId !== null) executorConfig.ctos_user_id = ctosUserId
  if (notify) executorConfig.notify = notify

  const triggerConfig =
    form.triggerType === "cron"
      ? { ...form.cron }
      : (Object.fromEntries(
          INTERVAL_FIELDS.map(({ key }) => [key, Number(form.interval[key]) || 0]),
        ) as unknown as IntervalTriggerConfig)

  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    trigger_type: form.triggerType,
    trigger_config: triggerConfig,
    executor_type: form.executorType,
    executor_config: executorConfig,
    is_enabled: form.isEnabled,
  }
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.detail : fallback
}

export default function SchedulerEditorPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)

  const detailQuery = useQuery({
    queryKey: schedulerKeys.task(id ?? ""),
    queryFn: () => getScheduledTask(id!),
    enabled: isEdit,
    retry: false,
  })

  if (isEdit && detailQuery.isError) {
    return (
      <div className="space-y-3">
        <Alert variant="destructive" role="alert">
          <AlertDescription>{errorText(detailQuery.error, "載入失敗，請稍後再試")}</AlertDescription>
        </Alert>
        <Link className="text-primary underline underline-offset-4" to="/scheduler">
          回排程清單
        </Link>
      </div>
    )
  }

  // Radix Select 掛上去之後才被程式化改 value 會出事，等資料到齊再渲染表單。
  if (isEdit && !detailQuery.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (isEdit && !isEditableTask(detailQuery.data!)) {
    return (
      <div className="space-y-3">
        <Alert variant="destructive" role="alert">
          <AlertDescription>系統與模組排程寫在程式裡，不能從這裡改。</AlertDescription>
        </Alert>
        <Link className="text-primary underline underline-offset-4" to="/scheduler">
          回排程清單
        </Link>
      </div>
    )
  }

  return (
    <TaskForm
      key={isEdit ? detailQuery.data!.id : "new"}
      id={id}
      isEdit={isEdit}
      original={isEdit ? detailQuery.data! : null}
      initial={isEdit ? formFromTask(detailQuery.data!) : EMPTY_FORM}
    />
  )
}

function TaskForm({
  id,
  isEdit,
  original,
  initial,
}: {
  id: string | undefined
  isEdit: boolean
  original: ScheduledTask | null
  initial: EditorForm
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState<EditorForm>(initial)

  const agentsQuery = useQuery({ queryKey: schedulerKeys.agents, queryFn: listAgents })
  const skillsQuery = useQuery({ queryKey: schedulerKeys.skills, queryFn: listSkillsForPicker })

  const save = useMutation({
    mutationFn: async () => {
      const payload = payloadFromForm(form, original)
      if (!isEdit) return createScheduledTask(payload)
      const body = diffTaskUpdate(original!, payload)
      // 什麼都沒改就不要送一趟空的 PUT，後端會把 job 重掛一次。
      if (Object.keys(body).length === 0) return original!
      return updateScheduledTask(id!, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schedulerKeys.all })
      navigate("/scheduler")
    },
  })

  function set<K extends keyof EditorForm>(key: K, value: EditorForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const jsonError = form.executorType === "skill_script" ? validateJsonInput(form.input) : null
  const skills = skillsQuery.data?.skills ?? []
  const scripts = skills.find((s) => s.name === form.skill)?.scripts ?? []
  const agents = agentsQuery.data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link to="/scheduler" className="text-sm text-primary underline-offset-4 hover:underline">
          回排程清單
        </Link>
        <h1 className="text-2xl font-semibold">{isEdit ? "編輯排程" : "新增排程"}</h1>
      </div>

      <form
        className="max-w-3xl space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (!form.name.trim() || jsonError) return
          save.mutate()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="task-name">名稱</Label>
          <Input
            id="task-name"
            required
            maxLength={128}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="task-description">說明</Label>
          <Textarea
            id="task-description"
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">觸發</legend>
          <div className="space-y-2">
            <span className="text-sm font-medium">觸發類型</span>
            <Select value={form.triggerType} onValueChange={(v) => set("triggerType", v as TriggerType)}>
              <SelectTrigger aria-label="觸發類型" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cron">Cron（指定時刻）</SelectItem>
                <SelectItem value="interval">Interval（固定間隔）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.triggerType === "cron" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {CRON_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => set("cron", { ...preset.config })}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {CRON_FIELDS.map(({ key, label }) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`cron-${key}`}>{label}</Label>
                    <Input
                      id={`cron-${key}`}
                      value={form.cron[key]}
                      onChange={(e) => set("cron", { ...form.cron, [key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                照 APScheduler 的寫法，星號代表每一個。週可以填 0 到 6 或 mon 這種縮寫。
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {INTERVAL_FIELDS.map(({ key, label }) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`interval-${key}`}>{label}</Label>
                    <Input
                      id={`interval-${key}`}
                      type="number"
                      min={0}
                      value={form.interval[key]}
                      onChange={(e) => set("interval", { ...form.interval, [key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                五欄全部是 0 的話，後端會當成每 1 小時。
              </p>
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">執行器</legend>
          <div className="space-y-2">
            <span className="text-sm font-medium">執行器類型</span>
            <Select value={form.executorType} onValueChange={(v) => set("executorType", v as ExecutorType)}>
              <SelectTrigger aria-label="執行器類型" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="skill_script">Skill Script</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.executorType === "agent" ? (
            <>
              <div className="space-y-2">
                <span className="text-sm font-medium">Agent</span>
                <Select value={form.agentName} onValueChange={(v) => set("agentName", v)}>
                  <SelectTrigger aria-label="Agent" className="w-full">
                    <SelectValue placeholder="選一個 Agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.name}>
                        {a.display_name ? `${a.name}（${a.display_name}）` : a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-prompt">指令</Label>
                <Textarea
                  id="task-prompt"
                  rows={4}
                  value={form.prompt}
                  onChange={(e) => set("prompt", e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <span className="text-sm font-medium">Skill</span>
                <Select
                  value={form.skill}
                  onValueChange={(v) => setForm((f) => ({ ...f, skill: v, script: "" }))}
                >
                  <SelectTrigger aria-label="Skill" className="w-full">
                    <SelectValue placeholder="選一個 Skill" />
                  </SelectTrigger>
                  <SelectContent>
                    {skills.map((s) => (
                      <SelectItem key={s.name} value={s.name}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium">Script</span>
                <Select value={form.script} onValueChange={(v) => set("script", v)} disabled={!form.skill}>
                  <SelectTrigger aria-label="Script" className="w-full">
                    <SelectValue placeholder={form.skill ? "選一個 Script" : "先選 Skill"} />
                  </SelectTrigger>
                  <SelectContent>
                    {scripts.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-input">輸入資料（JSON）</Label>
                <Textarea
                  id="task-input"
                  rows={4}
                  className="font-mono text-xs"
                  value={form.input}
                  onChange={(e) => set("input", e.target.value)}
                />
                {jsonError ? (
                  <p className="text-xs font-medium text-destructive" role="alert">
                    {jsonError}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">留空代表沒有輸入。</p>
                )}
              </div>
            </>
          )}
        </fieldset>

        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">通知</legend>
          <div className="space-y-2">
            <span className="text-sm font-medium">推播平台</span>
            <Select
              value={form.notifyPlatform}
              onValueChange={(v) => set("notifyPlatform", v as NotifyPlatform | typeof NO_NOTIFY)}
            >
              <SelectTrigger aria-label="推播平台" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_NOTIFY}>不推播</SelectItem>
                <SelectItem value="line">LINE</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.notifyPlatform !== NO_NOTIFY && (
            <>
              <div className="flex items-center gap-3">
                <Switch
                  id="notify-is-group"
                  checked={form.notifyIsGroup}
                  onCheckedChange={(v) => set("notifyIsGroup", v)}
                />
                <Label htmlFor="notify-is-group">推到群組</Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notify-id">{form.notifyIsGroup ? "群組 ID" : "接收者 ID"}</Label>
                <Input
                  id="notify-id"
                  value={form.notifyId}
                  onChange={(e) => set("notifyId", e.target.value)}
                />
              </div>
            </>
          )}
        </fieldset>

        <div className="flex items-center gap-3">
          <Switch id="task-enabled" checked={form.isEnabled} onCheckedChange={(v) => set("isEnabled", v)} />
          <Label htmlFor="task-enabled">啟用</Label>
        </div>

        {save.isError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{errorText(save.error, "儲存失敗，請稍後再試")}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending || Boolean(jsonError)}>
            {isEdit ? "儲存" : "新增"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to="/scheduler">取消</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
