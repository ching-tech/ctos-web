import { NavLink, useLocation } from "react-router"
import { NavUser } from "@/components/nav-user"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar } from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth-context"
import { NAV_ITEMS } from "@/lib/nav"

export function AppSidebar() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || user?.is_admin)
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-2 text-base font-semibold group-data-[collapsible=icon]:hidden">ChingTech OS</SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <nav aria-label="主選單">
            <SidebarMenu>
              {items.map((item) => {
                const isActive = item.path === "/" ? pathname === "/" : pathname.startsWith(item.path)
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                      <NavLink to={item.path} end={item.path === "/"} onClick={() => { if (isMobile) setOpenMobile(false) }}>
                        <item.icon />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </nav>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter><NavUser /></SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
