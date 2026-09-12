import type { ConfigApp } from "@/lib/config-apps"

/**
 * `requires_app` 的候選 app 來自後端的 `GET /api/config/apps`
 * （`api/config_public.py` 19–22 → `modules.py` 364–378），不是側邊欄那份
 * `lib/nav.ts`：
 *
 * - 側邊欄只有「有頁面的」app，後端那支連 extends 與 skill 貢獻的
 *   （`his-integration`、`nvr-viewer`、`voice`）都給，而這些正是 SKILL.md
 *   裡真的會寫的 `requires_app`。
 * - 中文名也以後端為準：`vendor-management` 後端叫「廠商管理」，
 *   側邊欄叫「往來對象」，編輯權限時該看的是前者。
 *
 * 後端沒宣告的 id 仍然要留住（`debug-skill` 寫的 `admin` 就不在那 21 筆裡），
 * 否則在網頁上按一次儲存就會把 SKILL.md 原本的設定洗掉。
 */

/** id → 顯示名稱；後端沒給名字就用 id 本身。 */
export function appLabel(apps: ConfigApp[], id: string): string {
  return apps.find((a) => a.id === id)?.name || id
}

/**
 * 選單要列的 app id：後端那份，再把「目前已選、但後端沒宣告」的併到後面。
 *
 * 後端已經用 `seen` 去重（`modules.py` 368–376），這裡再擋一次，
 * 免得 `current` 裡有重複值時跑出兩個一模一樣的勾選框。
 */
export function appOptions(apps: ConfigApp[], current: string[]): string[] {
  const ids = apps.map((a) => a.id)
  const seen = new Set(ids)
  const extra: string[] = []
  for (const id of current) {
    if (seen.has(id)) continue
    seen.add(id)
    extra.push(id)
  }
  return [...ids, ...extra]
}
