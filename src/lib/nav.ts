import { BookOpen, Bot, FolderKanban, Home, ScrollText, Settings, Users, type LucideIcon } from "lucide-react"

export interface NavItem { title: string; path: string; icon: LucideIcon; adminOnly?: boolean; app?: string }

export const NAV_ITEMS: NavItem[] = [
  { title: "首頁", path: "/", icon: Home },
  { title: "知識庫", path: "/kb", icon: BookOpen, app: "knowledge-base" },
  { title: "專案", path: "/projects", icon: FolderKanban, app: "project-management" },
  { title: "Bot 管理", path: "/bot", icon: Bot, app: "linebot" },
  { title: "AI Log", path: "/ai-log", icon: ScrollText, app: "ai-log" },
  { title: "使用者管理", path: "/admin/users", icon: Users, adminOnly: true },
  { title: "設定", path: "/settings", icon: Settings },
]

export function titleForPath(pathname: string): string {
  return NAV_ITEMS.find((i) => (i.path === "/" ? pathname === "/" : pathname.startsWith(i.path)))?.title ?? "ChingTech OS"
}
