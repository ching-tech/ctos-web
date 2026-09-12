import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/**
 * `linebot-personal`／`linebot-group` 是 LINE／Telegram bot 的系統提示詞。
 * `services/linebot_ai.py` 每次回話都重新讀一次 agent 的 system prompt，沒有快取，
 * 所以這裡存檔等於立刻改掉 bot 的講話方式。
 */
export function BotPromptAlert({ name }: { name: string }) {
  return (
    <Alert className="border-primary" data-testid="bot-prompt-alert">
      <AlertTitle>這是 bot 的系統提示詞</AlertTitle>
      <AlertDescription>
        {name} 是 LINE／Telegram bot 正在用的系統提示，存檔後下一則訊息就會照新的內容回答。
      </AlertDescription>
    </Alert>
  )
}
