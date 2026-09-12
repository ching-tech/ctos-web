import { Outlet } from "react-router"
import { AppSidebar } from "@/components/app-sidebar"
import { MessageBell } from "@/components/message-bell"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

export function AppShell() {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-12 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <MessageBell className="ml-auto" />
          </header>
          <div className="flex-1 overflow-x-hidden p-4 md:p-6"><Outlet /></div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
