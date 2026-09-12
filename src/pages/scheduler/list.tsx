import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { Link } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import {
  deleteScheduledTask,
  executorText,
  formatDateTime,
  isEditableTask,
  listScheduledTasks,
  runScheduledTask,
  schedulerKeys,
  SOURCE_LABEL,
  toggleScheduledTask,
  triggerText,
  type ScheduledTask,
} from "@/lib/scheduler"

function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.detail : fallback
}

/** 上次執行那一格：時間、成功／失敗 badge、失敗訊息摘要、連續失敗次數。 */
function LastRunCell({ task }: { task: ScheduledTask }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap">{formatDateTime(task.last_run_at)}</span>
        {task.last_run_success === true && <Badge variant="tint">成功</Badge>}
        {task.last_run_success === false && <Badge variant="destructive">失敗</Badge>}
      </div>
      {task.last_run_success === false && task.last_run_error && (
        <p className="max-w-64 truncate text-xs text-muted-foreground" title={task.last_run_error}>
          {task.last_run_error}
        </p>
      )}
      {task.consecutive_failures > 0 && (
        <p className="text-xs font-medium text-destructive">連續失敗 {task.consecutive_failures} 次</p>
      )}
    </div>
  )
}

export default function SchedulerListPage() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: schedulerKeys.tasks, queryFn: listScheduledTasks })
  const tasks = query.data?.tasks ?? []

  const [confirmRun, setConfirmRun] = React.useState<ScheduledTask | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<ScheduledTask | null>(null)
  const [runMessage, setRunMessage] = React.useState<string | null>(null)

  const toggle = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) => toggleScheduledTask(id, isEnabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulerKeys.tasks }),
  })

  const run = useMutation({
    mutationFn: (id: string) => runScheduledTask(id),
    onSuccess: (res) => {
      setRunMessage(res.message)
      queryClient.invalidateQueries({ queryKey: schedulerKeys.tasks })
    },
    onSettled: () => setConfirmRun(null),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteScheduledTask(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulerKeys.tasks }),
    onSettled: () => setConfirmDelete(null),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">排程</h1>
        <Button asChild>
          <Link to="/scheduler/new">新增排程</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        bot 也能用 MCP 工具建立排程，這裡看到的是同一份。系統與模組排程寫在程式裡，只能看不能改。
      </p>

      {runMessage && (
        <Alert role="status">
          <AlertDescription>{runMessage}</AlertDescription>
        </Alert>
      )}
      {toggle.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{errorText(toggle.error, "切換失敗，請稍後再試")}</AlertDescription>
        </Alert>
      )}
      {run.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{errorText(run.error, "送出執行失敗，請稍後再試")}</AlertDescription>
        </Alert>
      )}
      {remove.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{errorText(remove.error, "刪除失敗，請稍後再試")}</AlertDescription>
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
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-muted-foreground">還沒有排程</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名稱</TableHead>
                <TableHead>觸發</TableHead>
                <TableHead>執行器</TableHead>
                <TableHead>啟用</TableHead>
                <TableHead>下次執行</TableHead>
                <TableHead>上次執行</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => {
                const editable = isEditableTask(task)
                return (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{task.name}</span>
                          <Badge variant={task.source === "dynamic" ? "secondary" : "outline"}>
                            {SOURCE_LABEL[task.source]}
                          </Badge>
                        </div>
                        {task.description && (
                          <p className="max-w-64 text-xs text-muted-foreground">{task.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {triggerText(task.trigger_type, task.trigger_config)}
                    </TableCell>
                    <TableCell>{executorText(task.executor_type, task.executor_config)}</TableCell>
                    <TableCell>
                      <Switch
                        aria-label={`啟用 ${task.name}`}
                        checked={task.is_enabled}
                        // 靜態排程不在資料表裡，PATCH 會落到 404（api/scheduler.py 202–204）
                        disabled={!editable || toggle.isPending}
                        onCheckedChange={(v) => toggle.mutate({ id: task.id, isEnabled: v })}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(task.next_run_at)}</TableCell>
                    <TableCell>
                      <LastRunCell task={task} />
                    </TableCell>
                    <TableCell className="text-right">
                      {editable ? (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setConfirmRun(task)}>
                            立即執行
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/scheduler/${task.id}/edit`}>編輯</Link>
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(task)}>
                            刪除
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">內建，不可修改</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/*
        確認對話框放在列表外面只留一個：每列各自掛一個的話，退場動畫留下的 overlay
        會吃掉下一次點擊（#26）。
      */}
      <AlertDialog
        open={confirmRun !== null}
        onOpenChange={(open) => {
          if (!open && !run.isPending) setConfirmRun(null)
        }}
      >
        {confirmRun && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確定立即執行「{confirmRun.name}」？</AlertDialogTitle>
              <AlertDialogDescription>
                這會馬上真的跑一次，agent 會呼叫 AI、腳本會真的執行，而且照設定推播結果。不是試跑。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={run.isPending}>返回</AlertDialogCancel>
              {/* 用一般的 Button：AlertDialogAction 按下去就關掉，請求還在路上按鈕就不見了。 */}
              <Button disabled={run.isPending} onClick={() => run.mutate(confirmRun.id)}>
                確定執行
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setConfirmDelete(null)
        }}
      >
        {confirmDelete && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確定刪除「{confirmDelete.name}」？</AlertDialogTitle>
              <AlertDialogDescription>刪除後這份排程不會再執行，也無法復原。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={remove.isPending}>返回</AlertDialogCancel>
              <Button disabled={remove.isPending} onClick={() => remove.mutate(confirmDelete.id)}>
                確定刪除
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  )
}
