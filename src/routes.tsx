import { createBrowserRouter, Outlet, useNavigate } from "react-router"
import { RequireAuth } from "@/components/require-auth"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import HomePage from "@/pages/home"
import LoginPage from "@/pages/login"

function MinimalShell() {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  async function handleSignOut() {
    await signOut()
    navigate("/login", { replace: true })
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex justify-end">
        <Button variant="outline" onClick={handleSignOut}>登出</Button>
      </div>
      <Outlet />
    </div>
  )
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "/", element: <MinimalShell />, children: [{ index: true, element: <HomePage /> }] },
    ],
  },
])
