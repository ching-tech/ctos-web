import { useAuth } from "@/lib/auth-context"

export default function HomePage() {
  const { user } = useAuth()
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">首頁</h1>
      <p className="text-muted-foreground">你好，{user?.display_name || user?.username}。管理層 dashboard 之後在這裡。</p>
    </div>
  )
}
