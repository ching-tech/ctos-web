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
VITE_NAS_HOST=192.168.x.x
VITE_NAS_SHARE_MOUNTS=/共享資料夾/子目錄=/mnt/nas/projects
```

- **正式機**（預設）：`https://ching-tech.ddns.net/ctos`
- **本機後端**：改成 `http://127.0.0.1:8088`
- `VITE_NAS_HOST`：檔案頁（`/files`）連線對話框的 NAS 主機預設值，使用者可以在對話框裡改。後端沒有端點可以拿 `settings.nas_host`，所以由前端的環境變數帶；沒設就是空字串，要自己填。e2e 由 `playwright.config.ts` 的 `webServer.env` 固定成假主機 `nas.test.invalid`。
- `VITE_NAS_SHARE_MOUNTS`：檔案頁「分享連結」用的路徑對照，格式 `<檔案管理器路徑前綴>=<後端掛載點>`，多組用 `;` 分隔。後端 `POST /api/share` 的 `nas_file` 只認得 `/mnt/…`、`/tmp/…` 這種系統路徑或 `shared://`／`ctos://`，SMB 路徑會被 `path_manager` 判成 NAS zone 而拒絕，所以要在這裡把前綴換成掛載點。沒設就不顯示分享連結按鈕；後端沒有端點可以拿這份對照表。

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

### 遇到 flaky 測試怎麼處理（2026-09-12 起的慣例）

不准用「重跑一次就綠了」帶過。順序固定：

1. **先做出可重現的失敗**。單獨重跑通常重現不了，用併發把競態逼出來：`npx playwright test <spec> --repeat-each 40 --workers 10 --project=desktop`，要看到穩定的失敗次數（例如 8／280）才算重現；重現不了就從程式碼推論根因並寫明「本機重現不了」。
2. 找根因，修在元件層（例如 #26：每列各自的 AlertDialog 退場動畫留下 overlay 吃掉下一次點擊）。只有 spec 本身寫錯才改 spec。
3. 用**同一條併發指令**在修後跑一次，要 0 失敗。修前沒有失敗數字，修後的全綠證明不了任何事。
4. PR 描述寫根因兩行、修前／修後的數字。

另外：`playwright.config.ts` 的 preview port 寫死 4173 且 `reuseExistingServer`，兩個 worktree 同時跑會接手對方的 build（#27）。並行跑之前先 `ss -ltn | grep 4173` 確認沒人用。

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
- `auth.ts` — 認證函式（登入、登出、NAS 綁定、變更密碼）
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
- `admin.ts` — 管理員 API 客戶端（使用者清單、預設權限、更新使用者權限、新增使用者、編輯使用者、停用／啟用、重設密碼、清除密碼、刪除、query key）
- `admin.test.ts` — 管理員 API 單元測試
- `projects.ts` — 專案 API 客戶端（清單／明細／主檔／成員／里程碑／任務／dashboard 摘要；狀態中文與 tint 對照、`canEditProject`、query key）
- `projects.test.ts` — 專案權限與對照表單元測試
- `erp.ts` — 往來與物料模組 API 客戶端（往來對象清單／明細／主檔／合併；聯絡人與地址的新增／更新／刪除；物料清單／明細／主檔、倉庫清單與主檔、庫存查詢與調整／調撥；採購單清單／明細／建立／更新／收貨／取消；角色、採購單狀態與庫存異動原因的中文與 tint 對照、別名解析、Decimal 金額與數量格式化、timestamptz 轉本地時間、未收量計算、待收貨排序、`erpKeys`）
- `erp.test.ts` — 往來對象與物料對照表、別名解析、金額與數量格式化、採購單狀態規則與未收量、逾期判斷與待收貨排序單元測試
- `users.ts` — 使用者選單（`GET /api/user/list`，登入即可讀，供負責人與成員下拉用）
- `api-tokens.ts` — 個人存取權杖（PAT）API 客戶端（列表／建立／撤銷、scope 對照 app 名稱、`apiTokenKeys`）
- `api-tokens.test.ts` — PAT API 與 scope 名稱對照單元測試
- `nas.ts` — NAS 檔案 API 客戶端（連線／連線列表／斷線、共享資料夾、瀏覽、搜尋、讀檔與下載、上傳／新資料夾／重新命名／刪除、`nas_file` 分享連結；記憶體連線狀態與 `X-NAS-Token` 注入、連線失效的攔截與重試、路徑與大小時間格式化、分享路徑對照 `toShareResourceId`、`nasKeys`）
- `nas.test.ts` — NAS API 單元測試（每支端點、連線失效攔截與重試、路徑工具、分享路徑對照）

### `src/pages/`

各頁面元件：

- `login.tsx` — 登入頁（NAS 帳號 vs 平台帳號兩分頁）
- `home.tsx` — 首頁（個人化問候，掛載「今日 AI 用量」「Bot 概況」「進行中專案」「逾期里程碑」「採購待收貨」「知識庫最近更新」卡片，各依 app 權限顯示）
- `home/ai-usage-card.tsx` — 首頁「今日 AI 用量」卡片（依本地今天日期查 stats：呼叫次數／成功率／平均耗時／Token 進出）
- `home/bot-summary-card.tsx` — 首頁「Bot 概況」卡片（群組數／黑名單數／我的 Line／Telegram 綁定狀態）
- `home/pending-receipts-card.tsx` — 首頁「採購待收貨」卡片（`ordered` 與 `partial` 的單數，列預計到貨最近的五張，逾期標紅）
- `settings.tsx` — 設定頁（帳號資訊、NAS 綁定／解綁，掛上各區塊元件）
- `settings/api-tokens.tsx` — 設定頁「API 權杖」區塊（清單、建立對話框、一次性權杖畫面、撤銷確認）
- `settings/password.tsx` — 設定頁「密碼」區塊（變更或首次設定平台密碼）
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
- `parties/list.tsx` — 往來對象清單頁（搜尋、角色篩選含「供應商且客戶」、分頁；桌面表格、手機卡片；供應商／客戶兩個 tint badge 可同時出現）
- `parties/editor.tsx` — 往來對象新增／編輯頁（名稱、簡稱、別名以逗號分隔、供應商／客戶開關、統編、產業、付款條件、備註；新增時可一併帶一筆主要聯絡人與地址）
- `parties/detail.tsx` — 往來對象明細頁（主檔與別名 chips 表頭，「問 AI」「編輯」「合併」「刪除」，五個分頁籤 tab 寫進網址）
- `parties/tabs/contacts.tsx` — 聯絡人分頁（清單與主要標記、新增／編輯對話框、刪除確認、設為主要）
- `parties/tabs/addresses.tsx` — 地址分頁（清單與主要標記、新增／編輯對話框、刪除確認、設為主要）
- `parties/tabs/purchase-orders.tsx` — 採購單分頁（最近十筆，狀態 badge 與金額，連 `/purchase-orders/:id`）
- `parties/tabs/projects.tsx` — 專案分頁（採購單掛到的專案，連 `/projects/:id`）
- `parties/tabs/knowledge.tsx` — 知識庫分頁（`knowledge_count` 與用名稱當關鍵字的知識庫入口）
- `items/list.tsx` — 物料清單頁（搜尋料號／品名／規格／別名、分類篩選、分頁；桌面表格、手機卡片；總庫存欄與預設供應商連結）
- `items/editor.tsx` — 物料新增／編輯頁（料號、品名、規格、單位、分類、預設供應商下拉、採購價、交期天數、別名、備註；料號撞名的 400 原樣顯示）
- `items/detail.tsx` — 物料明細頁（料號與品名表頭、別名 chips，「問 AI」「編輯」「刪除物料」，庫存與異動兩個分頁籤 tab 寫進網址）
- `items/tabs/stock.tsx` — 庫存分頁（各倉餘額表、總庫存、「調整」與「調撥」對話框）
- `items/tabs/movements.tsx` — 異動分頁（最近二十筆異動，原因 badge 與增減數量）
- `warehouses/list.tsx` — 倉庫頁（清單、新增／編輯對話框；不佔側邊欄，從物料清單的「倉庫」進去）
- `purchase-orders/list.tsx` — 採購單清單頁（狀態／供應商／專案三個篩選、分頁；桌面表格、手機卡片；單號連明細、供應商連往來對象）
- `purchase-orders/editor.tsx` — 採購單新增／編輯頁（新增是單頭＋可增列的行項表格，編輯只改單頭；狀態只收草稿與已下單）
- `purchase-orders/detail.tsx` — 採購單明細頁（表頭主檔與狀態 badge，「問 AI」「編輯」「收貨」「取消採購單」；行項表含已收與未收）
- `purchase-orders/receive-dialog.tsx` — 收貨對話框（入庫倉下拉、每行一個本次收貨數量、「送出收貨」與「全部收貨」）
- `files/index.tsx` — 檔案頁（麵包屑、共享資料夾與資料夾瀏覽、目前路徑搜尋、預覽面板、連線資訊與連線對話框、上傳與新資料夾工具列、每列的動作選單；`?path=` 與 `?q=` 寫進網址）
- `admin/users.tsx` — 使用者管理頁（使用者表格與「新增使用者」對話框；每列「權限」按鈕開 Sheet，逐一 app／知識庫開關即時 PATCH；每列「動作」選單含編輯、停用／啟用、重設密碼、清除密碼、刪除）

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
- `share-dialog.tsx` — 分享連結對話框（知識庫與 NAS 檔案共用，差別只在 `createLink` 與 `ariaLabel`）
- `files/connect-dialog.tsx` — NAS 連線對話框（主機、帳號、密碼；後端的錯誤訊息原樣顯示）
- `files/preview-panel.tsx` — 檔案預覽面板（圖片、PDF、文字；其他類型只給下載）
- `files/download-button.tsx` — NAS 檔案下載鈕（header 取 blob 再存檔）
- `files/toolbar.tsx` — 檔案頁工具列（多檔上傳、新資料夾）
- `files/row-actions.tsx` — 每列的動作選單（重新命名、刪除含遞迴、分享連結）
- `parties/role-badges.tsx` — 往來對象角色 badge（供應商／客戶可同時出現，都沒有時顯示破折號）
- `parties/merge-dialog.tsx` — 合併對話框（debounce 搜尋挑另一筆、選保留哪一筆，送 `{keep_id, drop_id}`；候選只列第一頁並提示）

### `e2e/`

Playwright 端對端測試：

- `login.spec.ts` — 登入流程測試
- `settings.spec.ts` — 設定頁測試
- `settings-tokens.spec.ts` — 設定頁「API 權杖」測試（清單、建立與一次性權杖、撤銷確認、PAT session 的 403）
- `settings-password.spec.ts` — 設定頁「密碼」測試（成功、目前密碼錯、兩次不一致前端擋、NAS 使用者沒有目前密碼欄）
- `shell.spec.ts` — 應用殼層測試（含首頁知識庫最近更新）
- `home.spec.ts` — 首頁 dashboard 測試（今日 AI 用量／Bot 概況卡片依權限顯示、統計數字、stats 請求帶 `start_date`）
- `kb-list.spec.ts` — 知識庫清單測試
- `kb-detail.spec.ts` — 知識庫閱讀頁測試
- `kb-editor.spec.ts` — 知識庫新增／編輯測試
- `kb-share-history.spec.ts` — 分享連結與版本歷史測試
- `ai-log.spec.ts` — AI Log 清單與明細頁測試
- `assistant.spec.ts` — AI 助手測試（對話清單與新對話、送訊息的 `ai_chat_event` payload、typing／回覆／工具時間軸、錯誤 alert、改名與刪除、`?q=` 預填、斷線、權限擋下）
- `permissions.spec.ts` — 依 app 權限顯示側邊欄／擋下受限路由、使用者管理頁切換權限
- `admin-users.spec.ts` — 使用者管理的管理員動作（新增、400 detail、停用自己被前端擋下、編輯、停用別人、重設密碼、清除密碼、刪除、停用者淡化）
- `bot-binding-groups.spec.ts` — Bot 綁定與群組清單測試
- `bot-group-detail.spec.ts` — Bot 群組明細測試
- `bot-users-blocklist.spec.ts` — Bot 使用者與黑名單分頁測試
- `bot-messages-files.spec.ts` — Bot 訊息與檔案分頁測試
- `projects.spec.ts` — 專案清單／明細五分頁／新增編輯／權限擋下／知識庫編輯器專案入口測試
- `parties.spec.ts` — 往來對象清單／明細五分頁／新增編輯／合併／權限擋下測試
- `items.spec.ts` — 物料清單／明細庫存與異動兩分頁／調整與調撥／新增編輯／倉庫頁／權限擋下測試
- `purchasing.spec.ts` — 採購單清單篩選／新增行項／明細收貨與取消／首頁待收貨卡／權限擋下測試
- `files.spec.ts` — 檔案頁測試（空狀態與連線、沿用既有連線、連線失敗訊息、瀏覽與麵包屑、搜尋、預覽、連線過期自動重連重試、中斷、權限擋下；上傳、新資料夾、重新命名含 409、刪除含遞迴、分享連結的權限與 `resource_id`）
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
- **首頁** — 個人化問候訊息；「今日 AI 用量」（依 `ai-log` 權限）、「Bot 概況」（依 `linebot` 權限）、「進行中專案」與「逾期里程碑」（依 `project-management` 權限）、「採購待收貨」（依 `inventory-management` 權限）與知識庫「最近更新」卡片，各卡各自 loading／錯誤狀態，一張失敗不影響其他卡片
- **設定頁** — 帳號資訊、NAS 帳號綁定／解綁；「密碼」區塊變更或首次設定平台密碼（`POST /api/auth/change-password`）。已有平台密碼的人要填目前密碼，NAS 認證、還沒設密碼的人（`has_password` 為 false）沒有這一欄，改成提示設定後兩種都能登。這支端點**失敗也回 200**，只有 body 的 `success` 與 `error` 會變，前端照 body 判斷而不是看狀態碼；強度規則留在後端，前端只擋「兩次一致」與最少 8 碼。改完密碼**不會**讓其他裝置的 session 或 API 權杖失效。「API 權杖」區塊管理 `ctos` CLI 與自動化工具用的 PAT（`/api/auth/tokens`）：清單列名稱、範圍、唯讀／可寫、到期、最後使用與建立時間，建立對話框可挑範圍（不勾＝不限縮，拿使用者當下全部 app 權限）、有效天數（預設 180 天，可選永不過期）與唯讀開關，建立成功後一次性顯示原始權杖與 `export CTOS_TOKEN=` 用法，勾了「已保存」才關得掉，關掉就再也拿不到；撤銷有確認對話框。以 PAT 換來的 session 不能建立或撤銷權杖，後端 403 的 detail 原樣顯示
- **知識庫** — 路由 `/kb`，清單搜尋、閱讀附件、新增編輯、刪除、分享連結、版本歷史；首頁多「最近更新」
- **AI 助手** — 路由 `/assistant`（需 `ai-assistant` 權限，頁面走 `lazy()` 分開載入，socket.io-client 不進主 bundle）。左欄對話清單（新對話、重新命名、刪除確認，手機收成抽屜），主區訊息串（助手回覆用 Markdown 渲染，工具呼叫用 AI Log 同一支時間軸元件摺疊顯示），底部輸入區（Enter 送出、Shift+Enter 換行、Agent 選單、壓縮鈕）。對話走 REST（`/api/ai/chats`），送訊息與收回覆走 Socket.IO（`ai_chat_event`／`ai_typing`／`ai_response`／`ai_error`），握手帶 `auth.token`，token 失效時照既有流程清掉 session。右上角有連線狀態，斷線時輸入停用。網址帶 `?chat=` 指定對話、`?q=` 預填輸入框
- **檔案** — 路由 `/files`（需 `file-manager` 權限，預設開放）。進頁面先打 `GET /api/nas/connections`，有現成連線就沿用第一筆，沒有才開連線對話框（主機預設值來自 `VITE_NAS_HOST`）。連線 token 只放記憶體（後端 30 分鐘，操作會自動延長），不進 localStorage。之後每支 NAS 端點都帶 `X-NAS-Token`，缺連線或過期時 `lib/nas.ts` 的 fetch 包裝層攔下來，清掉連線、開對話框，連好再把原請求重試一次。根目錄列的是共享資料夾（`GET /api/nas/shares`，`browse?path=/` 後端會回 400），往下是 `GET /api/nas/browse`；桌面表格、手機卡片，`?path=` 寫進網址，重新整理停在同一層。搜尋只在共享資料夾底下可用（後端 `_parse_path` 不接受空路徑），結果的 `path` 後端不含 share 名稱，前端接回去才點得進。圖片、PDF 與文字（txt／md／csv／json／log）在預覽面板顯示，其他類型只給下載；預覽與下載都用 header 取 blob，NAS token 不進網址。工具列有「上傳」（多檔，逐檔送，做完重抓清單）與「新資料夾」，每一列的「動作」選單有重新命名、刪除（資料夾多一個遞迴勾選，後端沒勾會回 400）與分享連結；這些寫入類動作只在共享資料夾底下的瀏覽清單出現（根目錄列的是 share，後端 `_parse_path` 不接受空路徑；搜尋結果跨資料夾，改完要重抓的不是同一份清單）。分享連結要 `share-manager` 權限（後端預設關閉）而且檔案要落在 `VITE_NAS_SHARE_MOUNTS` 設定的前綴底下：`POST /api/share` 的 `nas_file` 會把 `resource_id` 丟給 `validate_nas_file_path()`，檔案管理器的 SMB 路徑（以 `/` 開頭但不是 `/tmp/`、`/mnt/`）會被 `path_manager` 判成 NAS zone 直接拒絕，所以要先換成掛載點路徑

- **AI Log** — 路由 `/ai-log`，已完成（統計、篩選、分頁、明細、依使用者篩選）
- **使用者管理** — 路由 `/admin/users`（僅管理員）。清單有帳號、顯示名稱、角色、狀態、密碼（已設定／NAS）、最後登入，停用的使用者整列淡化。每列「權限」按鈕開 Sheet 調 app／知識庫權限（PATCH 只送變動的鍵，即時生效）；每列「動作」選單有編輯（顯示名稱、Email、角色）、停用／啟用、重設密碼、清除密碼與刪除，清除密碼與刪除各有確認對話框。清單上方的「新增使用者」對話框收帳號、密碼、顯示名稱與角色，後端一律把新帳號設成 `must_change_password=true`，成功後提示首次登入需改密碼。後端擋自己的四條（降級、停用、清除密碼、刪除）在自己那一列直接停用選項並寫出原因，不等 400。其餘 400 的 `detail` 原樣顯示。編輯表單的 Email 留空代表不變更：清單端點 `AdminUserInfo` 沒有回 email，後端 `update_user_info` 也只有收到 `None` 才跳過該欄
- **Bot 管理** — 路由 `/bot`，六個分頁（綁定、群組含明細與最近訊息、使用者、黑名單、訊息、檔案），照舊桌面範圍；訊息／檔案分頁已補回舊桌面的群組篩選、檔案 NAS／已過期狀態；群組明細的「綁定專案」下拉照舊桌面補回：選項為專案清單（已完成／已取消排在後段並標狀態），第一項「未綁定」，改選送 `POST /bind-project`、選「未綁定」送 `DELETE /bind-project`，成功後顯示目前綁定的專案名並連到 `/projects/:id`；專案清單載入失敗（如無 `project-management` 權限）時下拉停用並提示；群組清單分頁的「專案」欄同步顯示綁定的專案名；圖片預覽已補；其他類型只下載
- **專案** — 路由 `/projects`（需 `project-management` 權限）。清單有狀態篩選、搜尋與分頁，欄位含進度條與逾期里程碑數（大於 0 標紅），手機寬度改卡片；`/projects/new`、`/projects/:id/edit` 是主檔表單（新增限管理員）；`/projects/:id` 明細分五個分頁（總覽的里程碑與描述、任務三欄、成員、知識庫、綁定群組），分頁寫進網址 `?tab=`。編輯類控制只在管理員或該專案成員時顯示，後端回 403 時照既有樣式顯示提示。首頁 dashboard 不在本階段
- **往來對象** — 路由 `/parties`（需 `vendor-management` 權限，預設開放；讀寫同一把權限，進得來就寫得動）。清單一個搜尋框打後端的名稱／簡稱／別名／統編／聯絡人姓名（模糊）與電話／手機（等值）搜尋，角色篩選送 `role=supplier|customer|both`，手機寬度改卡片；`/parties/new`、`/parties/:id/edit` 是主檔表單，新增時可一併帶一筆主要聯絡人與地址（後端 `PartyCreate` 支援）；`/parties/:id` 明細分五個分頁（聯絡人、地址、採購單、專案、知識庫），分頁寫進網址 `?tab=`。聯絡人與地址可以新增、編輯、刪除與「設為主要」（`is_primary=true` 由後端把同一家其他筆降級；刪除是硬刪除，刪掉主要那筆不自動指派新主要）。表頭有「問 AI」帶 `?q=` 前綴文字開 AI 助手、「合併」對話框（挑保留哪一筆，送 `POST /api/parties/merge`，後端角色取 OR、統編取 COALESCE、drop 的名稱與簡稱併進別名）與軟刪除。採購單分頁的 `/purchase-orders/:id` 連結先做，頁面在採購單那個 PR 才有
- **物料庫存** — 路由 `/items`（需 `inventory-management` 權限，預設開放；讀寫同一把權限，進得來就寫得動）。清單一個搜尋框打後端的料號／品名／規格／別名（都是 ILIKE），分類篩選送 `item_group`（等值比對，選項從當頁清單資料收集），欄位含預設供應商連結與各倉合計的總庫存，手機寬度改卡片；`/items/new`、`/items/:id/edit` 是主檔表單，預設供應商下拉打 `/api/parties?role=supplier&page_size=100`（後端 `list_parties` 的參數是 `role`，沒有 `is_supplier`），沒有 `vendor-management` 權限時下拉停用並提示；`/items/:id` 明細分庫存與異動兩個分頁，分頁寫進網址 `?tab=`。庫存分頁有各倉餘額表與「調整」（送 `POST /api/stock/adjust`，`reason` 固定 `adjust`，數量可正可負）、「調撥」（送 `POST /api/stock/transfer`）兩個對話框，後端擋下的負庫存、同倉調撥與非正數調撥都把 400 的 detail 原樣顯示；異動分頁列後端回的最近二十筆，原因用 tint badge。倉庫在 `/warehouses`，從物料清單的「倉庫」按鈕進去，不佔側邊欄，可新增與編輯，代碼撞名的 400 原樣顯示。數量欄位後端是 `Numeric(18,4)`，序列化成帶四位小數的字串，畫面上收掉尾數但保留真的有值的小數
- **採購單** — 路由 `/purchase-orders`（需 `inventory-management` 權限，側邊欄排在物料庫存之後）。清單有狀態、供應商與專案三個篩選（都寫進網址），欄位含單號、供應商連結、專案、狀態 badge、下單日、預計到貨、行項數與金額，手機寬度改卡片；`/purchase-orders/new` 是單頭加一張可增列的行項表格（物料下拉打 `/api/items?page_size=100`，上面一個搜尋框把 `q` 帶給後端），單號由後端在同一交易產生（`PO-YYYYMM-NNN`）不用自己填；`/purchase-orders/:id/edit` 只改單頭（後端的 `PurchaseOrderUpdate` 沒有行項），狀態只收草稿與已下單。`/purchase-orders/:id` 明細有表頭主檔、「問 AI」與行項表（數量、單價、已收、未收）。收貨對話框每一行預設帶出全部未收量可改，填 0 的行這次不收，送 `POST /{id}/receive` 的 `{lines: [{line_id, qty}], warehouse_id}`；行項的 key 是 `line_id` 不是 `item_id`（同一張單可以有兩行同一個物料）；「全部收貨」送 `ReceiveRequest` 的 `all: true`。超收、倉別沒指定、已結案的單不能收貨，這些 400 都把 detail 原樣顯示。「取消採購單」有確認對話框，已收過貨的單後端會擋下來。已收貨與已取消的單不出現編輯、收貨與取消；部分到貨的單可以收貨與取消，但**不能編輯單頭**（`PurchaseOrderUpdate` 的 `status` 只收草稿與已下單，編輯頁一送出就會把狀態壓回已下單），直接打 `/purchase-orders/:id/edit` 也會被導回明細。清單端點只回 `line_count` 與 `total_amount`，沒有行項數量彙總，所以清單那一欄放的是行項數

## 相關文件

設計文件位於 `ching-tech-os` 儲存庫：

- **設計規格** — `docs/superpowers/specs/2026-09-10-ctos-web-react-frontend-design.md`
- **實作計劃** — `docs/superpowers/plans/2026-09-11-ctos-web-skeleton.md`

## 授權

MIT License — 詳見 `LICENSE` 檔案。
