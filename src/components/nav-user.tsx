import { ChevronsUpDown, LogOut, Monitor, Moon, Sun } from "lucide-react"
import { useNavigate } from "react-router"
import { useTheme } from "@/components/theme-provider"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth-context"

export function NavUser() {
  const { user, signOut } = useAuth()
  const { setTheme } = useTheme()
  const { isMobile } = useSidebar()
  const navigate = useNavigate()
  const name = user?.display_name || user?.username || ""

  async function onLogout() {
    await signOut()
    navigate("/login", { replace: true })
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{user?.role === "admin" ? "系統管理員" : "一般使用者"}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "bottom" : "right"} align="end" className="min-w-48">
            <DropdownMenuLabel>主題</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setTheme("light")}><Sun />亮色</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}><Moon />暗色</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}><Monitor />跟隨系統</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout}><LogOut />登出</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
