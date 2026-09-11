# ChingTech OS 新前端

ChingTech OS 新前端（React），擎添工業內部系統的 Web 介面。後端程式在 [ching-tech-os](https://github.com/yazelin/ching-tech-os) 儲存庫（FastAPI）。線上網址為 [https://os.ching-tech.com](https://os.ching-tech.com)（GitHub Pages，自訂網域）。

## 技術棧

- **架構**：Vite 8、React 19、TypeScript 6
- **樣式**：Tailwind CSS 4、shadcn/ui（Radix 版 preset nova）、Lucide React 圖示
- **路由**：React Router 7
- **資料**：@tanstack/react-query 5（伺服器狀態快取）
- **Markdown**：react-markdown 10、remark-gfm 4（知識庫內容渲染）
- **測試**：Vitest 5、Playwright（desktop 與 mobile）
- **其他**：Geist Variable 字體、tailwind-animate

確切版本見 `package.json` 與 `components.json`。

## 本機開發

### 安裝依賴

```bash
npm install
```

### 環境設定

複製 `.env.example` 到 `.env` 並設定：

```bash
cp .env.example .env
```

`.env` 內容：

```
VITE_API_BASE=https://ching-tech.ddns.net/ctos
```

- **正式機**（預設）：`https://ching-tech.ddns.net/ctos`
- **本機後端**：改成 `http://127.0.0.1:8088`

### 啟動開發伺服器

```bash
npm run dev
```

Vite 伺服器開在 `http://localhost:5173`。

### 本機後端設定

若打本機後端，需在後端 `.env` 的 `CORS_EXTRA_ORIGINS` 加上 `http://localhost:5173`（正式機已預設）。

## 測試

### 單元測試

```bash
npm run test
```

運行 Vitest，測試檔在 `src/lib/` 目錄（含 `kb.test.ts`）。

### 端對端測試

第一次執行需安裝 Chromium：

```bash
npx playwright install chromium
```

執行測試：

```bash
npm run e2e
```

測試檔在 `e2e/` 目錄，其中知識庫相關的四支：`kb-list.spec.ts`（清單搜尋與篩選）、`kb-detail.spec.ts`（閱讀、附件、刪除）、`kb-editor.spec.ts`（新增／編輯）、`kb-share-history.spec.ts`（分享連結與版本歷史）；另有 `ai-log.spec.ts`（統計卡、篩選、分頁、明細頁）。Playwright 設定包含兩個 project：
- **desktop**：Desktop Chrome
- **mobile**：iPhone 13（Chromium）

測試使用 `page.route()` 攔截 API，不打真後端。

### 建置與預覽

```bash
npm run build
```

輸出於 `dist/` 目錄，包含 TypeScript 編譯檢查（`tsc -b`）。`dist/404.html` 由部署工作流程另外複製 `dist/index.html` 產生（見下方「部署」一節），供 GitHub Pages 的 SPA fallback，`npm run build` 本身不會產生它。

## 部署

推送到 `main` 分支自動觸發 `.github/workflows/deploy.yml`，流程如下：

1. 安裝依賴
2. 執行 `npm run test`
3. 安裝 Playwright Chromium
4. 執行 `npm run e2e`
5. 執行 `npm run build`
6. 複製 `dist/index.html` 為 `dist/404.html`
7. 上傳至 GitHub Pages

線上網址 https://os.ching-tech.com 由 `public/CNAME` 指向（已設定自訂網域）。

## 目錄結構

### `src/lib/`

共用工具與狀態管理：

- `api.ts` — API 客戶端（請求封裝與錯誤處理）
- `api.test.ts` — API 單元測試
- `auth.ts` — 認證函式（登入、登出、NAS 綁定）
- `auth.test.ts` — 認證單元測試
- `auth-context.tsx` — React Context（使用者與驗證狀態）
- `token.ts` — localStorage token 管理（取得、存儲、清除）
- `types.ts` — TypeScript 型別定義
- `nav.ts` — 側邊欄導航項目
- `utils.ts` — 工具函式
- `kb.ts` — 知識庫 API 客戶端（清單／詳情／建立／編輯／刪除／附件／分享／版本歷史）
- `kb.test.ts` — 知識庫 API 單元測試
- `ai-log.ts` — AI Log API 客戶端（清單／統計／詳情／篩選轉換／query key）
- `bot.ts` — Bot 管理 API 客戶端（綁定狀態、群組、使用者、黑名單、訊息、檔案；分頁與檔案下載 Helper）
- `bot.test.ts` — Bot API 單元測試
- `permissions.ts` — `canAccessApp`（依 `is_admin` 與 `permissions.apps` 判斷是否有權限使用某 app）
- `permissions.test.ts` — 權限判斷單元測試
- `admin.ts` — 管理員 API 客戶端（使用者清單、預設權限、更新使用者權限、query key）
- `admin.test.ts` — 管理員 API 單元測試

### `src/pages/`

各頁面元件：

- `login.tsx` — 登入頁（NAS 帳號 vs 平台帳號兩分頁）
- `home.tsx` — 首頁（個人化問候，掛載知識庫「最近更新」卡片）
- `settings.tsx` — 設定頁（帳號資訊、NAS 綁定／解綁）
- `placeholder.tsx` — 未完成模組佔位元件（顯示空頁並連回舊桌面）
- `kb/list.tsx` — 知識庫清單頁（搜尋、scope／type／category 篩選、URL 同步）
- `kb/detail.tsx` — 知識庫閱讀頁（Markdown 渲染、附件、metadata、刪除）
- `kb/editor.tsx` — 知識庫新增／編輯頁（共用表單、預覽、只送變動欄位）
- `kb/home-recent.tsx` — 首頁「知識庫最近更新」卡片
- `ai-log/list.tsx` — AI Log 清單頁（統計卡、篩選、表格、分頁）
- `ai-log/detail.tsx` — AI Log 明細頁（摘要、輸入／回應／解析結果、錯誤訊息、允許的工具、工具呼叫時間軸）
- `bot/index.tsx` — Bot 管理殼頁（平台篩選、六個分頁籤）
- `bot/group-detail.tsx` — Bot 群組明細頁（資訊、最近訊息、刪除）
- `bot/tabs/binding.tsx` — 綁定分頁（Line／Telegram 平台卡）
- `bot/tabs/groups.tsx` — 群組分頁（群組清單、AI 回覆開關、狀態）
- `bot/tabs/users.tsx` — 使用者分頁（使用者清單、CTOS 綁定、封鎖）
- `bot/tabs/blocklist.tsx` — 黑名單分頁（封鎖使用者清單、解除封鎖）
- `bot/tabs/messages.tsx` — 訊息分頁（群組或使用者訊息清單）
- `bot/tabs/files.tsx` — 檔案分頁（檔案清單、下載、刪除）
- `admin/users.tsx` — 使用者管理頁（使用者表格；每列「權限」按鈕開 Sheet，逐一 app／知識庫開關即時 PATCH）

### `src/components/`

UI 元件與版面：

- `app-shell.tsx` — 應用外殼（側邊欄 + 內容區）
- `app-sidebar.tsx` — 側邊欄（導航列表）
- `nav-user.tsx` — 使用者選單（使用者資訊、主題切換與登出）
- `require-auth.tsx` — 驗證防護（檢查登入狀態）
- `require-app.tsx` — 權限防護（`RequireApp` 依 app 權限、`RequireAdmin` 僅管理員；無權時渲染擋下頁而非導頁）
- `theme-provider.tsx` — 主題提供者（深色／淺色切換）
- `ui/` — shadcn/ui 元件（按鈕、卡片、輸入框、模態框等）
- `pagination.tsx` — 分頁元件（上一頁／第 p／P 頁／下一頁，供清單頁重用）
- `kb/attachments.tsx` — 附件清單（上傳、下載、刪除）
- `kb/history-sheet.tsx` — 版本歷史側欄（歷史清單、舊版內容檢視）
- `kb/markdown.tsx` — Markdown 渲染（含圖片路徑改寫）
- `kb/share-dialog.tsx` — 分享連結對話框

### `e2e/`

Playwright 端對端測試：

- `login.spec.ts` — 登入流程測試
- `settings.spec.ts` — 設定頁測試
- `shell.spec.ts` — 應用殼層測試（含首頁知識庫最近更新）
- `kb-list.spec.ts` — 知識庫清單測試
- `kb-detail.spec.ts` — 知識庫閱讀頁測試
- `kb-editor.spec.ts` — 知識庫新增／編輯測試
- `kb-share-history.spec.ts` — 分享連結與版本歷史測試
- `ai-log.spec.ts` — AI Log 清單與明細頁測試
- `permissions.spec.ts` — 依 app 權限顯示側邊欄／擋下受限路由、使用者管理頁切換權限
- `bot-binding-groups.spec.ts` — Bot 綁定與群組清單測試
- `bot-group-detail.spec.ts` — Bot 群組明細測試
- `bot-users-blocklist.spec.ts` — Bot 使用者與黑名單分頁測試
- `bot-messages-files.spec.ts` — Bot 訊息與檔案分頁測試
- `helpers.ts` — 測試輔助函式

## 登入與 Session 管理

### 登入方式

登入頁提供兩個分頁：

1. **NAS 帳號**：傳送 `method: "nas"` 至後端
2. **平台帳號**：傳送 `method: "local"` 至後端

### Token 與使用者快取

登入成功後，前端儲存於 localStorage：

- `ctos-web.token` — 後端 session token（UUID，用於後續 API 請求）
- `ctos-web.user` — 使用者資訊 JSON（顯示名稱、管理員旗標等）
- `ctos-web.theme` — 主題偏好（`"dark"`、`"light"` 或 `"system"`）

### Session 清除

任何 API 回傳 401 Unauthorized 都會清除 session（NAS 綁定密碼錯誤除外）；下一次路由渲染時 `RequireAuth` 判斷沒有 token 或使用者，才導向 `/login`。

### 依 app 權限顯示

`GET /api/user/me` 回傳的 `permissions.apps`（與 `is_admin`）決定側邊欄與路由：`is_admin` 一律放行；否則依 `permissions.apps[app]`（`lib/permissions.ts` 的 `canAccessApp`）。側邊欄（`app-sidebar.tsx`）依此過濾掉沒有權限的模組；路由（`routes.tsx`）用 `RequireApp`（一般 app）與 `RequireAdmin`（僅管理員）包住對應頁面，沒有權限時直接渲染一頁「此功能需要管理員開放」或「此頁只有管理員能使用」＋「回首頁」連結，不是導頁，避免與 `RequireAuth` 互相導頁。管理員可在「使用者管理」（`/admin/users`）頁調整每個使用者的 app 與知識庫權限。

## 模組現況

### 已完成

- **登入** — 支援 NAS 帳號與平台帳號兩種方式
- **側邊欄與版面** — 響應式設計，支援深色／淺色主題（於側邊欄使用者選單切換）
- **首頁** — 個人化問候訊息，另有知識庫「最近更新」卡片
- **設定頁** — 帳號資訊、NAS 帳號綁定／解綁
- **知識庫** — 路由 `/kb`，清單搜尋、閱讀附件、新增編輯、刪除、分享連結、版本歷史；首頁多「最近更新」
- **AI Log** — 路由 `/ai-log`，已完成（統計、篩選、分頁、明細）
- **使用者管理** — 路由 `/admin/users`（僅管理員），使用者清單與每人的 app／知識庫權限開關（PATCH 只送變動的鍵，即時生效）
- **Bot 管理** — 路由 `/bot`，六個分頁（綁定、群組含明細與最近訊息、使用者、黑名單、訊息、檔案），照舊桌面範圍；專案綁定選單待專案模組

### 尚未完成

以下模組顯示空頁並提供連結回舊桌面（https://ching-tech.ddns.net/ctos/）：

- **專案** — 路由 `/projects`

## 相關文件

設計文件位於 `ching-tech-os` 儲存庫：

- **設計規格** — `docs/superpowers/specs/2026-09-10-ctos-web-react-frontend-design.md`
- **實作計劃** — `docs/superpowers/plans/2026-09-11-ctos-web-skeleton.md`

## 授權

MIT License — 詳見 `LICENSE` 檔案。
