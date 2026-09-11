/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { fetchMe, logout } from "./auth"
import { getCachedUser, getToken, setCachedUser } from "./token"
import type { UserInfo } from "./types"

interface AuthState {
  user: UserInfo | null
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = React.createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<UserInfo | null>(() => (getToken() ? getCachedUser() : null))
  const [loading, setLoading] = React.useState<boolean>(() => Boolean(getToken()))

  // 用 .then/.catch/.finally 串接而非 async/await + try/catch：
  // react-hooks/set-state-in-effect 的靜態分析不會追蹤 await 之後才落地的
  // setState，只要函式本體（含 catch）掛著 setState 呼叫就會判定為「在 effect
  // 內同步 setState」而誤判；改成 Promise chaining 能讓它正確辨識為非同步回呼。
  const load = React.useCallback(() => {
    return fetchMe()
      .then((me) => {
        setCachedUser(me)
        setUser(me)
      })
      .catch(() => {
        setUser(null)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const refresh = React.useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return }
    setLoading(true)
    await load()
  }, [load])

  const signOut = React.useCallback(async () => {
    await logout()
    setUser(null)
  }, [])

  React.useEffect(() => {
    if (getToken()) void load()
  }, [load])

  return <AuthContext.Provider value={{ user, loading, refresh, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth 必須在 AuthProvider 內使用")
  return ctx
}
