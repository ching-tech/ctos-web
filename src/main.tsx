import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/lib/auth-context"
import { ThemePreferenceProvider } from "@/lib/theme-preference"
import { router } from "@/routes"
import "./index.css"

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } })

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="ctos-web.theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {/* 主題接後端偏好設定：登入後拿一次、之後切換就 PUT 回去 */}
          <ThemePreferenceProvider>
            <RouterProvider router={router} />
          </ThemePreferenceProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
