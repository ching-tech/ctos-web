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

  const refresh = React.useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return }
    setLoading(true)
    try {
      const me = await fetchMe()
      setCachedUser(me)
      setUser(me)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const signOut = React.useCallback(async () => {
    await logout()
    setUser(null)
  }, [])

  React.useEffect(() => { void refresh() }, [refresh])

  return <AuthContext.Provider value={{ user, loading, refresh, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth 必須在 AuthProvider 內使用")
  return ctx
}
