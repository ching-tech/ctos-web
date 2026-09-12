/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { useTheme } from "@/components/theme-provider"
import { ApiError } from "./api"
import { useAuth } from "./auth-context"
import { getPreferences, isPreferenceTheme, updatePreferences, type PreferenceTheme } from "./preferences"

/**
 * 把主題接到後端的偏好設定（`GET`／`PUT /api/user/preferences`，ching-tech-os api/user.py 247–293）。
 *
 * 主題本身仍然是 `ThemeProvider` 那一份狀態（side bar 的切換鈕與設定頁的選項用的是同一份），
 * 這裡只多做兩件事：登入後跟後端要一次目前的值，以及使用者改主題時把它 PUT 回去。
 * PUT 失敗就退回後端上一次確認過的值，並把後端的訊息交給設定頁顯示。
 *
 * 後端只收 "dark" 與 "light"；本機的 "system" 沒有地方存，遇到就不送。
 */

interface ThemePreferenceState {
  /** PUT 失敗時後端給的訊息；成功或還沒動過是 null。 */
  error: string | null
}

const ThemePreferenceContext = React.createContext<ThemePreferenceState | undefined>(undefined)

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useTheme()
  const { user } = useAuth()
  const [error, setError] = React.useState<string | null>(null)

  // 後端目前存的值；null 代表「後端沒有存過可用的值」。
  const serverTheme = React.useRef<PreferenceTheme | null>(null)
  // GET 有沒有回來過。這件事要跟「後端存的是什麼」分開記：後端可能回一個認不得的值
  // （ching-tech-os #240 把 preferences 寫壞的那種），那時候 serverTheme 還是 null，
  // 但使用者之後改主題**必須**寫得出去，不然整個功能就靜靜地不動了。
  const loaded = React.useRef(false)
  const loadedForUser = React.useRef<number | null>(null)

  // 登入後拿一次；用 Promise chaining 而不是 async/await，理由同 auth-context.tsx。
  React.useEffect(() => {
    if (!user || loadedForUser.current === user.id) return
    loadedForUser.current = user.id
    getPreferences()
      .then((prefs) => {
        loaded.current = true
        if (!isPreferenceTheme(prefs.theme)) {
          // 認不得的值當成「還沒設定過」：不動畫面上的主題，但之後的切換照樣送得出去。
          serverTheme.current = null
          return
        }
        serverTheme.current = prefs.theme
        setTheme(prefs.theme)
      })
      .catch(() => {
        // 拿不到就讓下次進來重試，期間維持本機的值、也不會往後端寫。
        loadedForUser.current = null
      })
  }, [user, setTheme])

  // 主題改了就存回去。側邊欄的切換鈕與設定頁的選項都走這一條。
  React.useEffect(() => {
    // GET 還沒回來之前不要寫，免得把本機殘留的值蓋過後端已經存好的。
    if (!user || !loaded.current) return
    const previous = serverTheme.current
    if (!isPreferenceTheme(theme) || theme === previous) return

    let cancelled = false
    updatePreferences(theme)
      .then((res) => {
        if (cancelled) return
        serverTheme.current = isPreferenceTheme(res.preferences.theme) ? res.preferences.theme : theme
        setError(null)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof ApiError ? e.detail : "主題沒有存成功，請稍後再試。")
        // 後端本來就沒有可用的值時沒有東西可以退回，畫面留在使用者選的那個，只報錯。
        if (previous !== null) setTheme(previous)
      })
    return () => {
      cancelled = true
    }
  }, [theme, user, setTheme])

  const value = React.useMemo(() => ({ error }), [error])
  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>
}

export function useThemePreference(): ThemePreferenceState {
  const ctx = React.useContext(ThemePreferenceContext)
  if (!ctx) throw new Error("useThemePreference 必須在 ThemePreferenceProvider 內使用")
  return ctx
}
