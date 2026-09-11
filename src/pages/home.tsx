import { useAuth } from "@/lib/auth-context"
import { canAccessApp } from "@/lib/permissions"
import { HomeRecentKb } from "@/pages/kb/home-recent"
import { HomeActiveProjects } from "@/pages/home/active-projects-card"
import { HomeAiUsage } from "@/pages/home/ai-usage-card"
import { HomeBotSummary } from "@/pages/home/bot-summary-card"
import { HomeOverdueMilestones } from "@/pages/home/overdue-milestones-card"
import { HomePendingReceipts } from "@/pages/home/pending-receipts-card"

export default function HomePage() {
  const { user } = useAuth()
  const showAiUsage = canAccessApp(user, "ai-log")
  const showBotSummary = canAccessApp(user, "linebot")
  const showProjects = canAccessApp(user, "project-management")
  const showPendingReceipts = canAccessApp(user, "inventory-management")

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-sm font-medium text-muted-foreground">首頁</h1>
        <p className="text-muted-foreground">你好，{user?.display_name || user?.username}。管理層 dashboard 之後在這裡。</p>
      </div>
      {(showAiUsage || showBotSummary || showProjects || showPendingReceipts) && (
        <div className="grid gap-4 md:grid-cols-2">
          {showAiUsage && <HomeAiUsage />}
          {showBotSummary && <HomeBotSummary />}
          {showProjects && (
            <>
              <HomeActiveProjects />
              <HomeOverdueMilestones />
            </>
          )}
          {showPendingReceipts && <HomePendingReceipts />}
        </div>
      )}
      {canAccessApp(user, "knowledge-base") && <HomeRecentKb />}
    </div>
  )
}
