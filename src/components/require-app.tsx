import type { ReactNode } from "react"
import { Link } from "react-router"
import { useAuth } from "@/lib/auth-context"
import { canAccessApp } from "@/lib/permissions"

function BlockedPage({ message }: { message: string }) {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">{message}</h1>
      <Link className="text-primary underline underline-offset-4" to="/">
        回首頁
      </Link>
    </div>
  )
}

/** 依 app 權限決定是否渲染子內容；無權時顯示「此功能需要管理員開放」而非導頁，避免與 RequireAuth 互相導頁。 */
export function RequireApp({ app, children }: { app: string; children: ReactNode }) {
  const { user } = useAuth()
  if (!canAccessApp(user, app)) return <BlockedPage message="此功能需要管理員開放" />
  return <>{children}</>
}

/** 僅管理員可見；非管理員顯示「此頁只有管理員能使用」。 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!user?.is_admin) return <BlockedPage message="此頁只有管理員能使用" />
  return <>{children}</>
}
