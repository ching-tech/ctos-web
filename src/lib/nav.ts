import { BookOpen, Bot, FolderKanban, Home, ScrollText, Settings, Users, type LucideIcon } from "lucide-react"

export interface NavItem { title: string; path: string; icon: LucideIcon; adminOnly?: boolean }

export const NAV_ITEMS: NavItem[] = [
  { title: "首頁", path: "/", icon: Home },
  { title: "知識庫", path: "/kb", icon: BookOpen },
  { title: "專案", path: "/projects", icon: FolderKanban },
  { title: "Bot 管理", path: "/bot", icon: Bot },
  { title: "AI Log", path: "/ai-log", icon: ScrollText },
  { title: "使用者管理", path: "/admin/users", icon: Users, adminOnly: true },
  { title: "設定", path: "/settings", icon: Settings },
]

export function titleForPath(pathname: string): string {
  return NAV_ITEMS.find((i) => (i.path === "/" ? pathname === "/" : pathname.startsWith(i.path)))?.title ?? "ChingTech OS"
}
