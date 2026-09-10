import { createBrowserRouter } from "react-router"
import { AppShell } from "@/components/app-shell"
import { RequireAuth } from "@/components/require-auth"
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
          { path: "kb", element: <KbListPage /> },
          { path: "kb/new", element: <KbEditorPage /> },
          { path: "kb/:id", element: <KbDetailPage /> },
          { path: "kb/:id/edit", element: <KbEditorPage /> },
          { path: "projects", element: <PlaceholderPage title="專案" /> },
          { path: "bot", element: <PlaceholderPage title="Bot 管理" /> },
          { path: "ai-log", element: <PlaceholderPage title="AI Log" /> },
          { path: "admin/users", element: <PlaceholderPage title="使用者管理" /> },
          { path: "settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
])
