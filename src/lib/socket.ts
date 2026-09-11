import { io, type Socket } from "socket.io-client"
import { API_BASE } from "./api"
import { clearSession, getToken, SESSION_CLEARED_EVENT } from "./token"

/**
 * Socket.IO 客戶端（AI 助手用）。
 *
 * 後端把 Socket.IO 掛在 FastAPI 前面（`socketio.ASGIApp(sio, app)`），所以路徑是
 * 後端 base URL 底下的 `/socket.io/`：正式機 base 是 `https://ching-tech.ddns.net/ctos`，
 * 連線就要 `io("https://ching-tech.ddns.net", { path: "/ctos/socket.io/" })`。
 *
 * 握手一律帶 `auth: { token }`（後端 `services/socket_auth.py` 只認 `auth.token`，
 * 不接受 query string）。token 失效時後端 raise ConnectionRefusedError("unauthorized")，
 * client 收到 `connect_error`，這裡直接走既有的 `clearSession()`。
 */

/** 頁面會用到的事件；真 socket 只轉發這幾個，其他一律不理。 */
const FORWARDED_EVENTS = [
  "connect",
  "disconnect",
  "connect_error",
  "reconnect_attempt",
  "ai_typing",
  "ai_response",
  "ai_error",
  "compress_started",
  "compress_complete",
  "compress_error",
] as const

export type SocketEvent = (typeof FORWARDED_EVENTS)[number]

export interface ChatSocket {
  /** 送事件給後端。 */
  emit(event: string, payload: unknown): void
  /** 註冊事件處理，回傳取消註冊的函式。 */
  on(event: SocketEvent, handler: (payload: unknown) => void): () => void
  /** 目前是否已連上。 */
  isConnected(): boolean
  /** 關閉連線並清掉所有處理函式。 */
  close(): void
}

type Handler = (payload: unknown) => void

/** 事件分發：真假 socket 共用，讓頁面兩邊看到的介面一模一樣。 */
function createEmitter() {
  const handlers = new Map<string, Set<Handler>>()
  return {
    on(event: string, handler: Handler): () => void {
      const set = handlers.get(event) ?? new Set<Handler>()
      set.add(handler)
      handlers.set(event, set)
      return () => set.delete(handler)
    },
    dispatch(event: string, payload: unknown) {
      for (const h of [...(handlers.get(event) ?? [])]) h(payload)
    },
    clear() {
      handlers.clear()
    },
  }
}

/** 從 API base 拆出 socket 要連的 origin 與 path（base 可能帶 `/ctos` 這種前綴）。 */
export function socketTarget(apiBase: string): { origin: string; path: string } {
  const url = new URL(apiBase, typeof window === "undefined" ? "http://localhost" : window.location.href)
  const prefix = url.pathname.replace(/\/$/, "")
  return { origin: url.origin, path: `${prefix}/socket.io/` }
}

function createRealSocket(): ChatSocket {
  const emitter = createEmitter()
  const { origin, path } = socketTarget(API_BASE)
  const socket: Socket = io(origin, {
    path,
    // callback 形式：socket.io 每次（重）連線都會再呼叫一次，拿到的是當下的 token，
    // 不是建立連線那一刻的。物件形式在重連時會沿用舊 token。
    auth: (cb: (data: object) => void) => cb({ token: getToken() ?? "" }),
  })

  for (const event of FORWARDED_EVENTS) {
    if (event === "reconnect_attempt") continue
    socket.on(event, (payload: unknown) => emitter.dispatch(event, payload))
  }
  // 重連嘗試是 manager 的事件，不是 socket 的；轉進來讓頁面能顯示「重連中」。
  socket.io.on("reconnect_attempt", () => emitter.dispatch("reconnect_attempt", undefined))

  socket.on("connect_error", (err: Error) => {
    // 後端拒絕握手時 message 就是 "unauthorized"，代表 token 已經不能用了。
    if (err?.message === "unauthorized") {
      socket.close()
      clearSession()
    }
  })

  return {
    emit: (event, payload) => socket.emit(event, payload),
    on: (event, handler) => emitter.on(event, handler),
    isConnected: () => socket.connected,
    close: () => {
      socket.close()
      emitter.clear()
    },
  }
}

/**
 * e2e 用的假 socket：不連任何東西，把送出的事件記到 `window.__sentEvents`，
 * 並開 `window.__CTOS_SOCKET_MOCK__.receive(event, payload)` 讓測試模擬後端推事件。
 * 只有 `npm run build:e2e`（VITE_E2E=1）會走到這裡，正式 build 這段會被 tree-shake 掉。
 */
function createMockSocket(): ChatSocket {
  const emitter = createEmitter()
  let connected = false
  const w = window as unknown as {
    __sentEvents?: { event: string; payload: unknown }[]
    __CTOS_SOCKET_MOCK__?: { token: string | null; receive: (event: string, payload: unknown) => void }
  }
  w.__sentEvents = []
  w.__CTOS_SOCKET_MOCK__ = {
    token: getToken(),
    receive(event, payload) {
      if (event === "connect") connected = true
      if (event === "disconnect" || event === "connect_error") connected = false
      emitter.dispatch(event, payload)
    },
  }

  // 下一個 tick 才「連上」，讓頁面先掛好處理函式。
  setTimeout(() => {
    connected = true
    emitter.dispatch("connect", undefined)
  }, 0)

  return {
    emit: (event, payload) => w.__sentEvents?.push({ event, payload }),
    on: (event, handler) => emitter.on(event, handler),
    isConnected: () => connected,
    close: () => {
      connected = false
      emitter.clear()
      delete w.__CTOS_SOCKET_MOCK__
    },
  }
}

let instance: ChatSocket | null = null
let sessionListenerBound = false

/** 取得單例 socket；第一次呼叫才真的連線。 */
export function getSocket(): ChatSocket {
  if (!sessionListenerBound && typeof window !== "undefined") {
    // session 被清掉（401、登出）時把連線收掉，不要留一條帶著失效 token 的連線。
    window.addEventListener(SESSION_CLEARED_EVENT, () => closeSocket())
    sessionListenerBound = true
  }
  if (instance) return instance
  instance = import.meta.env.VITE_E2E ? createMockSocket() : createRealSocket()
  return instance
}

/** 關掉單例 socket（離開 AI 助手頁、或 session 被清掉時呼叫）。 */
export function closeSocket() {
  instance?.close()
  instance = null
}
