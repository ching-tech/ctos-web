import { useTheme } from "@/components/theme-provider"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useThemePreference } from "@/lib/theme-preference"

/** 後端只收 "dark" 與 "light"（api/user.py 277–281）。 */
const THEME_OPTIONS: { value: string; label: string }[] = [
  { value: "light", label: "亮色" },
  { value: "dark", label: "暗色" },
]

export function PreferencesCard() {
  const { theme, setTheme } = useTheme()
  const { error } = useThemePreference()

  return (
    <Card>
      <CardHeader>
        <CardTitle>偏好</CardTitle>
        <CardDescription>主題會存在帳號上，換一台裝置登入也是同一個設定。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset className="space-y-2">
          {/* 這一行是整組的標題，不能用 htmlFor 指到某一顆 radio，否則點標題會選中那一顆。 */}
          <legend className="text-sm font-medium">主題</legend>
          <RadioGroup
            value={theme}
            onValueChange={setTheme}
            aria-label="主題"
            className="flex flex-wrap items-center gap-4"
          >
            {THEME_OPTIONS.map((o) => (
              <Label key={o.value} htmlFor={`theme-${o.value}`} className="flex items-center gap-2 font-normal">
                <RadioGroupItem id={`theme-${o.value}`} value={o.value} />
                <span>{o.label}</span>
              </Label>
            ))}
          </RadioGroup>
          {theme === "system" && (
            <p className="text-sm text-muted-foreground">
              目前跟隨系統，還沒有存到帳號上；選亮色或暗色就會存回去。
            </p>
          )}
        </fieldset>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
