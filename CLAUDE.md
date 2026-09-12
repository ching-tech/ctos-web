# ctos-web 開發規則

- 使用正體中文回應與註解；UI 文案用全形標點、不用 emoji。
- 後端契約以 `ching-tech-os` 的 Pydantic model 為準，e2e fixture 逐欄對照，不照前端型別猜。
- 四道門全綠才合併：`npm run lint && npm run test && npx playwright test && npm run build`。

## 真實客戶／廠商資料不得進 repo（2026-09-12 起）

這個 repo 是**公開**的。任何真實客戶、供應商、聯絡人的名稱、電話、email、地址、統編、料號、單號，都不得出現在 e2e fixture、測試、範例、文件、issue／PR 文字或 commit 訊息裡；範例一律用杜撰名（甲一機電、乙二運輸、丙丁科技這類）。動到 fixture 時，用 ERPNext 備份的名稱清單反向掃描 `e2e/` 與 `src/` 再 commit（做法見 ching-tech-os 的 `docs/decision-2026-09-real-names-in-history.md`）。2026-09-12 曾有真實客戶名進了 fixture（PR #16），在 PR #17 換掉；不要再靠人自己想到這條規則。
