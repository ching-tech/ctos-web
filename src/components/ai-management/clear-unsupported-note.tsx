/**
 * 後端 `services/ai_manager.py` 135–163（prompt）與 412–450（agent）是用 `is not None`
 * 組 UPDATE 的，送 `null` 等於沒送，所以可為空的欄位**清空不掉**（ching-tech-os #252）。
 * 前端遇到「原本有值、現在被清空」就把欄位留在 PUT 外面，並在欄位旁邊講清楚。
 */
export function ClearUnsupportedNote() {
  return (
    <p className="text-xs text-destructive" data-testid="clear-unsupported-note">
      目前後端不支援清空，只能改成別的值（#252）
    </p>
  )
}
