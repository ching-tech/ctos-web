import { LogOut, Monitor, Moon, Sun } from "lucide-react"
import { useNavigate } from "react-router"
import { useTheme } from "@/components/theme-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth-context"

const THEME_ORDER = ["light", "dark", "system"] as const
type ThemeValue = (typeof THEME_ORDER)[number]
const THEME_LABEL: Record<ThemeValue, string> = { light: "亮色", dark: "暗色", system: "跟隨系統" }
const THEME_ICON: Record<ThemeValue, typeof Sun> = { light: Sun, dark: Moon, system: Monitor }

export function NavUser() {
  const { user, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const name = user?.display_name || user?.username || ""
  const initial = name.slice(0, 1) || "?"
  const ThemeIcon = THEME_ICON[theme]

  async function onLogout() {
    await signOut()
    navigate("/login", { replace: true })
  }

  function cycleTheme() {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]
    setTheme(next)
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex items-center gap-2 rounded-md p-1 group-data-[collapsible=icon]:justify-center">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
            {initial}
          </div>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{name}</span>
              <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px]">
                {user?.is_admin ? "管理員" : "一般使用者"}
              </Badge>
            </div>
            <div className="truncate text-xs text-muted-foreground">{user?.username}</div>
          </div>
        </div>
        <div className="mt-1 flex items-center gap-1 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="切換主題"
            title={`目前主題：${THEME_LABEL[theme]}`}
            onClick={cycleTheme}
            className="group-data-[collapsible=icon]:hidden"
          >
            <ThemeIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="登出" onClick={onLogout}>
            <LogOut />
          </Button>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
