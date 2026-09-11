import { createBrowserRouter } from "react-router"
import { AppShell } from "@/components/app-shell"
import { RequireAdmin, RequireApp } from "@/components/require-app"
import { RequireAuth } from "@/components/require-auth"
import AdminUsersPage from "@/pages/admin/users"
import AiLogDetailPage from "@/pages/ai-log/detail"
import AiLogListPage from "@/pages/ai-log/list"
import BotPage from "@/pages/bot"
import HomePage from "@/pages/home"
import KbDetailPage from "@/pages/kb/detail"
import KbEditorPage from "@/pages/kb/editor"
import KbListPage from "@/pages/kb/list"
import LoginPage from "@/pages/login"
import PlaceholderPage from "@/pages/placeholder"
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
          { path: "kb", element: <RequireApp app="knowledge-base"><KbListPage /></RequireApp> },
          { path: "kb/new", element: <RequireApp app="knowledge-base"><KbEditorPage /></RequireApp> },
          { path: "kb/:id", element: <RequireApp app="knowledge-base"><KbDetailPage /></RequireApp> },
          { path: "kb/:id/edit", element: <RequireApp app="knowledge-base"><KbEditorPage /></RequireApp> },
          { path: "projects", element: <PlaceholderPage title="專案" /> },
          { path: "bot", element: <RequireApp app="linebot"><BotPage /></RequireApp> },
          { path: "bot/groups/:id", element: <RequireApp app="linebot"><PlaceholderPage title="群組" /></RequireApp> },
          { path: "ai-log", element: <RequireApp app="ai-log"><AiLogListPage /></RequireApp> },
          { path: "ai-log/:id", element: <RequireApp app="ai-log"><AiLogDetailPage /></RequireApp> },
          { path: "admin/users", element: <RequireAdmin><AdminUsersPage /></RequireAdmin> },
          { path: "settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
])
