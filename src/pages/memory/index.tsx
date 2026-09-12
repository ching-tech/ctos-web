import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PanelLeft, Plus } from "lucide-react"
import * as React from "react"
import { useLocation, useSearchParams } from "react-router"
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
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import { botKeys, listGroups, listUsersWithBinding, type ListFilter } from "@/lib/bot"
import {
  createMemory,
  deleteMemory,
  listMemories,
  memoryKeys,
  MEMORY_TITLE_MAX,
  updateMemory,
  type Memory,
  type MemoryTargetKind,
} from "@/lib/memory"
import { titleForPath } from "@/lib/nav"
import { MemoryList } from "./memory-list"
import { TargetList, type MemoryTarget } from "./target-list"

/** 兩個分頁對到後端兩組端點：群組記憶掛在 `bot_groups.id`、個人記憶掛在 `bot_users.id`。 */
const TAB_VALUES = ["group", "user"] as const satisfies readonly MemoryTargetKind[]

const TAB_LABEL: Record<MemoryTargetKind, string> = { group: "群組", user: "個人" }
/** 清單與提示裡講的對象名稱（分頁叫「個人」，但清單列的是使用者）。 */
const TARGET_LABEL: Record<MemoryTargetKind, string> = { group: "群組", user: "使用者" }

/** 群組／使用者清單端點的 `limit` 固定 20（`lib/bot.ts` 的 `offsetQuery`）。 */
const TARGET_PAGE_SIZE = 20

function isTabValue(v: string | null): v is MemoryTargetKind {
  return (TAB_VALUES as readonly string[]).includes(v ?? "")
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.detail : fallback
}

export default function MemoryPage() {
  const { pathname } = useLocation()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const tab: MemoryTargetKind = isTabValue(searchParams.get("tab")) ? (searchParams.get("tab") as MemoryTargetKind) : "group"
  const targetId = searchParams.get("target")

  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState("")
  const [listOpen, setListOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<{ memory: Memory | null } | null>(null)
  const [form, setForm] = React.useState({ title: "", content: "" })
  const [deleting, setDeleting] = React.useState<Memory | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  // 換分頁時把翻頁與搜尋歸零（React 官方「props 變了就在 render 期間調整 state」的寫法）。
  const [stateForTab, setStateForTab] = React.useState<MemoryTargetKind>(tab)
  if (stateForTab !== tab) {
    setStateForTab(tab)
    setPage(1)
    setSearch("")
    setNotice(null)
  }

  const filter: ListFilter = { page }
  const groupsQuery = useQuery({
    queryKey: botKeys.groups(filter),
    queryFn: () => listGroups(filter),
    enabled: tab === "group",
  })
  const usersQuery = useQuery({
    queryKey: botKeys.users(filter),
    queryFn: () => listUsersWithBinding(filter),
    enabled: tab === "user",
  })

  const targetQuery = tab === "group" ? groupsQuery : usersQuery
  const targets: MemoryTarget[] = React.useMemo(() => {
    if (tab === "group") {
      return (groupsQuery.data?.items ?? []).map((g) => ({
        id: g.id,
        name: g.name || "未命名群組",
        platform: g.platform_type,
        meta: g.member_count === null ? "—" : `${g.member_count} 人`,
      }))
    }
    return (usersQuery.data?.items ?? []).map((u) => ({
      id: u.id,
      name: u.display_name || "未知使用者",
      platform: u.platform_type,
      meta: u.bound_display_name || u.bound_username || "未綁定",
    }))
  }, [tab, groupsQuery.data, usersQuery.data])

  const total = targetQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / TARGET_PAGE_SIZE))
  const selected = targets.find((t) => t.id === targetId) ?? null

  const memoriesQuery = useQuery({
    queryKey: memoryKeys.list(tab, targetId ?? ""),
    queryFn: () => listMemories(tab, targetId as string),
    enabled: Boolean(targetId),
  })

  function invalidateMemories() {
    if (targetId) void queryClient.invalidateQueries({ queryKey: memoryKeys.list(tab, targetId) })
  }

  const saveMutation = useMutation({
    mutationFn: (vars: { memory: Memory | null; title: string; content: string }) =>
      vars.memory
        ? updateMemory(vars.memory.id, { title: vars.title, content: vars.content })
        : createMemory(tab, targetId as string, { title: vars.title, content: vars.content }),
    onSuccess: () => {
      invalidateMemories()
      setEditing(null)
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: string; is_active: boolean }) => updateMemory(vars.id, { is_active: vars.is_active }),
    onMutate: () => setNotice(null),
    onSuccess: () => invalidateMemories(),
    onError: (e) => setNotice(errorText(e, "更新失敗，請稍後再試")),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMemory(id),
    onMutate: () => setNotice(null),
    onSuccess: () => invalidateMemories(),
    onError: (e) => setNotice(errorText(e, "刪除失敗，請稍後再試")),
    // 等這一趟請求落地才關對話框，「確定刪除」在送出到收到回應之間必須留在畫面上（照 #29）。
    onSettled: () => setDeleting(null),
  })

  function setTab(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value === "group") next.delete("tab")
    else next.set("tab", value)
    // 對象是掛在分頁底下的，換分頁就不能留著上一個分頁選的 id。
    next.delete("target")
    setSearchParams(next, { replace: true })
  }

  function selectTarget(t: MemoryTarget) {
    const next = new URLSearchParams(searchParams)
    next.set("target", t.id)
    setSearchParams(next, { replace: true })
    setListOpen(false)
    setNotice(null)
  }

  function openCreate() {
    setForm({ title: "", content: "" })
    saveMutation.reset()
    setEditing({ memory: null })
  }

  function openEdit(memory: Memory) {
    setForm({ title: memory.title, content: memory.content })
    saveMutation.reset()
    setEditing({ memory })
  }

  const memories = memoriesQuery.data?.items ?? []

  const list = (
    <TargetList
      label={TARGET_LABEL[tab]}
      items={targets}
      total={total}
      loading={targetQuery.isLoading}
      error={targetQuery.isError ? errorText(targetQuery.error, "清單載入失敗，請稍後再試") : null}
      activeId={targetId}
      query={search}
      onQueryChange={setSearch}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
      onSelect={selectTarget}
    />
  )

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="sr-only">{titleForPath(pathname)}</h1>
        <p className="text-sm text-muted-foreground">
          啟用中的記憶會加進 bot 的系統提示詞，bot 在這個群組或這位使用者的對話裡都讀得到；停用的不會加進去。
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {TAB_VALUES.map((v) => (
            <TabsTrigger key={v} value={v}>
              {TAB_LABEL[v]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-4 md:flex-row">
        <aside className="hidden w-64 shrink-0 md:block">{list}</aside>

        <Sheet open={listOpen} onOpenChange={setListOpen}>
          <SheetContent side="left" className="w-80 p-4">
            <SheetHeader className="px-0">
              <SheetTitle>{TARGET_LABEL[tab]}清單</SheetTitle>
            </SheetHeader>
            {list}
          </SheetContent>
        </Sheet>

        <section className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="md:hidden" onClick={() => setListOpen(true)}>
              <PanelLeft />
              {TARGET_LABEL[tab]}清單
            </Button>
            <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">
              {targetId ? (selected?.name ?? `${TARGET_LABEL[tab]}記憶`) : `${TAB_LABEL[tab]}記憶`}
            </h2>
            {targetId && (
              <Button size="sm" onClick={openCreate}>
                <Plus />
                新增記憶
              </Button>
            )}
          </div>

          {notice && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}

          {!targetId ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              從左邊挑一個{TARGET_LABEL[tab]}，右邊就會列出它的記憶。
            </p>
          ) : memoriesQuery.isError ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{errorText(memoriesQuery.error, "記憶載入失敗，請稍後再試")}</AlertDescription>
            </Alert>
          ) : memoriesQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : memories.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              這個{TARGET_LABEL[tab]}還沒有記憶，用「新增記憶」建第一筆。
            </p>
          ) : (
            <MemoryList
              memories={memories}
              pendingId={toggleMutation.isPending ? (toggleMutation.variables?.id ?? null) : null}
              onToggle={(memory, active) => toggleMutation.mutate({ id: memory.id, is_active: active })}
              onEdit={openEdit}
              onDelete={(memory) => setDeleting(memory)}
            />
          )}
        </section>
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !saveMutation.isPending) setEditing(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.memory ? "編輯記憶" : "新增記憶"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              saveMutation.mutate({ memory: editing?.memory ?? null, title: form.title.trim(), content: form.content })
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="memory-title">標題</Label>
              <Input
                id="memory-title"
                required
                maxLength={MEMORY_TITLE_MAX}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="例如：出貨前先報數量"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="memory-content">內容</Label>
              <Textarea
                id="memory-content"
                required
                rows={6}
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="要 bot 記住的規則，寫成它照著做得到的一句話。"
              />
            </div>

            {saveMutation.isError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{errorText(saveMutation.error, "儲存失敗，請稍後再試")}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>
                儲存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/*
        只有這一個確認對話框，`open` 由 state 控制，內容整塊用 `deleting &&` 包住：關掉時直接從樹上
        拿掉，Radix 的離場動畫就不會留下一層還沒消失的遮罩吃掉下一次點擊（見 PR #29）。
      */}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleting(null)
        }}
      >
        {deleting && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確定刪除「{deleting.title}」？</AlertDialogTitle>
              <AlertDialogDescription>刪掉之後 bot 就不會再讀到這一條，無法復原。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>返回</AlertDialogCancel>
              {/* 用一般的 Button 而不是 AlertDialogAction：Action 按下去的同一刻就關對話框（見 PR #29）。 */}
              <Button disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleting.id)}>
                確定刪除
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  )
}
