import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PanelLeft, Send } from "lucide-react"
import * as React from "react"
import { useSearchParams } from "react-router"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { listAgents } from "@/lib/ai-log"
import { ApiError } from "@/lib/api"
import {
  assistantKeys,
  createChat,
  deleteChat,
  DEFAULT_AGENT,
  DEFAULT_MODEL,
  getChat,
  isForChat,
  listChats,
  toolCallsOf,
  updateChat,
  visibleMessages,
  type AiErrorPayload,
  type AiResponsePayload,
  type AiTypingPayload,
  type Chat,
  type ChatDetail,
  type ChatMessage,
  type CompressCompletePayload,
} from "@/lib/assistant"
import { closeSocket, getSocket, type ChatSocket } from "@/lib/socket"
import { cn } from "@/lib/utils"
import { ChatList } from "./chat-list"
import { MessageList } from "./message-list"

type ConnectionStatus = "connecting" | "connected" | "disconnected"

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "重連中",
  connected: "已連線",
  disconnected: "已斷線",
}

const STATUS_DOT: Record<ConnectionStatus, string> = {
  connecting: "bg-amber-500",
  connected: "bg-emerald-500",
  disconnected: "bg-destructive",
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

export default function AssistantPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeId = searchParams.get("chat")

  // `?q=` 是別的頁面「問 AI」帶過來的，只在第一次渲染讀一次，之後由 effect 把它從網址拿掉。
  const [draft, setDraft] = React.useState(() => searchParams.get("q") ?? "")
  const [status, setStatus] = React.useState<ConnectionStatus>("connecting")
  const [typing, setTyping] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [compressing, setCompressing] = React.useState(false)
  const [listOpen, setListOpen] = React.useState(false)
  const [renaming, setRenaming] = React.useState<Chat | null>(null)
  const [renameDraft, setRenameDraft] = React.useState("")
  const [deleting, setDeleting] = React.useState<Chat | null>(null)

  const socketRef = React.useRef<ChatSocket | null>(null)
  // socket 的處理函式只掛一次，要看得到最新的 activeId，用 ref 帶過去。
  const activeIdRef = React.useRef<string | null>(activeId)
  React.useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  // 換對話時把上一串的暫時狀態清掉（React 官方「props 變了就在 render 期間調整 state」的寫法）。
  const [stateForChat, setStateForChat] = React.useState<string | null>(activeId)
  if (stateForChat !== activeId) {
    setStateForChat(activeId)
    setTyping(false)
    setError(null)
    setCompressing(false)
  }

  const chatsQuery = useQuery({ queryKey: assistantKeys.chats, queryFn: listChats })
  const agentsQuery = useQuery({ queryKey: assistantKeys.agents, queryFn: listAgents })
  const chatQuery = useQuery({
    queryKey: assistantKeys.chat(activeId ?? ""),
    queryFn: () => getChat(activeId!),
    enabled: !!activeId,
    retry: false,
  })

  const chats = React.useMemo(() => chatsQuery.data ?? [], [chatsQuery.data])
  const activeChat = chatQuery.data ?? null
  const agents = agentsQuery.data?.items ?? []

  function appendMessage(chatId: string, message: ChatMessage) {
    queryClient.setQueryData<ChatDetail>(assistantKeys.chat(chatId), (old) =>
      old ? { ...old, messages: [...old.messages, message] } : old,
    )
  }

  // 只在這頁掛 socket：其他頁不連線，也不會因為這頁的事件被吵到。
  React.useEffect(() => {
    const socket = getSocket()
    socketRef.current = socket
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 把外部系統（socket）當下的連線狀態同步進來
    setStatus(socket.isConnected() ? "connected" : "connecting")

    const offs = [
      socket.on("connect", () => setStatus("connected")),
      socket.on("reconnect_attempt", () => setStatus("connecting")),
      socket.on("disconnect", () => {
        setStatus("disconnected")
        setTyping(false)
      }),
      socket.on("ai_typing", (payload) => {
        const data = payload as AiTypingPayload
        if (!isForChat(data, activeIdRef.current)) return
        setTyping(data.typing === true)
      }),
      socket.on("ai_response", (payload) => {
        const data = payload as AiResponsePayload
        const chatId = activeIdRef.current
        if (!isForChat(data, chatId)) return
        setTyping(false)
        appendMessage(chatId!, {
          role: "assistant",
          content: data.message ?? "",
          timestamp: nowSeconds(),
          tool_calls: toolCallsOf(data),
        })
        // 後端會在第一則訊息後自動改標題，也會更新 updated_at，清單要重抓。
        queryClient.invalidateQueries({ queryKey: assistantKeys.chats })
      }),
      socket.on("ai_error", (payload) => {
        const data = payload as AiErrorPayload
        if (!isForChat(data, activeIdRef.current)) return
        setTyping(false)
        setError(data.error || "AI 回覆失敗，請稍後再試")
      }),
      socket.on("compress_started", () => setCompressing(true)),
      socket.on("compress_complete", (payload) => {
        const data = payload as CompressCompletePayload
        setCompressing(false)
        const chatId = activeIdRef.current
        if (!isForChat(data, chatId) || !data.messages) return
        queryClient.setQueryData<ChatDetail>(assistantKeys.chat(chatId!), (old) =>
          old ? { ...old, messages: data.messages! } : old,
        )
      }),
      socket.on("compress_error", (payload) => {
        const data = payload as AiErrorPayload
        setCompressing(false)
        if (!isForChat(data, activeIdRef.current)) return
        setError(data.error || "壓縮失敗")
      }),
    ]

    return () => {
      for (const off of offs) off()
      socketRef.current = null
      closeSocket()
    }
    // queryClient 是穩定的，這個 effect 只跑一次（進頁面連線、離開頁面斷線）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient])

  // 網址正規化，兩件事一次做完（分成兩個 effect 會互相蓋掉對方寫的參數）：
  // 沒指定 chat 就開最近一筆（清單已照 updated_at DESC 排好）；`?q=` 預填進輸入框後就拿掉。
  React.useEffect(() => {
    const next = new URLSearchParams(searchParams)
    let changed = false
    if (next.has("q")) {
      next.delete("q")
      changed = true
    }
    if (!next.get("chat") && chats.length > 0) {
      next.set("chat", chats[0].id)
      changed = true
    }
    if (changed) setSearchParams(next, { replace: true })
  }, [chats, searchParams, setSearchParams])

  function selectChat(id: string) {
    const next = new URLSearchParams(searchParams)
    next.set("chat", id)
    setSearchParams(next, { replace: true })
    setListOpen(false)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createChat({
        title: "新對話",
        model: DEFAULT_MODEL,
        prompt_name: activeChat?.prompt_name || agents[0]?.name || DEFAULT_AGENT,
      }),
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatDetail>(assistantKeys.chat(chat.id), chat)
      queryClient.invalidateQueries({ queryKey: assistantKeys.chats })
      selectChat(chat.id)
    },
    onError: (e) => setError(e instanceof ApiError ? e.detail : "建立對話失敗"),
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => updateChat(id, { title }),
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatDetail>(assistantKeys.chat(chat.id), chat)
      queryClient.invalidateQueries({ queryKey: assistantKeys.chats })
      setRenaming(null)
    },
    onError: (e) => setError(e instanceof ApiError ? e.detail : "改標題失敗"),
  })

  const agentMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateChat(id, { prompt_name: name }),
    onSuccess: (chat) => {
      queryClient.setQueryData<ChatDetail>(assistantKeys.chat(chat.id), (old) =>
        old ? { ...old, prompt_name: chat.prompt_name } : chat,
      )
      queryClient.invalidateQueries({ queryKey: assistantKeys.chats })
    },
    onError: (e) => setError(e instanceof ApiError ? e.detail : "換 Agent 失敗"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteChat(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: assistantKeys.chat(id) })
      queryClient.invalidateQueries({ queryKey: assistantKeys.chats })
      setDeleting(null)
      if (id === activeId) {
        const next = new URLSearchParams(searchParams)
        next.delete("chat")
        setSearchParams(next, { replace: true })
      }
    },
    onError: (e) => setError(e instanceof ApiError ? e.detail : "刪除對話失敗"),
  })

  const connected = status === "connected"
  const canSend = connected && !typing

  function send() {
    const text = draft.trim()
    if (!text || !activeId || !canSend) return
    socketRef.current?.emit("ai_chat_event", {
      chatId: activeId,
      message: text,
      model: activeChat?.model || DEFAULT_MODEL,
    })
    appendMessage(activeId, { role: "user", content: text, timestamp: nowSeconds() })
    setDraft("")
    setError(null)
  }

  function compress() {
    if (!activeId || !connected) return
    setError(null)
    socketRef.current?.emit("compress_chat", { chatId: activeId })
  }

  const messages = visibleMessages(activeChat?.messages ?? [])
  const chatMissing = chatQuery.isError && chatQuery.error instanceof ApiError && chatQuery.error.status === 404
  const currentAgent = activeChat?.prompt_name ?? ""
  const agentUnknown = currentAgent !== "" && !agents.some((a) => a.name === currentAgent)

  const list = (
    <ChatList
      chats={chats}
      activeId={activeId}
      loading={chatsQuery.isLoading}
      creating={createMutation.isPending}
      onSelect={selectChat}
      onCreate={() => createMutation.mutate()}
      onRename={(chat) => {
        setRenaming(chat)
        setRenameDraft(chat.title)
        setListOpen(false)
      }}
      onDelete={(chat) => {
        setDeleting(chat)
        setListOpen(false)
      }}
    />
  )

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col gap-3 md:h-[calc(100dvh-8rem)] md:flex-row">
      <aside className="hidden w-64 shrink-0 md:block">{list}</aside>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="left" className="w-80 p-4">
          <SheetHeader className="px-0">
            <SheetTitle>對話</SheetTitle>
          </SheetHeader>
          {list}
        </SheetContent>
      </Sheet>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="md:hidden" onClick={() => setListOpen(true)}>
            <PanelLeft />
            對話清單
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{activeChat?.title ?? "AI 助手"}</h1>
          <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status])} aria-hidden="true" />
          <span role="status" aria-label="連線狀態" className="text-xs text-muted-foreground">
            {STATUS_LABEL[status]}
          </span>
        </div>

        {!connected && (
          <p className="text-xs text-muted-foreground">
            {status === "disconnected" ? "連線已中斷，請重新整理頁面。" : "正在連線，稍等一下。"}
          </p>
        )}

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {chatMissing ? (
          <p className="flex-1 py-8 text-center text-sm text-muted-foreground">這個對話不存在，換一個或開新對話。</p>
        ) : !activeId ? (
          <p className="flex-1 py-8 text-center text-sm text-muted-foreground">選一個對話，或開一個新對話。</p>
        ) : (
          <MessageList messages={messages} typing={typing} />
        )}

        <form
          className="space-y-2 border-t pt-2"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <Textarea
            aria-label="訊息"
            placeholder="問點什麼（Enter 送出、Shift+Enter 換行）"
            rows={3}
            value={draft}
            disabled={!connected || !activeId}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={currentAgent}
              disabled={!activeId || agentsQuery.isLoading}
              onValueChange={(name) => activeId && agentMutation.mutate({ id: activeId, name })}
            >
              <SelectTrigger className="w-40" aria-label="Agent">
                <SelectValue placeholder="選 Agent" />
              </SelectTrigger>
              <SelectContent>
                {agentUnknown && <SelectItem value={currentAgent}>{currentAgent}</SelectItem>}
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.name}>
                    {a.display_name || a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={compress} disabled={!activeId || !connected || compressing}>
              {compressing ? "壓縮中…" : "壓縮"}
            </Button>
            <div className="flex-1" />
            <Button type="submit" disabled={!canSend || !activeId}>
              <Send />
              送出
            </Button>
          </div>
        </form>
      </section>

      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重新命名對話</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="assistant-rename">標題</Label>
            <Input
              id="assistant-rename"
              aria-label="標題"
              value={renameDraft}
              maxLength={100}
              onChange={(e) => setRenameDraft(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              取消
            </Button>
            <Button
              disabled={renameDraft.trim() === "" || renameMutation.isPending}
              onClick={() => renaming && renameMutation.mutate({ id: renaming.id, title: renameDraft.trim() })}
            >
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除這個對話？</AlertDialogTitle>
            <AlertDialogDescription>「{deleting?.title}」的訊息會一起刪掉，無法復原。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && deleteMutation.mutate(deleting.id)}>確定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
