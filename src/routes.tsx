import { createBrowserRouter } from "react-router"
import { AppShell } from "@/components/app-shell"
import { RequireAdmin, RequireApp } from "@/components/require-app"
import { RequireAuth } from "@/components/require-auth"
import AdminUsersPage from "@/pages/admin/users"
import AiLogDetailPage from "@/pages/ai-log/detail"
import AiLogListPage from "@/pages/ai-log/list"
import BotPage from "@/pages/bot"
import BotGroupDetailPage from "@/pages/bot/group-detail"
import HomePage from "@/pages/home"
import KbDetailPage from "@/pages/kb/detail"
import KbEditorPage from "@/pages/kb/editor"
import KbListPage from "@/pages/kb/list"
import LoginPage from "@/pages/login"
import ProjectDetailPage from "@/pages/projects/detail"
import ProjectEditorPage from "@/pages/projects/editor"
import ProjectListPage from "@/pages/projects/list"
import SettingsPage from "@/pages/settings"

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: "/",
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          // AI 助手是唯一用到 socket.io-client 的頁，分開載入，不要讓它進主 bundle。
          {
            path: "assistant",
            lazy: async () => {
              const { default: AssistantPage } = await import("@/pages/assistant")
              return { element: <RequireApp app="ai-assistant"><AssistantPage /></RequireApp> }
            },
          },
          { path: "kb", element: <RequireApp app="knowledge-base"><KbListPage /></RequireApp> },
          { path: "kb/new", element: <RequireApp app="knowledge-base"><KbEditorPage /></RequireApp> },
          { path: "kb/:id", element: <RequireApp app="knowledge-base"><KbDetailPage /></RequireApp> },
          { path: "kb/:id/edit", element: <RequireApp app="knowledge-base"><KbEditorPage /></RequireApp> },
          { path: "projects", element: <RequireApp app="project-management"><ProjectListPage /></RequireApp> },
          { path: "projects/new", element: <RequireApp app="project-management"><ProjectEditorPage /></RequireApp> },
          { path: "projects/:id", element: <RequireApp app="project-management"><ProjectDetailPage /></RequireApp> },
          { path: "projects/:id/edit", element: <RequireApp app="project-management"><ProjectEditorPage /></RequireApp> },
          { path: "bot", element: <RequireApp app="linebot"><BotPage /></RequireApp> },
          { path: "bot/groups/:id", element: <RequireApp app="linebot"><BotGroupDetailPage /></RequireApp> },
          { path: "ai-log", element: <RequireApp app="ai-log"><AiLogListPage /></RequireApp> },
          { path: "ai-log/:id", element: <RequireApp app="ai-log"><AiLogDetailPage /></RequireApp> },
          { path: "admin/users", element: <RequireAdmin><AdminUsersPage /></RequireAdmin> },
          { path: "settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
])
