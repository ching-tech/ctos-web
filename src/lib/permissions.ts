import type { UserInfo } from "./types"

/** 管理員一律放行；一般使用者依 permissions.apps[app]（未設定視為無權）。 */
export function canAccessApp(user: UserInfo | null, app: string): boolean {
  if (user?.is_admin) return true
  return user?.permissions?.apps?.[app] ?? false
}
