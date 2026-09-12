import { X } from "lucide-react"
import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * 標籤輸入。後端的 `tools` 是 `list[str] | None`，沒有可用工具清單的端點
 * （舊桌面 `frontend/js/agent-settings.js` 64–73 是寫死的），所以這裡讓人自由輸入，
 * 另外把那份寫死清單當快捷鍵擺在下面。
 */
export function TagInput({
  id,
  values,
  onChange,
  suggestions = [],
  placeholder,
}: {
  id: string
  values: string[]
  onChange: (next: string[]) => void
  suggestions?: { id: string; name: string }[]
  placeholder?: string
}) {
  const [draft, setDraft] = React.useState("")

  function add(raw: string) {
    const value = raw.trim()
    if (!value || values.includes(value)) {
      setDraft("")
      return
    }
    onChange([...values, value])
    setDraft("")
  }

  function remove(value: string) {
    onChange(values.filter((v) => v !== value))
  }

  const unused = suggestions.filter((s) => !values.includes(s.id))

  return (
    <div className="space-y-2">
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <li key={v}>
              <Badge variant="secondary" className="gap-1 pr-1">
                {v}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-4"
                  aria-label={`移除「${v}」`}
                  onClick={() => remove(v)}
                >
                  <X className="size-3" />
                </Button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter 在表單裡預設會送出，這裡要攔下來當成「新增一個標籤」。
          if (e.key === "Enter") {
            e.preventDefault()
            add(draft)
          }
        }}
        onBlur={() => add(draft)}
      />
      {unused.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">常用：</span>
          {unused.map((s) => (
            <Button key={s.id} type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => add(s.id)}>
              {s.id}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
