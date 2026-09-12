import { useLocation, useSearchParams } from "react-router"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/lib/auth-context"
import { titleForPath } from "@/lib/nav"
import type { Platform } from "@/lib/bot"
import BindingTab from "./tabs/binding"
import BlocklistTab from "./tabs/blocklist"
import FilesTab from "./tabs/files"
import GroupsTab from "./tabs/groups"
import MessagesTab from "./tabs/messages"
import PlatformSettingsTab from "./tabs/platform-settings"
import UsersTab from "./tabs/users"

const TAB_VALUES = ["binding", "groups", "users", "blocklist", "messages", "files", "settings"] as const
type TabValue = (typeof TAB_VALUES)[number]

/** 平台設定的四支端點都是 `require_admin`（ching-tech-os api/bot_settings.py 37–41），非管理員不給分頁。 */
const ADMIN_ONLY_TABS: readonly TabValue[] = ["settings"]

const TAB_LABEL: Record<TabValue, string> = {
  binding: "綁定",
  groups: "群組",
  users: "使用者",
  blocklist: "黑名單",
  messages: "訊息",
  files: "檔案",
  settings: "平台設定",
}

function isTabValue(v: string | null): v is TabValue {
  return (TAB_VALUES as readonly string[]).includes(v ?? "")
}

function tabFromParams(params: URLSearchParams, isAdmin: boolean): TabValue {
  const raw = params.get("tab")
  if (!isTabValue(raw)) return "binding"
  if (!isAdmin && ADMIN_ONLY_TABS.includes(raw)) return "binding"
  return raw
}

function platformFromParams(params: URLSearchParams): Platform | "" {
  const raw = params.get("platform")
  return raw === "line" || raw === "telegram" ? raw : ""
}

export default function BotPage() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const isAdmin = Boolean(user?.is_admin)
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = tabFromParams(searchParams, isAdmin)
  const platform = platformFromParams(searchParams)
  const visibleTabs = TAB_VALUES.filter((v) => isAdmin || !ADMIN_ONLY_TABS.includes(v))

  function setTab(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value === "binding") next.delete("tab")
    else next.set("tab", value)
    next.delete("page")
    next.delete("fileType")
    next.delete("group")
    setSearchParams(next, { replace: true })
  }

  function setPlatform(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value === "all") next.delete("platform")
    else next.set("platform", value)
    next.delete("page")
    next.delete("group")
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sr-only">{titleForPath(pathname)}</h1>
        <p className="text-sm text-muted-foreground">Bot 管理</p>
        <Select value={platform || "all"} onValueChange={setPlatform}>
          <SelectTrigger className="w-28" aria-label="平台">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="line">Line</SelectItem>
            <SelectItem value="telegram">Telegram</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {/* Tabs 內容在窄螢幕可能比視窗寬，讓 TabsList 自己橫向捲動，不要把整個頁面撐寬。 */}
        <div className="overflow-x-auto">
          <TabsList>
            {visibleTabs.map((v) => (
              <TabsTrigger key={v} value={v}>
                {TAB_LABEL[v]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="binding">
          <BindingTab />
        </TabsContent>
        <TabsContent value="groups">
          <GroupsTab platform={platform} />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab platform={platform} />
        </TabsContent>
        <TabsContent value="blocklist">
          <BlocklistTab platform={platform} />
        </TabsContent>
        <TabsContent value="messages">
          <MessagesTab platform={platform} />
        </TabsContent>
        <TabsContent value="files">
          <FilesTab platform={platform} />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="settings">
            <PlatformSettingsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
