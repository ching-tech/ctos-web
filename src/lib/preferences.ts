import { apiFetch } from "./api"

/**
 * 使用者偏好設定。契約對 ching-tech-os `api/user.py` 59–75（models）與 247–293（端點）。
 * 目前只有主題一個欄位，後端只收 "dark" 與 "light"，其他值回 400。
 */

export type PreferenceTheme = "dark" | "light"

/** `PreferencesResponse`（api/user.py 59–62），預設值 "dark"。 */
export interface PreferencesResponse {
  theme: string
}

/** `PreferencesUpdateResponse`（api/user.py 71–75）。 */
export interface PreferencesUpdateResponse {
  success: boolean
  preferences: PreferencesResponse
}

export function getPreferences(): Promise<PreferencesResponse> {
  return apiFetch<PreferencesResponse>("/api/user/preferences")
}

/** `PreferencesUpdateRequest` 只有 theme 一個欄位（api/user.py 65–68）；空 body 會被 400 擋掉。 */
export function updatePreferences(theme: PreferenceTheme): Promise<PreferencesUpdateResponse> {
  return apiFetch<PreferencesUpdateResponse>("/api/user/preferences", {
    method: "PUT",
    body: JSON.stringify({ theme }),
  })
}

/** 後端只認得這兩個值（api/user.py 277–281）；本機的 "system" 沒有地方存。 */
export function isPreferenceTheme(value: string): value is PreferenceTheme {
  return value === "dark" || value === "light"
}
