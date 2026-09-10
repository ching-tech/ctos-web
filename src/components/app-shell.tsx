import { Outlet, useLocation } from "react-router"
import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { titleForPath } from "@/lib/nav"

export function AppShell() {
  const { pathname } = useLocation()
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-14 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <span className="text-sm font-medium">{titleForPath(pathname)}</span>
          </header>
          <div className="flex-1 overflow-x-hidden p-4 md:p-6"><Outlet /></div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
