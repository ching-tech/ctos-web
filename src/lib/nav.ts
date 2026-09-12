import { Bell, BookOpen, Bot, Brain, Building2, CalendarClock, FileTerminal, Folder, FolderKanban, Home, LogIn, Package, Presentation, Puzzle, ScrollText, Settings, Share2, ShoppingCart, Sparkles, Users, Wrench, type LucideIcon } from "lucide-react"

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
  { title: "Prompt", path: "/prompts", icon: FileTerminal, app: "prompt-editor" },
  { title: "Agent", path: "/agents", icon: Wrench, app: "agent-settings" },
  { title: "AI Log", path: "/ai-log", icon: ScrollText, app: "ai-log" },
  // 後端 md2ppt 預設開放（services/permissions.py 178），但 api/presentation.py 46–50 沒掛 app 閘，這一項只是入口。
  { title: "簡報", path: "/presentation", icon: Presentation, app: "md2ppt" },
  // share-manager 後端預設關閉（services/permissions.py 177），沒開的人看不到這一項。
  { title: "分享", path: "/shares", icon: Share2, app: "share-manager" },
  // 訊息中心沒有 app 閘：後端只要登入（ching-tech-os api/messages.py 45）。
  { title: "訊息", path: "/messages", icon: Bell },
  // 排程沒有 app 權限旗標，後端 /api/scheduler/* 全部 require_admin（api/scheduler.py 44–240）。
  { title: "排程", path: "/scheduler", icon: CalendarClock, adminOnly: true },
  // Skills 的每一支端點都掛 require_admin（ching-tech-os `api/skills.py`），所以整頁只給管理員。
  { title: "Skills", path: "/skills", icon: Puzzle, adminOnly: true },
  // 登入紀錄也沒有 app 閘：後端只要登入，非管理員看到的是自己的（api/login_records.py 25–29）。
  { title: "登入紀錄", path: "/login-records", icon: LogIn },
  { title: "使用者管理", path: "/admin/users", icon: Users, adminOnly: true },
  { title: "設定", path: "/settings", icon: Settings },
]

export function titleForPath(pathname: string): string {
  return NAV_ITEMS.find((i) => (i.path === "/" ? pathname === "/" : pathname.startsWith(i.path)))?.title ?? "ChingTech OS"
}
