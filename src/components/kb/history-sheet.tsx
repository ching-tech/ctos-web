import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { Markdown } from "@/components/kb/markdown"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { getHistory, getVersion, kbKeys } from "@/lib/kb"

export function HistorySheet({
  id,
  open,
  onOpenChange,
}: {
  id: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [commit, setCommit] = React.useState<string | null>(null)

  const historyQuery = useQuery({ queryKey: kbKeys.history(id), queryFn: () => getHistory(id), enabled: open })
  const versionQuery = useQuery({
    queryKey: ["kb", "version", id, commit],
    queryFn: () => getVersion(id, commit!),
    enabled: open && commit !== null,
  })

  function handleOpenChange(next: boolean) {
    if (!next) setCommit(null)
    onOpenChange(next)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>版本歷史</SheetTitle>
        </SheetHeader>

        <div className="min-w-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          {commit === null ? (
            <>
              {historyQuery.isLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              )}
              {historyQuery.isError && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>
                    {historyQuery.error instanceof ApiError ? historyQuery.error.detail : "載入版本紀錄失敗，請稍後再試"}
                  </AlertDescription>
                </Alert>
              )}
              {historyQuery.data && historyQuery.data.entries.length === 0 && (
                <p className="text-sm text-muted-foreground">尚無版本紀錄</p>
              )}
              {historyQuery.data && historyQuery.data.entries.length > 0 && (
                <ul className="space-y-2">
                  {historyQuery.data.entries.map((entry) => (
                    <li key={entry.commit}>
                      <button
                        type="button"
                        onClick={() => setCommit(entry.commit)}
                        className="w-full rounded-lg border p-2 text-left text-sm hover:bg-muted"
                      >
                        {entry.date}・{entry.author}・{entry.message}・{entry.commit.slice(0, 7)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setCommit(null)}>
                回到清單
              </Button>
              {versionQuery.isLoading && <Skeleton className="h-48 w-full" />}
              {versionQuery.isError && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>
                    {versionQuery.error instanceof ApiError ? versionQuery.error.detail : "載入版本內容失敗，請稍後再試"}
                  </AlertDescription>
                </Alert>
              )}
              {versionQuery.data && <Markdown content={versionQuery.data.content} />}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
