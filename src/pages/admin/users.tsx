import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useLocation } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import {
  adminKeys,
  clearUserPassword,
  createUser,
  deleteUser,
  getDefaultPermissions,
  listUsers,
  resetUserPassword,
  updateUserInfo,
  updateUserPermissions,
  updateUserStatus,
  type AdminUserInfo,
  type UpdatePermissionsBody,
  type UpdateUserInfoBody,
} from "@/lib/admin"
import { useAuth } from "@/lib/auth-context"
import { titleForPath } from "@/lib/nav"

const KNOWLEDGE_LABEL: Record<string, string> = {
  global_write: "全域知識可寫",
  global_delete: "全域知識可刪",
}

/** 後端只收 "user" 與 "admin"（api/user.py 410–415、475–477）。 */
const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "user", label: "使用者" },
  { value: "admin", label: "管理員" },
]

/** 後端擋自己的四條規則（api/user.py 465–470、539–543、577–582、616–620），前端先擋起來並寫原因，不必等 400。 */
const SELF_BLOCK = {
  demote: "不能降級自己的角色",
  deactivate: "不能停用自己的帳號",
  clearPassword: "不能清除自己的密碼",
  delete: "不能刪除自己的帳號",
}

/** `CreateUserRequest.password` 與 `ResetPasswordRequest.new_password` 都是 `min_length=8`（models/user.py 66、99）。 */
const MIN_PASSWORD_LENGTH = 8

interface Notice {
  variant: "default" | "destructive"
  text: string
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.detail : fallback
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
    onError: (e) => setError(errorText(e, "更新失敗，請稍後再試")),
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

interface CreateForm {
  username: string
  password: string
  displayName: string
  role: string
}

const EMPTY_CREATE_FORM: CreateForm = { username: "", password: "", displayName: "", role: "user" }

/** 新增使用者對話框。後端一律把新帳號設成 `must_change_password=true`（api/user.py 433）。 */
function CreateUserDialog({ onCreated }: { onCreated: (notice: Notice) => void }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<CreateForm>(EMPTY_CREATE_FORM)

  const mutation = useMutation({
    mutationFn: () =>
      createUser({
        username: form.username.trim(),
        password: form.password,
        // 沒填就送 null，讓後端存 NULL 而不是空字串
        display_name: form.displayName.trim() || null,
        role: form.role,
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users })
      setOpen(false)
      onCreated({
        variant: "default",
        text: `已新增使用者 ${res.username ?? form.username.trim()}，新使用者首次登入需改密碼`,
      })
    },
  })

  function set<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) mutation.reset()
        // 每次開啟都從空白重來，不要留上一次沒送出的草稿（尤其是密碼）
        if (v) setForm(EMPTY_CREATE_FORM)
      }}
    >
      <DialogTrigger asChild>
        <Button>新增使用者</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增使用者</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!form.username.trim() || form.password.length < MIN_PASSWORD_LENGTH) return
            mutation.mutate()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="create-username">帳號</Label>
              <Input
                id="create-username"
                required
                maxLength={100}
                autoComplete="off"
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">密碼</Label>
              <Input
                id="create-password"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-display-name">顯示名稱</Label>
              <Input
                id="create-display-name"
                value={form.displayName}
                onChange={(e) => set("displayName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-role">角色</Label>
              <Select value={form.role} onValueChange={(v) => set("role", v)}>
                <SelectTrigger id="create-role" aria-label="角色" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            密碼至少 {MIN_PASSWORD_LENGTH} 個字元；新使用者首次登入需改密碼。
          </p>

          {mutation.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{errorText(mutation.error, "新增失敗，請稍後再試")}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              新增
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface EditForm {
  displayName: string
  email: string
  role: string
}

/**
 * 編輯使用者。清單端點（`AdminUserInfo`）沒有回 email，所以 Email 欄位一律從空白開始：
 * 空白代表「不變更」（後端 `update_user_info` 只有 `None` 才跳過該欄，見 services/user.py 596–599），
 * 填了才送。
 */
function EditUserDialog({
  user,
  isSelf,
  open,
  onOpenChange,
  onDone,
}: {
  user: AdminUserInfo
  isSelf: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (notice: Notice) => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState<EditForm>({
    displayName: user.display_name ?? "",
    email: "",
    role: user.role,
  })

  const mutation = useMutation({
    mutationFn: () => {
      const body: UpdateUserInfoBody = {}
      if (form.displayName.trim() !== (user.display_name ?? "")) body.display_name = form.displayName.trim()
      if (form.email.trim()) body.email = form.email.trim()
      if (form.role !== user.role) body.role = form.role
      return updateUserInfo(user.id, body)
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users })
      onOpenChange(false)
      onDone({ variant: "default", text: res.message ?? "使用者資訊已更新" })
    },
  })

  function set<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) mutation.reset()
        // 每次開啟都從目前資料重來，不要留上一次沒送出的草稿
        if (v) setForm({ displayName: user.display_name ?? "", email: "", role: user.role })
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>編輯使用者 — {user.username}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-display-name">顯示名稱</Label>
              <Input
                id="edit-display-name"
                value={form.displayName}
                onChange={(e) => set("displayName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-role">角色</Label>
              <Select value={form.role} onValueChange={(v) => set("role", v)} disabled={isSelf}>
                <SelectTrigger id="edit-role" aria-label="角色" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isSelf && <p className="text-sm text-muted-foreground">{SELF_BLOCK.demote}</p>}
            </div>
          </div>

          <p className="text-sm text-muted-foreground">Email 留空代表不變更；清單沒有回現有的 Email。</p>

          {mutation.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{errorText(mutation.error, "更新失敗，請稍後再試")}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              儲存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
  onDone,
}: {
  user: AdminUserInfo
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (notice: Notice) => void
}) {
  const queryClient = useQueryClient()
  const [password, setPassword] = React.useState("")

  const mutation = useMutation({
    mutationFn: () => resetUserPassword(user.id, password),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users })
      onOpenChange(false)
      onDone({ variant: "default", text: res.message ?? "密碼已重設" })
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) mutation.reset()
        if (v) setPassword("")
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重設密碼 — {user.username}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (password.length < MIN_PASSWORD_LENGTH) return
            mutation.mutate()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="reset-password">新密碼</Label>
            <Input
              id="reset-password"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <p className="text-sm text-muted-foreground">
            密碼至少 {MIN_PASSWORD_LENGTH} 個字元；重設後該使用者下次登入需要變更密碼。
          </p>

          {mutation.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{errorText(mutation.error, "重設密碼失敗，請稍後再試")}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              重設密碼
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** 清除密碼與刪除共用的確認框：都是不可逆的動作，照既有頁面用 AlertDialog。 */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  pending,
  error,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  actionLabel: string
  pending: boolean
  error: unknown
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {Boolean(error) && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{errorText(error, "操作失敗，請稍後再試")}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              // 預設會關掉對話框，但這裡要等後端回來才知道成功還是失敗（失敗要把 detail 留在框裡）
              e.preventDefault()
              onConfirm()
            }}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type RowDialog = "edit" | "reset" | "clear" | "delete" | null

/** 每一列的動作選單與它開出來的對話框。 */
function UserRowActions({
  user,
  isSelf,
  onNotice,
}: {
  user: AdminUserInfo
  isSelf: boolean
  onNotice: (notice: Notice) => void
}) {
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [dialog, setDialog] = React.useState<RowDialog>(null)

  const statusMutation = useMutation({
    mutationFn: () => updateUserStatus(user.id, !user.is_active),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users })
      onNotice({ variant: "default", text: res.message ?? (user.is_active ? "帳號已停用" : "帳號已啟用") })
    },
    onError: (e) => onNotice({ variant: "destructive", text: errorText(e, "操作失敗，請稍後再試") }),
  })

  const clearMutation = useMutation({
    mutationFn: () => clearUserPassword(user.id),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users })
      setDialog(null)
      onNotice({ variant: "default", text: res.message ?? "密碼已清除" })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser(user.id),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users })
      setDialog(null)
      onNotice({ variant: "default", text: res.message ?? "使用者已永久刪除" })
    },
  })

  // 選單項目點下去要開對話框：先擋掉 Radix 預設的「關選單並把焦點送回觸發鈕」，
  // 自己關選單再開對話框，避免關閉動畫與對話框搶焦點。
  function selectDialog(kind: Exclude<RowDialog, null>) {
    return (e: Event) => {
      e.preventDefault()
      setMenuOpen(false)
      setDialog(kind)
    }
  }

  const deactivateBlocked = isSelf && user.is_active
  const name = user.display_name || user.username

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            動作
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={selectDialog("edit")}>編輯</DropdownMenuItem>
          <DropdownMenuItem
            disabled={deactivateBlocked || statusMutation.isPending}
            onSelect={(e) => {
              e.preventDefault()
              setMenuOpen(false)
              statusMutation.mutate()
            }}
          >
            {user.is_active ? `停用${deactivateBlocked ? `（${SELF_BLOCK.deactivate}）` : ""}` : "啟用"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={selectDialog("reset")}>重設密碼</DropdownMenuItem>
          <DropdownMenuItem disabled={isSelf} onSelect={selectDialog("clear")}>
            清除密碼{isSelf ? `（${SELF_BLOCK.clearPassword}）` : ""}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isSelf} onSelect={selectDialog("delete")}>
            刪除{isSelf ? `（${SELF_BLOCK.delete}）` : ""}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditUserDialog
        user={user}
        isSelf={isSelf}
        open={dialog === "edit"}
        onOpenChange={(v) => setDialog(v ? "edit" : null)}
        onDone={onNotice}
      />
      <ResetPasswordDialog
        user={user}
        open={dialog === "reset"}
        onOpenChange={(v) => setDialog(v ? "reset" : null)}
        onDone={onNotice}
      />
      <ConfirmDialog
        open={dialog === "clear"}
        onOpenChange={(v) => {
          setDialog(v ? "clear" : null)
          if (!v) clearMutation.reset()
        }}
        title={`清除 ${name} 的密碼？`}
        description="清除後這個帳號改走 NAS 認證登入；NAS 認證沒有啟用時後端會擋下來。"
        actionLabel="清除密碼"
        pending={clearMutation.isPending}
        error={clearMutation.isError ? clearMutation.error : null}
        onConfirm={() => clearMutation.mutate()}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(v) => {
          setDialog(v ? "delete" : null)
          if (!v) deleteMutation.reset()
        }}
        title={`刪除 ${name}？`}
        description="這是永久刪除，無法復原。只是要暫時擋住登入的話，改用停用。"
        actionLabel="刪除"
        pending={deleteMutation.isPending}
        error={deleteMutation.isError ? deleteMutation.error : null}
        onConfirm={() => deleteMutation.mutate()}
      />
    </>
  )
}

export default function AdminUsersPage() {
  const { pathname } = useLocation()
  const { user: me } = useAuth()
  const usersQuery = useQuery({ queryKey: adminKeys.users, queryFn: listUsers })
  const defaultsQuery = useQuery({ queryKey: adminKeys.defaultPermissions, queryFn: getDefaultPermissions })
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [notice, setNotice] = React.useState<Notice | null>(null)

  const users = usersQuery.data?.users ?? []
  const selectedUser = users.find((u) => u.id === selectedId) ?? null
  const appNames = defaultsQuery.data?.app_names ?? {}

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sr-only">{titleForPath(pathname)}</h1>
        <p className="text-sm text-muted-foreground">{usersQuery.isLoading ? "" : `共 ${users.length} 位使用者`}</p>
        <CreateUserDialog onCreated={setNotice} />
      </div>

      {notice && (
        <Alert variant={notice.variant} role="status">
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}

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
        <div className="overflow-x-auto rounded-xl border">
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
                <TableRow key={u.id} className={u.is_active ? undefined : "opacity-60"}>
                  <TableCell>{u.username}</TableCell>
                  <TableCell>{u.display_name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="tint">{u.is_admin ? "管理員" : "使用者"}</Badge>
                  </TableCell>
                  <TableCell>{u.is_active ? "啟用" : "停用"}</TableCell>
                  <TableCell>{u.has_password ? "已設定" : "NAS"}</TableCell>
                  <TableCell>{formatDateTime(u.last_login_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedId(u.id)}>
                        權限
                      </Button>
                      <UserRowActions user={u} isSelf={me?.id === u.id} onNotice={setNotice} />
                    </div>
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
