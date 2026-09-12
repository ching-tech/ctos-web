import { X } from "lucide-react"
import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * 標籤編輯器：`allowed_tools` 與 `mcp_servers` 兩個欄位共用。
 *
 * 後端寫回 SKILL.md 時是用空白把清單接起來（`skills/__init__.py` 552、566），
 * 所以單一標籤裡不能有空白；輸入時就地切開，貼一串進來也接得住。
 */
export function TagInput({
  id,
  label,
  values,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  values: string[]
  placeholder: string
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = React.useState("")

  function add() {
    const parts = draft.split(/\s+/).filter(Boolean)
    if (parts.length === 0) return
    const next = [...values]
    for (const p of parts) if (!next.includes(p)) next.push(p)
    onChange(next)
    setDraft("")
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {values.length === 0 ? (
          <span className="text-sm text-muted-foreground">未設定</span>
        ) : (
          values.map((v) => (
            <Badge key={v} variant="tint" className="gap-1">
              <span className="font-mono">{v}</span>
              <button
                type="button"
                aria-label={`移除 ${v}`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onChange(values.filter((x) => x !== v))}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          aria-label={label}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            // 這個輸入框在 <form> 裡，Enter 的預設行為是送出整張表單，先擋掉。
            e.preventDefault()
            add()
          }}
        />
        <Button type="button" variant="outline" onClick={add}>
          新增
        </Button>
      </div>
    </div>
  )
}
