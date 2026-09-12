import { BookOpen, Bot, Brain, Building2, Folder, FolderKanban, Home, Package, ScrollText, Settings, Share2, ShoppingCart, Sparkles, Users, type LucideIcon } from "lucide-react"

export interface NavItem { title: string; path: string; icon: LucideIcon; adminOnly?: boolean; app?: string }

export const NAV_ITEMS: NavItem[] = [
  { title: "首頁", path: "/", icon: Home },
  { title: "AI 助手", path: "/assistant", icon: Sparkles, app: "ai-assistant" },
  { title: "知識庫", path: "/kb", icon: BookOpen, app: "knowledge-base" },
  { title: "檔案", path: "/files", icon: Folder, app: "file-manager" },
  { title: "專案", path: "/projects", icon: FolderKanban, app: "project-management" },
  { title: "往來對象", path: "/parties", icon: Building2, app: "vendor-management" },
  // 倉庫頁（/warehouses）不佔側邊欄，從物料清單的「倉庫」按鈕進去
  { title: "物料庫存", path: "/items", icon: Package, app: "inventory-management" },
  { title: "採購單", path: "/purchase-orders", icon: ShoppingCart, app: "inventory-management" },
  { title: "Bot 管理", path: "/bot", icon: Bot, app: "linebot" },
  { title: "記憶", path: "/memory", icon: Brain, app: "memory-manager" },
  { title: "AI Log", path: "/ai-log", icon: ScrollText, app: "ai-log" },
  // share-manager 後端預設關閉（services/permissions.py 177），沒開的人看不到這一項。
  { title: "分享", path: "/shares", icon: Share2, app: "share-manager" },
  { title: "使用者管理", path: "/admin/users", icon: Users, adminOnly: true },
  { title: "設定", path: "/settings", icon: Settings },
]

export function titleForPath(pathname: string): string {
  return NAV_ITEMS.find((i) => (i.path === "/" ? pathname === "/" : pathname.startsWith(i.path)))?.title ?? "ChingTech OS"
}
