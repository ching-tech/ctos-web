import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useLocation } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import { adminKeys, getDefaultPermissions, listUsers, updateUserPermissions, type AdminUserInfo, type UpdatePermissionsBody } from "@/lib/admin"
import { titleForPath } from "@/lib/nav"

const KNOWLEDGE_LABEL: Record<string, string> = {
  global_write: "全域知識可寫",
  global_delete: "全域知識可刪",
}

function formatDateTime(v: string | null): string {
  if (!v) return "—"
  return new Date(v).toLocaleString("zh-TW", { hour12: false })
}

function PermissionRow({
  id,
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string
  label: string
  checked: boolean
  disabled: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function PermissionsSheet({
  user,
  appNames,
  appNamesError,
  open,
  onOpenChange,
}: {
  user: AdminUserInfo | null
  appNames: Record<string, string>
  appNamesError: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = React.useState<string | null>(null)

  // 換人或開關 sheet 時清掉上一次殘留的錯誤訊息，避免上一位使用者的失敗訊息疊到這一位身上。
  // 依 React 建議在渲染期間比對、setState，不用 effect（同 kb/list.tsx 的搜尋框同步寫法）。
  const resetKey = `${user?.id ?? "none"}:${open}`
  const [lastResetKey, setLastResetKey] = React.useState(resetKey)
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setError(null)
  }

  const mutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdatePermissionsBody }) => updateUserPermissions(id, body),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: adminKeys.users })
    },
    onError: (e) => setError(e instanceof ApiError ? e.detail : "更新失敗，請稍後再試"),
  })

  if (!user) return null

  const disabled = user.is_admin || mutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>權限設定 — {user.display_name || user.username}</SheetTitle>
          <SheetDescription>
            {user.is_admin ? "管理員一律開放所有權限" : "變更後該使用者需重新登入才生效"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {appNamesError ? (
            <Alert variant="destructive">
              <AlertDescription>功能模組清單載入失敗，請稍後再試</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">功能模組</p>
              {Object.entries(appNames).map(([app, name]) => (
                <PermissionRow
                  key={app}
                  id={`app-${app}`}
                  label={name}
                  checked={user.is_admin ? true : (user.permissions.apps[app] ?? false)}
                  disabled={disabled}
                  onCheckedChange={(checked) => mutation.mutate({ id: user.id, body: { apps: { [app]: checked } } })}
                />
              ))}
            </div>
          )}
          <Separator />
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">知識庫</p>
            {Object.entries(KNOWLEDGE_LABEL).map(([key, name]) => (
              <PermissionRow
                key={key}
                id={`kn-${key}`}
                label={name}
                checked={user.is_admin ? true : (user.permissions.knowledge[key] ?? false)}
                disabled={disabled}
                onCheckedChange={(checked) => mutation.mutate({ id: user.id, body: { knowledge: { [key]: checked } } })}
              />
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default function AdminUsersPage() {
  const { pathname } = useLocation()
  const usersQuery = useQuery({ queryKey: adminKeys.users, queryFn: listUsers })
  const defaultsQuery = useQuery({ queryKey: adminKeys.defaultPermissions, queryFn: getDefaultPermissions })
  const [selectedId, setSelectedId] = React.useState<number | null>(null)

  const users = usersQuery.data?.users ?? []
  const selectedUser = users.find((u) => u.id === selectedId) ?? null
  const appNames = defaultsQuery.data?.app_names ?? {}

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sr-only">{titleForPath(pathname)}</h1>
        <p className="text-sm text-muted-foreground">{usersQuery.isLoading ? "" : `共 ${users.length} 位使用者`}</p>
      </div>

      {usersQuery.isError && (
        <Alert variant="destructive">
          <AlertDescription>{usersQuery.error instanceof ApiError ? usersQuery.error.detail : "載入失敗，請稍後再試"}</AlertDescription>
        </Alert>
      )}

      {usersQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>帳號</TableHead>
                <TableHead>顯示名稱</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>密碼</TableHead>
                <TableHead>最後登入</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.username}</TableCell>
                  <TableCell>{u.display_name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="tint">{u.is_admin ? "管理員" : "使用者"}</Badge>
                  </TableCell>
                  <TableCell>{u.is_active ? "啟用" : "停用"}</TableCell>
                  <TableCell>{u.has_password ? "已設定" : "NAS"}</TableCell>
                  <TableCell>{formatDateTime(u.last_login_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setSelectedId(u.id)}>
                      權限
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PermissionsSheet
        user={selectedUser}
        appNames={appNames}
        appNamesError={defaultsQuery.isError}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
      />
    </div>
  )
}
