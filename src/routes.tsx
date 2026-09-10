import { createBrowserRouter } from "react-router"
import { AppShell } from "@/components/app-shell"
import { RequireAuth } from "@/components/require-auth"
import HomePage from "@/pages/home"
import LoginPage from "@/pages/login"
import PlaceholderPage from "@/pages/placeholder"

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
          { path: "kb", element: <PlaceholderPage title="知識庫" /> },
          { path: "projects", element: <PlaceholderPage title="專案" /> },
          { path: "bot", element: <PlaceholderPage title="Bot 管理" /> },
          { path: "ai-log", element: <PlaceholderPage title="AI Log" /> },
          { path: "admin/users", element: <PlaceholderPage title="使用者管理" /> },
          { path: "settings", element: <PlaceholderPage title="設定" /> },
        ],
      },
    ],
  },
])
