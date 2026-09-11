# ChingTech OS 新前端

ChingTech OS 新前端（React），擎添工業內部系統的 Web 介面。後端程式在 [ching-tech-os](https://github.com/yazelin/ching-tech-os) 儲存庫（FastAPI）。線上網址為 [https://os.ching-tech.com](https://os.ching-tech.com)（GitHub Pages，自訂網域）。

## 技術棧

- **架構**：Vite 8、React 19、TypeScript 6
- **樣式**：Tailwind CSS 4、shadcn/ui（Radix 版 preset nova）、Lucide React 圖示
- **路由**：React Router 7
- **資料**：@tanstack/react-query 5（伺服器狀態快取）
- **Markdown**：react-markdown 10、remark-gfm 4（知識庫內容與 AI 助手回覆渲染）
- **即時通訊**：socket.io-client 4（AI 助手對話，對應後端 python-socketio 5）
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

測試檔在 `e2e/` 目錄，其中知識庫相關的四支：`kb-list.spec.ts`（清單搜尋與篩選）、`kb-detail.spec.ts`（閱讀、附件、刪除）、`kb-editor.spec.ts`（新增／編輯）、`kb-share-history.spec.ts`（分享連結與版本歷史）；另有 `ai-log.spec.ts`（統計卡、篩選、分頁、明細頁）與 `assistant.spec.ts`（AI 助手）。Playwright 設定包含兩個 project：
- **desktop**：Desktop Chrome
- **mobile**：iPhone 13（Chromium）

測試使用 `page.route()` 攔截 API，不打真後端。

AI 助手的 Socket.IO 也不連真後端：Playwright 的 webServer 跑的是 `npm run build:e2e`（帶 `VITE_E2E=1`，輸出到 `dist-e2e/`）加 `npm run preview:e2e`，這時 `src/lib/socket.ts` 換成假 socket，把送出的事件記進 `window.__sentEvents`，並開 `window.__CTOS_SOCKET_MOCK__.receive(event, payload)` 讓測試模擬後端推事件。正式 `npm run build` 沒有這個旗標，假 socket 整段會被 tree-shake 掉；輸出目錄分開，跑 e2e 不會把 `dist/` 蓋成假 socket 版。

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
- `assistant.ts` — AI 助手 API 客戶端（對話 CRUD、Socket.IO 事件型別、訊息過濾與時間標籤、query key）
- `assistant.test.ts` — AI 助手 API 與事件處理單元測試
- `socket.ts` — Socket.IO 單例客戶端（握手帶 `auth.token`、`clearSession` 時斷線；e2e build 換成假 socket）
- `bot.ts` — Bot 管理 API 客戶端（綁定狀態、群組、使用者、黑名單、訊息、檔案；分頁與檔案下載 Helper）
- `bot.test.ts` — Bot API 單元測試
- `permissions.ts` — `canAccessApp`（依 `is_admin` 與 `permissions.apps` 判斷是否有權限使用某 app）
- `permissions.test.ts` — 權限判斷單元測試
- `admin.ts` — 管理員 API 客戶端（使用者清單、預設權限、更新使用者權限、query key）
- `admin.test.ts` — 管理員 API 單元測試
- `projects.ts` — 專案 API 客戶端（清單／明細／主檔／成員／里程碑／任務／dashboard 摘要；狀態中文與 tint 對照、`canEditProject`、query key）
- `projects.test.ts` — 專案權限與對照表單元測試
- `erp.ts` — 往來與物料模組 API 客戶端（往來對象清單／明細／主檔／合併／聯絡人／地址；角色與採購單狀態的中文與 tint 對照、別名解析、Decimal 金額格式化、`erpKeys`）
- `erp.test.ts` — 往來對象對照表、別名解析與金額格式化單元測試
- `users.ts` — 使用者選單（`GET /api/user/list`，登入即可讀，供負責人與成員下拉用）

### `src/pages/`

各頁面元件：

- `login.tsx` — 登入頁（NAS 帳號 vs 平台帳號兩分頁）
- `home.tsx` — 首頁（個人化問候，掛載「今日 AI 用量」「Bot 概況」「知識庫最近更新」卡片，各依 app 權限顯示）
- `home/ai-usage-card.tsx` — 首頁「今日 AI 用量」卡片（依本地今天日期查 stats：呼叫次數／成功率／平均耗時／Token 進出）
- `home/bot-summary-card.tsx` — 首頁「Bot 概況」卡片（群組數／黑名單數／我的 Line／Telegram 綁定狀態）
- `settings.tsx` — 設定頁（帳號資訊、NAS 綁定／解綁）
- `kb/list.tsx` — 知識庫清單頁（搜尋、scope／type／category 篩選、URL 同步）
- `kb/detail.tsx` — 知識庫閱讀頁（Markdown 渲染、附件、metadata、刪除）
- `kb/editor.tsx` — 知識庫新增／編輯頁（共用表單、預覽、只送變動欄位）
- `kb/home-recent.tsx` — 首頁「知識庫最近更新」卡片
- `assistant/index.tsx` — AI 助手頁（對話清單、訊息串、輸入區、連線狀態、Agent 選單、壓縮）
- `assistant/chat-list.tsx` — 對話清單（新對話、重新命名、刪除；手機收進抽屜）
- `assistant/message-list.tsx` — 訊息串（使用者／助手氣泡、Markdown、摺疊的工具時間軸）
- `ai-log/list.tsx` — AI Log 清單頁（統計卡、篩選、表格、分頁）
- `ai-log/detail.tsx` — AI Log 明細頁（摘要、輸入／回應／解析結果、錯誤訊息、允許的工具、工具呼叫時間軸）
- `bot/index.tsx` — Bot 管理殼頁（平台篩選、六個分頁籤）
- `bot/group-detail.tsx` — Bot 群組明細頁（資訊、最近訊息、刪除）
- `bot/group-filter.tsx` — 群組篩選下拉共用元件（訊息／檔案分頁共用）
- `bot/tabs/binding.tsx` — 綁定分頁（Line／Telegram 平台卡）
- `bot/tabs/groups.tsx` — 群組分頁（群組清單、AI 回覆開關、狀態）
- `bot/tabs/users.tsx` — 使用者分頁（使用者清單、CTOS 綁定、封鎖）
- `bot/tabs/blocklist.tsx` — 黑名單分頁（封鎖使用者清單、解除封鎖）
- `bot/tabs/messages.tsx` — 訊息分頁（群組或使用者訊息清單、對話篩選）
- `bot/tabs/files.tsx` — 檔案分頁（檔案清單、下載、刪除、群組與類型篩選、NAS／已過期狀態）
- `projects/list.tsx` — 專案清單頁（狀態篩選、搜尋、分頁；桌面表格、手機卡片；逾期里程碑數標紅；admin 才有新增）
- `projects/editor.tsx` — 專案新增／編輯頁（名稱、客戶、狀態、負責人選單、起迄日、描述；新增限 admin，編輯限 admin 或成員）
- `projects/detail.tsx` — 專案明細頁（主檔與進度表頭、刪除、五個分頁籤，tab 寫進網址）
- `projects/tabs/overview.tsx` — 總覽分頁（里程碑清單、逾期標紅、一鍵完成、新增里程碑對話框、描述全文）
- `projects/tabs/tasks.tsx` — 任務分頁（待辦／進行中／已完成三欄、行內改狀態、刪除、新增任務對話框）
- `projects/tabs/members.tsx` — 成員分頁（成員清單與角色、加入成員選單、移除；負責人不給移除）
- `projects/tabs/knowledge.tsx` — 知識庫分頁（`scope=project` 的條目清單、新增條目帶 `project_id`）
- `projects/tabs/groups.tsx` — 群組分頁（綁定的 Bot 群組，連到群組明細）
- `parties/list.tsx` — 往來對象清單頁（搜尋、角色篩選、分頁；桌面表格、手機卡片；供應商／客戶兩個 tint badge 可同時出現）
- `parties/editor.tsx` — 往來對象新增／編輯頁（名稱、簡稱、別名以逗號分隔、供應商／客戶開關、統編、產業、付款條件、備註；新增時可一併帶一筆主要聯絡人與地址）
- `parties/detail.tsx` — 往來對象明細頁（主檔與別名 chips 表頭，「問 AI」「編輯」「合併」「刪除」，五個分頁籤 tab 寫進網址）
- `parties/tabs/contacts.tsx` — 聯絡人分頁（清單與主要標記、新增聯絡人對話框）
- `parties/tabs/addresses.tsx` — 地址分頁（清單與主要標記、新增地址對話框）
- `parties/tabs/purchase-orders.tsx` — 採購單分頁（最近十筆，狀態 badge 與金額，連 `/purchase-orders/:id`）
- `parties/tabs/projects.tsx` — 專案分頁（採購單掛到的專案，連 `/projects/:id`）
- `parties/tabs/knowledge.tsx` — 知識庫分頁（`knowledge_count` 與用名稱當關鍵字的知識庫入口）
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
- `ai-log/tool-calls.tsx` — 工具呼叫時間軸（AI Log 明細頁與 AI 助手共用）
- `kb/attachments.tsx` — 附件清單（上傳、下載、刪除）
- `kb/history-sheet.tsx` — 版本歷史側欄（歷史清單、舊版內容檢視）
- `kb/markdown.tsx` — Markdown 渲染（含圖片路徑改寫）
- `kb/share-dialog.tsx` — 分享連結對話框
- `parties/role-badges.tsx` — 往來對象角色 badge（供應商／客戶可同時出現，都沒有時顯示破折號）
- `parties/merge-dialog.tsx` — 合併對話框（搜尋挑另一筆、選保留哪一筆，送 `{keep_id, drop_id}`）

### `e2e/`

Playwright 端對端測試：

- `login.spec.ts` — 登入流程測試
- `settings.spec.ts` — 設定頁測試
- `shell.spec.ts` — 應用殼層測試（含首頁知識庫最近更新）
- `home.spec.ts` — 首頁 dashboard 測試（今日 AI 用量／Bot 概況卡片依權限顯示、統計數字、stats 請求帶 `start_date`）
- `kb-list.spec.ts` — 知識庫清單測試
- `kb-detail.spec.ts` — 知識庫閱讀頁測試
- `kb-editor.spec.ts` — 知識庫新增／編輯測試
- `kb-share-history.spec.ts` — 分享連結與版本歷史測試
- `ai-log.spec.ts` — AI Log 清單與明細頁測試
- `assistant.spec.ts` — AI 助手測試（對話清單與新對話、送訊息的 `ai_chat_event` payload、typing／回覆／工具時間軸、錯誤 alert、改名與刪除、`?q=` 預填、斷線、權限擋下）
- `permissions.spec.ts` — 依 app 權限顯示側邊欄／擋下受限路由、使用者管理頁切換權限
- `bot-binding-groups.spec.ts` — Bot 綁定與群組清單測試
- `bot-group-detail.spec.ts` — Bot 群組明細測試
- `bot-users-blocklist.spec.ts` — Bot 使用者與黑名單分頁測試
- `bot-messages-files.spec.ts` — Bot 訊息與檔案分頁測試
- `projects.spec.ts` — 專案清單／明細五分頁／新增編輯／權限擋下／知識庫編輯器專案入口測試
- `parties.spec.ts` — 往來對象清單／明細五分頁／新增編輯／合併／權限擋下測試
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
- **首頁** — 個人化問候訊息；「今日 AI 用量」（依 `ai-log` 權限）、「Bot 概況」（依 `linebot` 權限）、「進行中專案」與「逾期里程碑」（依 `project-management` 權限）與知識庫「最近更新」卡片，各卡各自 loading／錯誤狀態，一張失敗不影響其他卡片
- **設定頁** — 帳號資訊、NAS 帳號綁定／解綁
- **知識庫** — 路由 `/kb`，清單搜尋、閱讀附件、新增編輯、刪除、分享連結、版本歷史；首頁多「最近更新」
- **AI 助手** — 路由 `/assistant`（需 `ai-assistant` 權限，頁面走 `lazy()` 分開載入，socket.io-client 不進主 bundle）。左欄對話清單（新對話、重新命名、刪除確認，手機收成抽屜），主區訊息串（助手回覆用 Markdown 渲染，工具呼叫用 AI Log 同一支時間軸元件摺疊顯示），底部輸入區（Enter 送出、Shift+Enter 換行、Agent 選單、壓縮鈕）。對話走 REST（`/api/ai/chats`），送訊息與收回覆走 Socket.IO（`ai_chat_event`／`ai_typing`／`ai_response`／`ai_error`），握手帶 `auth.token`，token 失效時照既有流程清掉 session。右上角有連線狀態，斷線時輸入停用。網址帶 `?chat=` 指定對話、`?q=` 預填輸入框
- **AI Log** — 路由 `/ai-log`，已完成（統計、篩選、分頁、明細、依使用者篩選）
- **使用者管理** — 路由 `/admin/users`（僅管理員），使用者清單與每人的 app／知識庫權限開關（PATCH 只送變動的鍵，即時生效）
- **Bot 管理** — 路由 `/bot`，六個分頁（綁定、群組含明細與最近訊息、使用者、黑名單、訊息、檔案），照舊桌面範圍；訊息／檔案分頁已補回舊桌面的群組篩選、檔案 NAS／已過期狀態；群組明細的「綁定專案」下拉照舊桌面補回：選項為專案清單（已完成／已取消排在後段並標狀態），第一項「未綁定」，改選送 `POST /bind-project`、選「未綁定」送 `DELETE /bind-project`，成功後顯示目前綁定的專案名並連到 `/projects/:id`；專案清單載入失敗（如無 `project-management` 權限）時下拉停用並提示；群組清單分頁的「專案」欄同步顯示綁定的專案名；圖片預覽已補；其他類型只下載
- **專案** — 路由 `/projects`（需 `project-management` 權限）。清單有狀態篩選、搜尋與分頁，欄位含進度條與逾期里程碑數（大於 0 標紅），手機寬度改卡片；`/projects/new`、`/projects/:id/edit` 是主檔表單（新增限管理員）；`/projects/:id` 明細分五個分頁（總覽的里程碑與描述、任務三欄、成員、知識庫、綁定群組），分頁寫進網址 `?tab=`。編輯類控制只在管理員或該專案成員時顯示，後端回 403 時照既有樣式顯示提示。首頁 dashboard 不在本階段
- **往來對象** — 路由 `/parties`（需 `vendor-management` 權限，預設開放；讀寫同一把權限，進得來就寫得動）。清單一個搜尋框打後端的名稱／簡稱／別名／統編模糊搜尋，角色篩選送 `role=supplier|customer`，手機寬度改卡片；`/parties/new`、`/parties/:id/edit` 是主檔表單，新增時可一併帶一筆主要聯絡人與地址（後端 `PartyCreate` 支援）；`/parties/:id` 明細分五個分頁（聯絡人、地址、採購單、專案、知識庫），分頁寫進網址 `?tab=`。表頭有「問 AI」帶 `?q=` 前綴文字開 AI 助手、「合併」對話框（挑保留哪一筆，送 `POST /api/parties/merge`）與軟刪除。聯絡人與地址目前只能新增：後端沒有 `PUT`／`DELETE /{id}/contacts/{cid}` 與 `/addresses/{aid}`，也沒有單獨的「設為主要」端點（新增時帶 `is_primary` 才會把原本的主要降級），所以畫面不放做不到的按鈕。採購單分頁的 `/purchase-orders/:id` 連結先做，頁面在採購單那個 PR 才有

## 相關文件

設計文件位於 `ching-tech-os` 儲存庫：

- **設計規格** — `docs/superpowers/specs/2026-09-10-ctos-web-react-frontend-design.md`
- **實作計劃** — `docs/superpowers/plans/2026-09-11-ctos-web-skeleton.md`

## 授權

MIT License — 詳見 `LICENSE` 檔案。
