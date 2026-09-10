export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">這個模組還在建置中，先用舊桌面。</p>
      <a className="text-primary underline underline-offset-4" href="https://ching-tech.ddns.net/ctos/" target="_blank" rel="noreferrer">開啟舊桌面</a>
    </div>
  )
}
