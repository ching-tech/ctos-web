import { useQuery, useQueryClient } from "@tanstack/react-query"
import { File as FileIcon, Folder } from "lucide-react"
import * as React from "react"
import { useLocation, useSearchParams } from "react-router"
import { ConnectDialog } from "@/components/files/connect-dialog"
import { PreviewPanel } from "@/components/files/preview-panel"
import { FileRowActions } from "@/components/files/row-actions"
import { FilesToolbar } from "@/components/files/toolbar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { titleForPath } from "@/lib/nav"
import { canAccessApp } from "@/lib/permissions"
import {
  breadcrumbs,
  browseNas,
  disconnectNas,
  formatModified,
  formatSize,
  getNasConnection,
  isRoot,
  joinPath,
  listNasConnections,
  listShares,
  nasKeys,
  normalizePath,
  searchNas,
  searchResultPath,
  setNasConnection,
  setNasReconnectHandler,
  sortItems,
  toShareResourceId,
  usableConnection,
  useNasConnection,
  type NasConnection,
  type NasItemType,
} from "@/lib/nas"

/** 清單與搜尋結果共用的列模型。 */
interface Row {
  name: string
  type: NasItemType
  path: string
  size: number | null
  modified: string | null
}

function RowIcon({ type }: { type: NasItemType }) {
  const Icon = type === "directory" ? Folder : FileIcon
  return <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
}

export default function FilesPage() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const conn = useNasConnection()
  const [searchParams, setSearchParams] = useSearchParams()
  const path = normalizePath(searchParams.get("path"))
  const q = searchParams.get("q") ?? ""
  const atRoot = isRoot(path)
  const searching = q.length > 0 && !atRoot

  const [draftQ, setDraftQ] = React.useState(q)
  const [syncedQ, setSyncedQ] = React.useState(q)
  const [preview, setPreview] = React.useState<{ path: string; name: string } | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  // 一整排等著被喚醒的請求：過期那一刻可能同時有清單、預覽、下載在跑，只留一個位子會把
  // 先到的那支永遠掛在那裡。（fetch 包裝層已經把同一波合併成一次呼叫，這裡是第二道保險。）
  const pendingReconnects = React.useRef<((conn: NasConnection | null) => void)[]>([])

  // 網址上的 q 被外部改變時（重新整理、上一頁）同步回搜尋框草稿值。
  if (q !== syncedQ) {
    setSyncedQ(q)
    setDraftQ(q)
  }

  /** 把等著的請求全部叫醒；回傳有沒有人在等。 */
  function settleReconnects(next: NasConnection | null): boolean {
    const waiting = pendingReconnects.current
    pendingReconnects.current = []
    for (const resolve of waiting) resolve(next)
    return waiting.length > 0
  }

  // fetch 包裝層攔到「缺連線／連線過期」時，開連線對話框並等使用者連好，連好才重試原請求。
  React.useEffect(() => {
    setNasReconnectHandler(
      () =>
        new Promise<NasConnection | null>((resolve) => {
          pendingReconnects.current.push(resolve)
          setDialogOpen(true)
        }),
    )
    return () => {
      setNasReconnectHandler(null)
      // 離開頁面時把還等著的請求收掉，不要讓它們永遠掛著。
      const waiting = pendingReconnects.current
      pendingReconnects.current = []
      for (const resolve of waiting) resolve(null)
    }
  }, [])

  function updateParams(next: { path?: string; q?: string }) {
    const params = new URLSearchParams(searchParams)
    if (next.path !== undefined) {
      if (isRoot(next.path)) params.delete("path")
      else params.set("path", next.path)
    }
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q)
      else params.delete("q")
    }
    setSearchParams(params, { replace: false })
  }

  function goTo(nextPath: string) {
    setPreview(null)
    setDraftQ("")
    setSyncedQ("")
    updateParams({ path: nextPath, q: "" })
  }

  // 進頁面先看有沒有現成連線，有就沿用第一筆（不用每次重輸密碼）。
  const connectionsQuery = useQuery({
    queryKey: nasKeys.connections,
    queryFn: listNasConnections,
    enabled: !conn,
    retry: false,
  })

  React.useEffect(() => {
    if (!connectionsQuery.data || getNasConnection()) return
    // 後端不會清掉過期的連線，拿第一筆還沒到期的才有意義。
    const usable = usableConnection(connectionsQuery.data)
    if (usable) setNasConnection({ token: usable.token, host: usable.host, username: usable.username })
  }, [connectionsQuery.data])

  const listQuery = useQuery({
    queryKey: nasKeys.list(path),
    queryFn: async (): Promise<Row[]> => {
      // 根目錄用 /api/nas/shares：browse 不接受空路徑（api/nas.py 的 `_parse_path` 回 400）。
      if (atRoot) {
        const shares = await listShares()
        return shares.map((s) => ({ name: s.name, type: "directory" as const, path: `/${s.name}`, size: null, modified: null }))
      }
      const data = await browseNas(path)
      return sortItems(data.items).map((i) => ({
        name: i.name,
        type: i.type,
        path: joinPath(path, i.name),
        size: i.size,
        modified: i.modified,
      }))
    },
    enabled: !!conn && !searching,
    retry: false,
  })

  const searchQuery = useQuery({
    queryKey: nasKeys.search(path, q),
    queryFn: async (): Promise<Row[]> => {
      const data = await searchNas(path, q)
      return data.results.map((r) => ({
        name: r.name,
        type: r.type,
        path: searchResultPath(path, r.path),
        size: null,
        modified: null,
      }))
    },
    enabled: !!conn && searching,
    retry: false,
  })

  const active = searching ? searchQuery : listQuery
  const rows = active.data ?? []

  function handleConnected(next: NasConnection) {
    setNasConnection(next)
    setDialogOpen(false)
    // 自動重連：等著的請求會各自重試，不必再 invalidate（否則同一份清單會抓兩次）。
    if (settleReconnects(next)) return
    queryClient.invalidateQueries({ queryKey: nasKeys.all })
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open)
    if (!open) settleReconnects(null)
  }

  async function handleDisconnect() {
    try {
      await disconnectNas()
    } catch { /* 連線本來就壞了也照樣把前端狀態清掉 */ }
    setNasConnection(null)
    setPreview(null)
    queryClient.removeQueries({ queryKey: nasKeys.all })
  }

  function runSearch() {
    setPreview(null)
    updateParams({ q: draftQ })
  }

  function onRowClick(row: Row) {
    if (row.type === "directory") goTo(row.path)
    else setPreview({ path: row.path, name: row.name })
  }

  const crumbs = breadcrumbs(path)
  // 寫入類動作只在瀏覽清單時出現：搜尋結果跨資料夾，改完要重抓的不是同一份清單。
  // 根目錄列的是 share，後端的 `_parse_path` 不接受空路徑，寫不了也刪不了。
  const canWrite = !!conn && !atRoot && !searching
  // 分享連結要 share-manager 權限（後端預設關閉），而且檔案要落在設定好的掛載點底下。
  const canShare = canAccessApp(user, "share-manager")
  const error = active.isError ? (active.error instanceof ApiError ? active.error.detail : "載入失敗，請稍後再試") : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sr-only">{titleForPath(pathname)}</h1>

        <nav aria-label="路徑" className="flex flex-wrap items-center gap-1 text-sm">
          <Button variant="link" size="sm" className="h-auto px-1" onClick={() => goTo("/")}>
            根目錄
          </Button>
          {crumbs.map((c) => (
            <React.Fragment key={c.path}>
              <span className="text-muted-foreground">/</span>
              <Button variant="link" size="sm" className="h-auto px-1 break-all" onClick={() => goTo(c.path)}>
                {c.name}
              </Button>
            </React.Fragment>
          ))}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          {conn ? (
            <>
              <span className="text-sm text-muted-foreground">
                {conn.host}／{conn.username}
              </span>
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                重新連線
              </Button>
              <Button variant="outline" size="sm" onClick={handleDisconnect}>
                中斷
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              連線 NAS
            </Button>
          )}
        </div>
      </div>

      {conn && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="搜尋"
            placeholder={atRoot ? "進到共享資料夾後才能搜尋" : "在目前資料夾搜尋"}
            className="min-w-48 flex-1"
            disabled={atRoot}
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch()
            }}
          />
          <Button variant="outline" size="sm" disabled={atRoot || !draftQ} onClick={runSearch}>
            搜尋
          </Button>
          {searching && (
            <Button variant="ghost" size="sm" onClick={() => { setDraftQ(""); setSyncedQ(""); updateParams({ q: "" }) }}>
              清除搜尋
            </Button>
          )}
        </div>
      )}

      {canWrite && <FilesToolbar path={path} />}

      {searching && !active.isPending && !error && (
        <p className="text-sm text-muted-foreground">在 {path} 底下搜尋「{q}」，共 {rows.length} 筆</p>
      )}

      {!conn ? (
        connectionsQuery.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <div className="space-y-3 rounded-lg border p-6 text-center">
            <p className="text-muted-foreground">尚未連線 NAS</p>
            <Button onClick={() => setDialogOpen(true)}>連線 NAS</Button>
          </div>
        )
      ) : error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : active.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">{searching ? "沒有符合的檔案" : "這個資料夾是空的"}</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  {searching ? <TableHead>路徑</TableHead> : null}
                  <TableHead>大小</TableHead>
                  <TableHead>修改時間</TableHead>
                  {canWrite ? <TableHead>動作</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.path}>
                    <TableCell>
                      <button
                        type="button"
                        className="flex items-center gap-2 text-left text-primary underline-offset-4 hover:underline"
                        onClick={() => onRowClick(row)}
                      >
                        <RowIcon type={row.type} />
                        <span className="break-all">{row.name}</span>
                      </button>
                    </TableCell>
                    {searching ? <TableCell className="text-muted-foreground break-all">{row.path}</TableCell> : null}
                    <TableCell>{row.type === "directory" ? "—" : formatSize(row.size)}</TableCell>
                    <TableCell>{formatModified(row.modified)}</TableCell>
                    {canWrite ? (
                      <TableCell>
                        <FileRowActions
                          path={row.path}
                          name={row.name}
                          type={row.type}
                          listPath={path}
                          shareResourceId={canShare && row.type === "file" ? toShareResourceId(row.path) : null}
                          onDeleted={() => setPreview((p) => (p?.path === row.path ? null : p))}
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {rows.map((row) => (
              <li key={row.path} className="space-y-2 rounded-lg border p-4">
                <button
                  type="button"
                  className="flex items-center gap-2 text-left font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => onRowClick(row)}
                >
                  <RowIcon type={row.type} />
                  <span className="break-all">{row.name}</span>
                </button>
                <dl className="space-y-1 text-sm">
                  {searching && (
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">路徑</dt>
                      <dd className="break-all">{row.path}</dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">大小</dt>
                    <dd>{row.type === "directory" ? "—" : formatSize(row.size)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">修改時間</dt>
                    <dd>{formatModified(row.modified)}</dd>
                  </div>
                </dl>
                {canWrite && (
                  <FileRowActions
                    path={row.path}
                    name={row.name}
                    type={row.type}
                    listPath={path}
                    shareResourceId={canShare && row.type === "file" ? toShareResourceId(row.path) : null}
                    onDeleted={() => setPreview((p) => (p?.path === row.path ? null : p))}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {preview && <PreviewPanel path={preview.path} name={preview.name} onClose={() => setPreview(null)} />}

      {/* key 跟著連線走：重新開對話框時才會用目前連線的 host／帳號當預設值。 */}
      <ConnectDialog
        key={conn?.token ?? "none"}
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        onConnected={handleConnected}
        host={conn?.host}
        username={conn?.username ?? user?.nas_username ?? user?.username}
      />
    </div>
  )
}
