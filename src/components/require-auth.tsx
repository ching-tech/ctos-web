import { Navigate, Outlet } from "react-router"
import { useAuth } from "@/lib/auth-context"
import { getToken } from "@/lib/token"

export function RequireAuth() {
  const { user, loading } = useAuth()
  if (!getToken()) return <Navigate to="/login" replace />
  if (loading) return <div className="p-6 text-muted-foreground">載入中…</div>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
