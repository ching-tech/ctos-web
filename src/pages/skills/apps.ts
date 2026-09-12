import { NAV_ITEMS } from "@/lib/nav"

/**
 * `requires_app` 的候選 app：側邊欄那份清單（`lib/nav.ts`）裡有掛 `app` 的項目。
 * 後端沒有「列出所有 app id」的端點，app 權限的預設值寫在 `services/permissions.py`，
 * 所以選項來源就是前端自己這份。
 *
 * 同一個 app 可能有兩個側邊欄項目（`inventory-management` 就掛在物料庫存與採購單底下），
 * 所以要去重，而且名稱取**第一個**出現的，否則選單會變成兩個一樣的勾選框、
 * 標籤還會顯示成後面那一項的名字。
 */
export const NAV_APPS: string[] = [...new Set(NAV_ITEMS.flatMap((i) => (i.app ? [i.app] : [])))]

const LABELS = new Map<string, string>()
for (const item of NAV_ITEMS) {
  if (item.app && !LABELS.has(item.app)) LABELS.set(item.app, item.title)
}

/** 有中文名就顯示中文名，沒有的（例如 SKILL.md 自己寫的 app id）原樣顯示。 */
export function appLabel(app: string): string {
  return LABELS.get(app) ?? app
}

/**
 * 選項＝側邊欄那份，再把目前已選、但不在清單裡的 app 併進來，
 * SKILL.md 裡寫了清單外的 app id 也不會因為選單沒有就被編輯動作洗掉。
 */
export function appOptions(current: string[]): string[] {
  return [...NAV_APPS, ...current.filter((a) => !NAV_APPS.includes(a))]
}
