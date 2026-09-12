import { apiFetch } from "./api"

/**
 * `GET /api/config/apps`（ching-tech-os `api/config_public.py` 19–22）→
 * `modules.py` 的 `get_enabled_app_manifests()`（364–378）。
 *
 * 三件要記住的事：
 * 1. **回的是裸陣列**，不是 `{apps: [...]}`。
 * 2. 這支**不需要認證**（`config_public.py` 的 router 沒掛任何 dependency）。
 * 3. 清單是「目前啟用的模組」宣告的 app，**含 extends 與 skill 貢獻的**
 *    （`contributes.app` 走 `modules.py` 292–315 進 manifest），所以
 *    `his-integration`、`nvr-viewer`、`voice` 這些側邊欄沒有的 app 也在裡面。
 *    本機實測回 21 筆。
 *
 * 名稱以這支為準而不是 `lib/nav.ts`：同一個 app 兩邊的中文名不一樣
 * （`vendor-management` 後端叫「廠商管理」、側邊欄叫「往來對象」），
 * 而且側邊欄只涵蓋有頁面的那些。
 */
export interface ConfigApp {
  id: string
  name: string
  icon: string
  /** skill 貢獻的前端 app 才有（`modules.py` 300–312）；這一頁用不到。 */
  loader?: { src: string; globalName: string }
  css?: string
}

export function listConfigApps(): Promise<ConfigApp[]> {
  return apiFetch<ConfigApp[]>("/api/config/apps")
}

export const configAppKeys = {
  all: ["config", "apps"] as const,
}
