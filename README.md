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
- `preferences.ts` — 偏好設定 API 客戶端（`GET`／`PUT /api/user/preferences`，主題只收 dark／light）
- `preferences.test.ts` — 偏好設定 API 單元測試
- `theme-preference.tsx` — 把 `ThemeProvider` 的主題接到後端偏好（登入後拿一次、切換時 PUT、400 退回原值）
- `utils.ts` — 工具函式
- `kb.ts` — 知識庫 API 客戶端（清單／詳情／建立／編輯／刪除／附件／分享／版本歷史）
- `kb.test.ts` — 知識庫 API 單元測試
- `ai-log.ts` — AI Log API 客戶端（清單／統計／詳情／篩選轉換／query key）
- `assistant.ts` — AI 助手 API 客戶端（對話 CRUD、Socket.IO 事件型別、訊息過濾與時間標籤、query key）
- `assistant.test.ts` — AI 助手 API 與事件處理單元測試
- `socket.ts` — Socket.IO 單例客戶端（握手帶 `auth.token`、`clearSession` 時斷線；e2e build 換成假 socket）
- `bot.ts` — Bot 管理 API 客戶端（綁定狀態、群組、使用者、黑名單、訊息、檔案；分頁與檔案下載 Helper）
- `bot.test.ts` — Bot API 單元測試
- `bot-settings.ts` — Bot 平台設定 API 客戶端（狀態、更新憑證、清除、測試連線；欄位／來源文案、PUT 只送有值的欄位、query key）
- `bot-settings.test.ts` — Bot 平台設定 API 單元測試
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
- `memory.ts` — Bot 記憶 API 客戶端（群組／個人記憶清單與新增、更新、刪除；`memoryKeys`）
- `memory.test.ts` — 記憶 API 單元測試（六支端點各一條）
- `share.ts` — 分享連結管理 API 客戶端（清單 `view=mine｜all`、撤銷、資源類型中文對照、標題與落點連結、`shareKeys`；建立仍在 `kb.ts` 與 `nas.ts`）
- `share.test.ts` — 分享連結 API 單元測試（view 參數、204 撤銷、token encode、403 detail、類型對照與標題規則）
- `messages.ts` — 訊息中心 API 客戶端（清單／明細／未讀數／標已讀，篩選轉 query 含重複帶的陣列參數、嚴重程度與來源標籤與配色；`messageKeys`）
- `messages.test.ts` — 訊息中心 API 單元測試（四支端點各一條，含陣列參數與日期邊界）
- `scheduler.ts` — 排程 API 客戶端（清單／單筆／建立／更新／刪除／啟停用／立即執行七支端點，外加下拉用的最小 skill 清單；觸發與執行器顯示文字、只送變動欄位的 diff、JSON 輸入驗證、`schedulerKeys`）
- `scheduler.test.ts` — 排程 API 單元測試（七支端點各一條，加 cron／interval 顯示文字、靜態排程多回的 `second`、diff 與 JSON 驗證）
- `voice.ts` — 語音設定 API 客戶端（語音角色與 `config_schema`、可用範圍、取得／儲存／清除設定、試聽取 Blob；`voiceKeys`）
- `voice.test.ts` — 語音設定 API 單元測試（六支端點各一條，含 403 與試聽的 429／503）
- `config-apps.ts` — `GET /api/config/apps`（啟用模組宣告的 app 清單，**回裸陣列**且不需認證；含 extends 與 skill 貢獻的 app）
- `skills.ts` — Skills API 客戶端（清單、明細、更新、移除、重新載入、Hub 的 sources／search／inspect／install、檔案與 reference 讀取；`requiredApps` 正規化與 `skillUpdatePatch` 只算變動欄位、`skillKeys`）
- `skills.test.ts` — Skills API 單元測試（每支端點各一條、patch 的四種情況、`requires_app` 正規化、400／404／409 的 detail）

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
- `settings/preferences.tsx` — 設定頁「偏好」區塊（主題亮色／暗色）
- `settings/voice.tsx` — 設定頁「語音」區塊（引擎與語音角色下拉、依 `config_schema` 動態產的參數欄位、試聽、儲存與清除；管理員多一個套用範圍）
- `kb/list.tsx` — 知識庫清單頁（搜尋、scope／type／category 篩選、URL 同步）
- `kb/detail.tsx` — 知識庫閱讀頁（Markdown 渲染、附件、metadata、刪除）
- `kb/editor.tsx` — 知識庫新增／編輯頁（共用表單、預覽、只送變動欄位）
- `kb/home-recent.tsx` — 首頁「知識庫最近更新」卡片
- `assistant/index.tsx` — AI 助手頁（對話清單、訊息串、輸入區、連線狀態、Agent 選單、壓縮）
- `assistant/chat-list.tsx` — 對話清單（新對話、重新命名、刪除；手機收進抽屜）
- `assistant/message-list.tsx` — 訊息串（使用者／助手氣泡、Markdown、摺疊的工具時間軸）
- `ai-log/list.tsx` — AI Log 清單頁（統計卡、篩選、表格、分頁）
- `ai-log/detail.tsx` — AI Log 明細頁（摘要、輸入／回應／解析結果、錯誤訊息、允許的工具、工具呼叫時間軸）
- `bot/index.tsx` — Bot 管理殼頁（平台篩選、七個分頁籤；平台設定只有管理員看得到）
- `bot/group-detail.tsx` — Bot 群組明細頁（資訊、最近訊息、刪除）
- `bot/group-filter.tsx` — 群組篩選下拉共用元件（訊息／檔案分頁共用）
- `bot/tabs/binding.tsx` — 綁定分頁（Line／Telegram 平台卡）
- `bot/tabs/groups.tsx` — 群組分頁（群組清單、AI 回覆開關、狀態）
- `bot/tabs/users.tsx` — 使用者分頁（使用者清單、CTOS 綁定、封鎖）
- `bot/tabs/blocklist.tsx` — 黑名單分頁（封鎖使用者清單、解除封鎖）
- `bot/tabs/messages.tsx` — 訊息分頁（群組或使用者訊息清單、對話篩選）
- `bot/tabs/files.tsx` — 檔案分頁（檔案清單、下載、刪除、群組與類型篩選、NAS／已過期狀態）
- `bot/tabs/platform-settings.tsx` — 平台設定分頁（僅管理員：Line／Telegram 憑證遮罩狀態與來源、更換欄位、主動推送開關、測試連線、清除資料庫設定）
- `memory/index.tsx` — 記憶管理頁（群組／個人兩分頁、選對象、新增與編輯對話框、刪除確認）
- `memory/target-list.tsx` — 左側對象清單（平台 badge、就地搜尋、翻頁；手機收進抽屜）
- `memory/memory-list.tsx` — 記憶卡片（啟用開關、長內容折疊、建立時間與建立者）
- `messages/list.tsx` — 訊息中心清單頁（多選篩選寫進網址、桌面表格與手機卡片、勾選與全部標已讀、分頁）
- `messages/detail.tsx` — 訊息明細頁（摘要、內容保留換行、附加資料摺疊 `<pre>`、進頁面補標已讀）
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
- `shares/index.tsx` — 分享管理頁（清單、管理員的「只看我的／全部」切換、複製網址、撤銷確認；桌面表格、手機卡片）
- `skills/list.tsx` — Skills 清單頁（就地搜尋、需要的 app badge、工具數、提示詞、來源、模組；「重新載入」與「從 Hub 安裝」；桌面表格、手機卡片）
- `skills/detail.tsx` — Skill 明細頁（提示詞 Markdown、references 點開才讀檔、腳本只列不執行、附帶檔案、`_meta.json` 摺疊、刪除確認；「權限與工具」表單編輯 `requires_app` 多選與工具／MCP servers 標籤）
- `skills/apps.ts` — `requires_app` 的候選 app 與名稱（來源是後端的 `GET /api/config/apps`，另保留後端沒宣告、但 SKILL.md 已經寫了的 id）
- `skills/apps.test.ts` — 候選 app 的單元測試（名稱以後端為準、未知 id 要留住、清單抓不到時的退路）
- `admin/users.tsx` — 使用者管理頁（使用者表格與「新增使用者」對話框；每列「權限」按鈕開 Sheet，逐一 app／知識庫開關即時 PATCH；每列「動作」選單含編輯、停用／啟用、重設密碼、清除密碼、刪除）
- `scheduler/list.tsx` — 排程清單頁（名稱與來源 badge、觸發文字、執行器、啟用開關、下次與上次執行、失敗訊息與連續失敗次數；立即執行、編輯、刪除，確認對話框只掛一個）
- `scheduler/editor.tsx` — 排程新增／編輯頁（觸發類型切換：cron 五欄加常用預設、interval 五個整數；執行器類型切換：agent 下拉加指令、skill／script 連動下拉加 JSON 輸入驗證；通知平台與接收者；編輯只送變動欄位）

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
- `message-bell.tsx` — Header 未讀訊息鈴鐺（輪詢未讀數、>99 顯示 99+、連到未讀清單）
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
- `skills/hub-dialog.tsx` — Hub 安裝對話框（來源下拉、搜尋、結果列的「檢視」與「安裝」確認；雙來源其中一家掛掉時顯示後端的 `errors`）
- `skills/tag-input.tsx` — 標籤編輯器（`allowed_tools` 與 `mcp_servers` 共用；後端寫回 SKILL.md 用空白接起來，所以輸入時就地切開）

### `e2e/`

Playwright 端對端測試：

- `login.spec.ts` — 登入流程測試
- `settings.spec.ts` — 設定頁測試
- `settings-tokens.spec.ts` — 設定頁「API 權杖」測試（清單、建立與一次性權杖、撤銷確認、PAT session 的 403）
- `settings-password.spec.ts` — 設定頁「密碼」測試（成功、目前密碼錯、兩次不一致前端擋、NAS 使用者沒有目前密碼欄）
- `settings-preferences.spec.ts` — 設定頁「偏好」測試（讀取帶入、切換送 PUT、400 退回原值）
- `voice-settings.spec.ts` — 設定頁「語音」測試（生效摘要、切引擎重抓、schema 產表單含 slider、儲存 body、清除確認、試聽與 429／503、管理員的套用範圍）
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
- `scheduler.spec.ts` — 排程清單與編輯器測試（各欄與 badge、toggle 的 PATCH、立即執行的確認、cron／interval 新增的 body、JSON 輸入驗證、編輯只送變動、名稱重複的 409、系統來源不可改、刪除確認、非管理員擋下）
- `bot-binding-groups.spec.ts` — Bot 綁定與群組清單測試
- `bot-group-detail.spec.ts` — Bot 群組明細測試
- `bot-users-blocklist.spec.ts` — Bot 使用者與黑名單分頁測試
- `bot-messages-files.spec.ts` — Bot 訊息與檔案分頁測試
- `bot-settings.spec.ts` — Bot 平台設定分頁測試（兩平台欄位狀態、更換單一欄位、主動推送開關、測試連線成功與失敗、清除確認與清除失敗時對話框留著、非管理員擋下）
- `projects.spec.ts` — 專案清單／明細五分頁／新增編輯／權限擋下／知識庫編輯器專案入口測試
- `parties.spec.ts` — 往來對象清單／明細五分頁／新增編輯／合併／權限擋下測試
- `items.spec.ts` — 物料清單／明細庫存與異動兩分頁／調整與調撥／新增編輯／倉庫頁／權限擋下測試
- `purchasing.spec.ts` — 採購單清單篩選／新增行項／明細收貨與取消／首頁待收貨卡／權限擋下測試
- `files.spec.ts` — 檔案頁測試（空狀態與連線、沿用既有連線、連線失敗訊息、瀏覽與麵包屑、搜尋、預覽、連線過期自動重連重試、中斷、權限擋下；上傳、新資料夾、重新命名含 409、刪除含遞迴、分享連結的權限與 `resource_id`）
- `memory.spec.ts` — 記憶管理測試（群組分頁列記憶與折疊、空狀態、新增、編輯、停用與 500 錯誤、刪除確認、個人分頁與搜尋、對象不存在的 404 detail、權限擋下）
- `shares.spec.ts` — 分享管理測試（一般使用者清單、空狀態、已過期淡化、管理員切換 `?view=all` 與建立者欄、複製網址、撤銷確認、撤銷被拒的 detail、權限擋下）
- `messages.spec.ts` — 訊息中心測試（鈴鐺未讀數與 99+、多選篩選寫進網址、勾選與全部標已讀、明細與自動標已讀、分頁、未登入被擋；桌機與手機）
- `skills.spec.ts` — Skills 設定測試（清單與就地搜尋、重新載入、明細的提示詞與 references、安裝資訊摺疊、404 detail、`requires_app` 多選與清空、工具標籤、沒變動不送 PUT、刪除確認、Hub 搜尋／檢視／安裝與重抓清單、409 detail、非管理員擋下）
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
- `ctos-web.theme` — 主題偏好（`"dark"`、`"light"` 或 `"system"`）。`"dark"` 與 `"light"` 會同步到後端的 `/api/user/preferences`，登入後以後端的值為準；`"system"` 只存在本機

### Session 清除

任何 API 回傳 401 Unauthorized 都會清除 session（NAS 綁定密碼錯誤除外）；下一次路由渲染時 `RequireAuth` 判斷沒有 token 或使用者，才導向 `/login`。

### 依 app 權限顯示

`GET /api/user/me` 回傳的 `permissions.apps`（與 `is_admin`）決定側邊欄與路由：`is_admin` 一律放行；否則依 `permissions.apps[app]`（`lib/permissions.ts` 的 `canAccessApp`）。側邊欄（`app-sidebar.tsx`）依此過濾掉沒有權限的模組；路由（`routes.tsx`）用 `RequireApp`（一般 app）與 `RequireAdmin`（僅管理員）包住對應頁面，沒有權限時直接渲染一頁「此功能需要管理員開放」或「此頁只有管理員能使用」＋「回首頁」連結，不是導頁，避免與 `RequireAuth` 互相導頁。管理員可在「使用者管理」（`/admin/users`）頁調整每個使用者的 app 與知識庫權限。

## 模組現況

### 已完成

- **登入** — 支援 NAS 帳號與平台帳號兩種方式
- **側邊欄與版面** — 響應式設計，支援深色／淺色主題（於側邊欄使用者選單切換）
- **首頁** — 個人化問候訊息；「今日 AI 用量」（依 `ai-log` 權限）、「Bot 概況」（依 `linebot` 權限）、「進行中專案」與「逾期里程碑」（依 `project-management` 權限）、「採購待收貨」（依 `inventory-management` 權限）與知識庫「最近更新」卡片，各卡各自 loading／錯誤狀態，一張失敗不影響其他卡片
- **設定頁** — 帳號資訊、NAS 帳號綁定／解綁；「密碼」區塊變更或首次設定平台密碼（`POST /api/auth/change-password`）。已有平台密碼的人要填目前密碼，NAS 認證、還沒設密碼的人（`has_password` 為 false）沒有這一欄，改成提示設定後兩種都能登。這支端點**失敗也回 200**，只有 body 的 `success` 與 `error` 會變，前端照 body 判斷而不是看狀態碼；強度規則留在後端，前端只擋「兩次一致」與最少 8 碼。改完密碼**不會**讓其他裝置的 session 或 API 權杖失效。「API 權杖」區塊管理 `ctos` CLI 與自動化工具用的 PAT（`/api/auth/tokens`）：清單列名稱、範圍、唯讀／可寫、到期、最後使用與建立時間，建立對話框可挑範圍（不勾＝不限縮，拿使用者當下全部 app 權限）、有效天數（預設 180 天，可選永不過期）與唯讀開關，建立成功後一次性顯示原始權杖與 `export CTOS_TOKEN=` 用法，勾了「已保存」才關得掉，關掉就再也拿不到；撤銷有確認對話框。以 PAT 換來的 session 不能建立或撤銷權杖，後端 403 的 detail 原樣顯示。「API 權杖」區塊管理 `ctos` CLI 與自動化工具用的 PAT（`/api/auth/tokens`）：清單列名稱、範圍、唯讀／可寫、到期、最後使用與建立時間，建立對話框可挑範圍（不勾＝不限縮，拿使用者當下全部 app 權限）、有效天數（預設 180 天，可選永不過期）與唯讀開關，建立成功後一次性顯示原始權杖與 `export CTOS_TOKEN=` 用法，勾了「已保存」才關得掉，關掉就再也拿不到；撤銷有確認對話框。以 PAT 換來的 session 不能建立或撤銷權杖，後端 403 的 detail 原樣顯示。「偏好」區塊選主題（亮色／暗色），與側邊欄的切換鈕是同一份 `ThemeProvider` 狀態。登入後跟後端要一次（`GET /api/user/preferences`），之後不管從哪裡切都 PUT 回去；後端回 400 就退回上一個存住的值並把 detail 顯示出來。側邊欄多出來的「跟隨系統」後端沒有地方存，選它就不送，設定頁會說明。「語音」區塊設定 Bot 用語音回覆時的引擎與聲音（`/api/voice/*`）：引擎清單來自 `GET /api/voice/voices` 回的 `available_engines`（沒有獨立的「列引擎」端點），參數欄位照同一支端點回的 `config_schema` 動態產——`select` 配語音角色清單、`slider` 產 range、`text` 產輸入框，有 `default` 的欄位沒動過就直接帶預設值送出。換引擎會重抓語音角色並清掉舊參數。摘要區顯示 `effective`（這一層沒設定就是繼承來的值，一路退到系統預設 edge＋zh-TW-HsiaoChenNeural）。試聽打 `POST /api/voice/preview` 拿 `audio/mp4` 的 bytes，用 blob URL 掛 `<audio>`（換掉時 `revokeObjectURL`），後端每人十秒一次，429「試聽冷卻中」與 503「語音功能未安裝」的 detail 原樣顯示。清除有確認對話框，清完退回繼承。管理員多一個「套用範圍」下拉（自己／群組／Agent，來自 `GET /api/voice/scopes`），切換會重抓那個 scope 的設定；非管理員只有自己，群組與 Agent 的寫入後端本來就會回 403
- **知識庫** — 路由 `/kb`，清單搜尋、閱讀附件、新增編輯、刪除、分享連結、版本歷史；首頁多「最近更新」
- **AI 助手** — 路由 `/assistant`（需 `ai-assistant` 權限，頁面走 `lazy()` 分開載入，socket.io-client 不進主 bundle）。左欄對話清單（新對話、重新命名、刪除確認，手機收成抽屜），主區訊息串（助手回覆用 Markdown 渲染，工具呼叫用 AI Log 同一支時間軸元件摺疊顯示），底部輸入區（Enter 送出、Shift+Enter 換行、Agent 選單、壓縮鈕）。對話走 REST（`/api/ai/chats`），送訊息與收回覆走 Socket.IO（`ai_chat_event`／`ai_typing`／`ai_response`／`ai_error`），握手帶 `auth.token`，token 失效時照既有流程清掉 session。右上角有連線狀態，斷線時輸入停用。網址帶 `?chat=` 指定對話、`?q=` 預填輸入框
- **檔案** — 路由 `/files`（需 `file-manager` 權限，預設開放）。進頁面先打 `GET /api/nas/connections`，有現成連線就沿用第一筆，沒有才開連線對話框（主機預設值來自 `VITE_NAS_HOST`）。連線 token 只放記憶體（後端 30 分鐘，操作會自動延長），不進 localStorage。之後每支 NAS 端點都帶 `X-NAS-Token`，缺連線或過期時 `lib/nas.ts` 的 fetch 包裝層攔下來，清掉連線、開對話框，連好再把原請求重試一次。根目錄列的是共享資料夾（`GET /api/nas/shares`，`browse?path=/` 後端會回 400），往下是 `GET /api/nas/browse`；桌面表格、手機卡片，`?path=` 寫進網址，重新整理停在同一層。搜尋只在共享資料夾底下可用（後端 `_parse_path` 不接受空路徑），結果的 `path` 後端不含 share 名稱，前端接回去才點得進。圖片、PDF 與文字（txt／md／csv／json／log）在預覽面板顯示，其他類型只給下載；預覽與下載都用 header 取 blob，NAS token 不進網址。工具列有「上傳」（多檔，逐檔送，做完重抓清單）與「新資料夾」，每一列的「動作」選單有重新命名、刪除（資料夾多一個遞迴勾選，後端沒勾會回 400）與分享連結；這些寫入類動作只在共享資料夾底下的瀏覽清單出現（根目錄列的是 share，後端 `_parse_path` 不接受空路徑；搜尋結果跨資料夾，改完要重抓的不是同一份清單）。分享連結要 `share-manager` 權限（後端預設關閉）而且檔案要落在 `VITE_NAS_SHARE_MOUNTS` 設定的前綴底下：`POST /api/share` 的 `nas_file` 會把 `resource_id` 丟給 `validate_nas_file_path()`，檔案管理器的 SMB 路徑（以 `/` 開頭但不是 `/tmp/`、`/mnt/`）會被 `path_manager` 判成 NAS zone 直接拒絕，所以要先換成掛載點路徑

- **記憶** — 路由 `/memory`（需 `memory-manager` 權限，後端預設開放；記憶端點本身只驗登入，前端仍用 `RequireApp` 擋入口）。兩個分頁「群組」「個人」寫進網址 `?tab=`，選到的對象寫進 `?target=`；左側清單沿用 Bot 頁的群組（`/api/bot/groups`）與使用者（`/api/bot/users-with-binding`）資料層，每頁 20 筆、附平台 badge，搜尋是就地過濾當頁（這兩支端點沒有關鍵字參數），手機寬度收進抽屜。右側列該對象的記憶：標題、內容（純文字，超出三行折起來）、啟用開關（`PUT` 只送 `is_active`）、編輯與刪除，上方「新增記憶」。記憶和 bot 用的是同一份：`services/linebot_ai.py` 組系統提示詞時只讀 `is_active = true` 的那些，所以停用等於 bot 讀不到。刪除的確認對話框照 PR #29 的做法（只掛一個、關掉直接卸載、等請求落地才關）。後端 404 的 detail（`Group not found`／`User not found`／`Memory not found`）原樣顯示
- **Prompt** — 路由 `/prompts`（需 `prompt-editor` 權限，後端預設關閉）。清單列名稱、顯示名、分類 badge、說明與更新時間，搜尋是就地過濾（`GET /api/ai/prompts` 只吃 `category`，沒有關鍵字參數），手機寬度改卡片。`/prompts/:id` 閱讀頁把內容原樣放在等寬 `<pre>`（不做 Markdown 渲染，看到的就是送進模型的字），變數用表格列出；`/prompts/new`、`/prompts/:id/edit` 是表單（名稱、顯示名、分類下拉、內容、說明、變數 JSON），變數欄位送出前先驗 JSON，後端收的是物件，陣列與純量前端就擋掉。編輯只送有變動的欄位；可為空的欄位（顯示名、說明、分類、變數、system prompt、工具、額外設定）**清空不掉**：後端 `services/ai_manager.py` 135–163 與 412–450 是用 `is not None` 組 UPDATE，送 `null` 等於沒送（ching-tech-os #252）。前端遇到「原本有值、現在被清空」就不把那個欄位放進 PUT，改在欄位旁邊寫明只能改成別的值。`linebot-personal` 與 `linebot-group` 在明細與編輯頁都有醒目提示，說明改了 bot 下一則訊息就照新的內容回答。刪除有確認對話框（照 PR #29 的做法），被 Agent 引用時後端回 400，detail 原樣顯示在對話框裡。另外：`GET /api/ai/prompts/{id}` 後端雖然塞了 `referencing_agents`，但 `response_model=AiPromptResponse` 會把它濾掉，前端拿不到，所以沒有「哪些 Agent 在用」的畫面
- **Agent** — 路由 `/agents`（需 `agent-settings` 權限，後端預設關閉）。清單列名稱、顯示名、模型、啟用 badge、工具與更新時間，搜尋就地過濾，手機寬度改卡片；清單端點的 `AiAgentListItem` 沒有 `system_prompt_id`，關聯的 Prompt 要進明細才看得到。`/agents/:id` 明細列模型、關聯 Prompt（連到 `/prompts/:id`）、工具與額外設定，下方是「測試」面板：送 `POST /api/ai/test` 會**真的**呼叫 AI（會計入用量、在 AI Log 留一筆），畫面上先講清楚；回覆、耗時與 `log_id` 的連結（連到 `/ai-log/:id`）都列出來。這支失敗不是 HTTP 錯誤，是 200 配 `success:false`＋`error`，停用中的 Agent 後端直接回「已停用」，所以停用的 Agent 面板照樣開著，只是把錯誤原樣顯示。`/agents/new`、`/agents/:id/edit` 是表單（名稱、顯示名、說明、模型、system prompt 下拉＝打 `/api/ai/prompts`、啟用開關、工具標籤、額外設定 JSON），編輯只送變動欄位；可為空的欄位（顯示名、說明、分類、變數、system prompt、工具、額外設定）**清空不掉**：後端 `services/ai_manager.py` 135–163 與 412–450 是用 `is not None` 組 UPDATE，送 `null` 等於沒送（ching-tech-os #252）。前端遇到「原本有值、現在被清空」就不把那個欄位放進 PUT，改在欄位旁邊寫明只能改成別的值。模型與工具**後端都沒有列出選項的端點**（舊桌面 `frontend/js/agent-settings.js` 是寫死的兩份常數），所以模型做成自由輸入加 `datalist` 常用值、工具做成可自由輸入的標籤加常用值快捷鍵。清單上方的 Provider 狀態卡（模式、各 provider readiness 與 circuit、Claude 用量）只有管理員看得到，非管理員連 `GET /api/ai/providers/status` 都不會送
- **AI Log** — 路由 `/ai-log`，已完成（統計、篩選、分頁、明細、依使用者篩選）

- **分享** — 路由 `/shares`（需 `share-manager` 權限，**後端預設關閉**，由管理員逐人開放；沒開的人側邊欄沒有這一項）。列出分享連結：資源類型 badge、標題（知識庫連 `/kb/:id`、專案連 `/projects/:id`；`nas_file` 顯示 `resource_id` 的路徑，因為後端的 `get_resource_title` 只回檔名）、完整網址與一鍵複製、到期（null 是永久，後端算好的 `is_expired` 為 true 時整列淡化並標「已過期」）、存取次數、建立時間。管理員多一個「只看我的／全部」切換，寫進網址 `?view=all`，切到全部時多一欄建立者，每一列都可以撤銷（包含別人的）。撤銷有確認對話框，後端 403「您沒有權限撤銷此連結」原樣顯示。建立連結不在這一頁，知識庫條目與檔案管理各自有建立對話框。

  兩件與後端有關的事：一是 `share-manager` 這道閘門**只有前端有**——`POST /api/share` 掛了 `require_app_permission("share-manager")`，但 `GET /api/share` 與 `DELETE /api/share/{token}` 只掛 `get_current_session`（`api/share.py` 142、176），登入就打得到；撤銷本身另有「建立者或管理員」檢查。二是 `project` 與 `project_attachment` 兩種資源後端沒有實作標題，一律回「未知資源」（`services/share.py` 430–431），原始資源被刪掉則是「（已刪除）」，前端照後端顯示，不自己編
- **Skills** — 路由 `/skills`（僅管理員；`api/skills.py` 每一支都掛 `require_admin`）。清單有名稱、說明、需要的 app、工具數、有無提示詞、來源與有無模組，搜尋是就地過濾名稱與說明（這支端點沒有關鍵字參數），上方有「重新載入」（`POST /api/skills/reload`，回重新載入的數量）與「從 Hub 安裝」。明細頁顯示提示詞（知識庫那支 Markdown 元件）、references（點了才打 `GET /{name}/files/{path}`，`.md` 走 Markdown、其餘用 `<pre>`）、腳本、附帶檔案、授權／相容版本／來源與 `_meta.json`（只有從 Hub 裝的才有，摺疊顯示），並可編輯 `requires_app`（多選；清單語意是**任一**，`skills/__init__.py` 的 `has_required_app` 是 `any()` 不是 `all()`）、`allowed_tools` 與 `mcp_servers`（標籤增刪）。送出只帶真的變動的欄位，一個都沒變就不送——後端 `model_dump(exclude_unset=True)` 收到空 body 會回 400「No fields to update」。移除有確認對話框（照 PR #29 的做法）。Hub 對話框可挑來源（`GET /hub/sources`，不挑就兩家一起搜）、搜尋、檢視 SKILL.md 與安裝，裝完重抓清單；雙來源其中一家掛掉時後端把訊息放在 `errors` 而不是整支失敗，前端照樣顯示。

  Hub 的搜尋結果**同一個 slug 會有好幾筆**（不同作者各發一份；本機對 ClawHub 實搜「pdf」，二十筆裡有七筆的 slug 都是 `pdf`），所以每一列的識別碼用 ClawHub 給的 `id` 不是 slug，並把作者顯示出來。搜尋結果的 `version` 實測是 null，前端就不送版本，讓後端抓 latest。要注意這種同名的 skill 用 `hub/inspect` 與 `hub/install` 都只帶 slug，ClawHub 那一端會回 409，後端把它轉成 502／409 的 detail 原樣吐出來——這是後端契約的限制，前端只能把訊息顯示清楚。

  `requires_app` 的選項與名稱來自後端的 `GET /api/config/apps`（`api/config_public.py` 19–22 → `modules.py` 364–378），不是側邊欄那份 `lib/nav.ts`：側邊欄只有「有頁面的」app，後端那支連 extends 與 skill 貢獻的（`his-integration`、`nvr-viewer`、`voice`）都給，而那些正是 SKILL.md 真的會寫的值；名稱也以後端為準（`vendor-management` 後端叫「廠商管理」，側邊欄叫「往來對象」）。本機實測回 21 筆，是**裸陣列**不是 `{apps: [...]}`，而且這支不需要認證。後端沒宣告、但 SKILL.md 已經寫了的 id（`debug-skill` 的 `admin`）會併到選項後面並保持勾選，否則管理員按一次儲存就會把原本的設定洗掉；清單抓不到時退回只列已選的 id，頁面照樣能用。

  `POST /{name}/scripts/{script}/run` **刻意沒有 UI**：那支等於讓網頁跑伺服器上的腳本，而且是整支 API 唯一只驗登入（`get_current_session`）的端點，要先綁工具權限（ching-tech-os #210）才會有畫面；這裡只把腳本名稱與說明列出來。

- **使用者管理** — 路由 `/admin/users`（僅管理員）。清單有帳號、顯示名稱、角色、狀態、密碼（已設定／NAS）、最後登入，停用的使用者整列淡化。每列「權限」按鈕開 Sheet 調 app／知識庫權限（PATCH 只送變動的鍵，即時生效）；每列「動作」選單有編輯（顯示名稱、Email、角色）、停用／啟用、重設密碼、清除密碼與刪除，清除密碼與刪除各有確認對話框。清單上方的「新增使用者」對話框收帳號、密碼、顯示名稱與角色，後端一律把新帳號設成 `must_change_password=true`，成功後提示首次登入需改密碼。後端擋自己的四條（降級、停用、清除密碼、刪除）在自己那一列直接停用選項並寫出原因，不等 400。其餘 400 的 `detail` 原樣顯示。編輯表單的 Email 留空代表不變更：清單端點 `AdminUserInfo` 沒有回 email，後端 `update_user_info` 也只有收到 `None` 才跳過該欄
- **排程** — 路由 `/scheduler`（僅管理員，後端 `/api/scheduler/*` 七支端點全部 `require_admin`）。這個模組舊桌面沒有畫面，bot 那邊靠 MCP 工具 `manage_scheduled_task`／`list_scheduled_tasks` 建排程，這一頁看到的是同一份資料。清單列名稱與來源 badge、觸發（cron 補齊五欄顯示，interval 換成「每 N 小時」）、執行器（agent 名或 `skill / script`）、啟用開關、下次執行、上次執行的成功／失敗 badge 與失敗訊息，連續失敗次數大於 0 標紅。動態排程可以立即執行、編輯、刪除，兩個動作各有確認對話框；立即執行的對話框寫明會馬上真的跑一次（agent 會呼叫 AI、腳本會真的執行並照設定推播），不是試跑。系統與模組排程是 `_collect_static_schedules` 從 APScheduler 的 job 組出來的唯讀資料，id 是 `uuid5` 造的假 id、不在資料表裡，所以 PUT／DELETE／toggle 都會落到 404「排程不存在」；前端直接把這幾列的開關鎖住、不給動作按鈕，直接打編輯網址也擋下來。`/scheduler/new`、`/scheduler/:id/edit` 的表單有觸發類型切換（cron 五欄加「每天 09:00」「每小時」「每週一 08:00」三個常用預設；interval 五個整數，全部 0 時後端當每 1 小時）、執行器類型切換（agent 選 `/api/ai/agents` 的名稱加一段指令；skill_script 的 skill 下拉連動 script 下拉，輸入資料是 JSON 字串，不合法就不讓送）與通知設定（LINE／Telegram、個人或群組、對象 id）。編輯只送變動欄位：後端 `model_dump(exclude_none=True)` 會把 null 丟掉，所以清空說明是送空字串而不是 null。建立時名稱重複後端回 409，detail 原樣顯示
- **Bot 管理** — 路由 `/bot`，六個分頁（綁定、群組含明細與最近訊息、使用者、黑名單、訊息、檔案），照舊桌面範圍；訊息／檔案分頁已補回舊桌面的群組篩選、檔案 NAS／已過期狀態；群組明細的「綁定專案」下拉照舊桌面補回：選項為專案清單（已完成／已取消排在後段並標狀態），第一項「未綁定」，改選送 `POST /bind-project`、選「未綁定」送 `DELETE /bind-project`，成功後顯示目前綁定的專案名並連到 `/projects/:id`；專案清單載入失敗（如無 `project-management` 權限）時下拉停用並提示；群組清單分頁的「專案」欄同步顯示綁定的專案名；圖片預覽已補；其他類型只下載。第七個分頁「平台設定」只有管理員看得到（後端 `api/bot_settings.py` 四支都掛 `require_admin`），非管理員連 `?tab=settings` 也退回綁定分頁：Line／Telegram 各一張卡，每個欄位顯示遮罩值、來源 badge（資料庫／環境變數／未設定）與更新時間，「更換」開密碼型輸入框，送出只帶那一個欄位（空字串不送，免得把值清掉）；主動推送開關單獨送 PUT；「測試連線」用後端存著的憑證測，成功與失敗的 message 都原樣顯示；「清除資料庫設定」有確認對話框，講明清除後改用 .env 的值、.env 也沒有的話 Bot 會停，主動推送設定也會重設為預設值（後端 `DELETE FROM bot_settings WHERE platform = $1` 連開關那一列一起刪）；對話框的開關由 state 控制、確定鍵是一般 Button，送出中留在畫面上，失敗時對話框不關並把後端的 detail 顯示在裡面。後端永遠只回遮罩值，明文憑證不會出現在畫面、網址或快取裡
- **專案** — 路由 `/projects`（需 `project-management` 權限）。清單有狀態篩選、搜尋與分頁，欄位含進度條與逾期里程碑數（大於 0 標紅），手機寬度改卡片；`/projects/new`、`/projects/:id/edit` 是主檔表單（新增限管理員）；`/projects/:id` 明細分五個分頁（總覽的里程碑與描述、任務三欄、成員、知識庫、綁定群組），分頁寫進網址 `?tab=`。編輯類控制只在管理員或該專案成員時顯示，後端回 403 時照既有樣式顯示提示。首頁 dashboard 不在本階段
- **往來對象** — 路由 `/parties`（需 `vendor-management` 權限，預設開放；讀寫同一把權限，進得來就寫得動）。清單一個搜尋框打後端的名稱／簡稱／別名／統編／聯絡人姓名（模糊）與電話／手機（等值）搜尋，角色篩選送 `role=supplier|customer|both`，手機寬度改卡片；`/parties/new`、`/parties/:id/edit` 是主檔表單，新增時可一併帶一筆主要聯絡人與地址（後端 `PartyCreate` 支援）；`/parties/:id` 明細分五個分頁（聯絡人、地址、採購單、專案、知識庫），分頁寫進網址 `?tab=`。聯絡人與地址可以新增、編輯、刪除與「設為主要」（`is_primary=true` 由後端把同一家其他筆降級；刪除是硬刪除，刪掉主要那筆不自動指派新主要）。表頭有「問 AI」帶 `?q=` 前綴文字開 AI 助手、「合併」對話框（挑保留哪一筆，送 `POST /api/parties/merge`，後端角色取 OR、統編取 COALESCE、drop 的名稱與簡稱併進別名）與軟刪除。採購單分頁的 `/purchase-orders/:id` 連結先做，頁面在採購單那個 PR 才有
- **物料庫存** — 路由 `/items`（需 `inventory-management` 權限，預設開放；讀寫同一把權限，進得來就寫得動）。清單一個搜尋框打後端的料號／品名／規格／別名（都是 ILIKE），分類篩選送 `item_group`（等值比對，選項從當頁清單資料收集），欄位含預設供應商連結與各倉合計的總庫存，手機寬度改卡片；`/items/new`、`/items/:id/edit` 是主檔表單，預設供應商下拉打 `/api/parties?role=supplier&page_size=100`（後端 `list_parties` 的參數是 `role`，沒有 `is_supplier`），沒有 `vendor-management` 權限時下拉停用並提示；`/items/:id` 明細分庫存與異動兩個分頁，分頁寫進網址 `?tab=`。庫存分頁有各倉餘額表與「調整」（送 `POST /api/stock/adjust`，`reason` 固定 `adjust`，數量可正可負）、「調撥」（送 `POST /api/stock/transfer`）兩個對話框，後端擋下的負庫存、同倉調撥與非正數調撥都把 400 的 detail 原樣顯示；異動分頁列後端回的最近二十筆，原因用 tint badge。倉庫在 `/warehouses`，從物料清單的「倉庫」按鈕進去，不佔側邊欄，可新增與編輯，代碼撞名的 400 原樣顯示。數量欄位後端是 `Numeric(18,4)`，序列化成帶四位小數的字串，畫面上收掉尾數但保留真的有值的小數
- **採購單** — 路由 `/purchase-orders`（需 `inventory-management` 權限，側邊欄排在物料庫存之後）。清單有狀態、供應商與專案三個篩選（都寫進網址），欄位含單號、供應商連結、專案、狀態 badge、下單日、預計到貨、行項數與金額，手機寬度改卡片；`/purchase-orders/new` 是單頭加一張可增列的行項表格（物料下拉打 `/api/items?page_size=100`，上面一個搜尋框把 `q` 帶給後端），單號由後端在同一交易產生（`PO-YYYYMM-NNN`）不用自己填；`/purchase-orders/:id/edit` 只改單頭（後端的 `PurchaseOrderUpdate` 沒有行項），狀態只收草稿與已下單。`/purchase-orders/:id` 明細有表頭主檔、「問 AI」與行項表（數量、單價、已收、未收）。收貨對話框每一行預設帶出全部未收量可改，填 0 的行這次不收，送 `POST /{id}/receive` 的 `{lines: [{line_id, qty}], warehouse_id}`；行項的 key 是 `line_id` 不是 `item_id`（同一張單可以有兩行同一個物料）；「全部收貨」送 `ReceiveRequest` 的 `all: true`。超收、倉別沒指定、已結案的單不能收貨，這些 400 都把 detail 原樣顯示。「取消採購單」有確認對話框，已收過貨的單後端會擋下來。已收貨與已取消的單不出現編輯、收貨與取消；部分到貨的單可以收貨與取消，但**不能編輯單頭**（`PurchaseOrderUpdate` 的 `status` 只收草稿與已下單，編輯頁一送出就會把狀態壓回已下單），直接打 `/purchase-orders/:id/edit` 也會被導回明細。清單端點只回 `line_count` 與 `total_amount`，沒有行項數量彙總，所以清單那一欄放的是行項數
- **簡報產生** — 路由 `/presentation`（需 `md2ppt` 權限，後端預設開放）。表單兩種模式寫在分頁上：「給主題」讓 AI 寫大綱（附 2–20 頁的頁數 slider），「用大綱 JSON」直接貼大綱、送出前先在前端驗過（要能解析、要是物件、`slides` 要是非空陣列；後端只有 `json.loads`，壞掉的 JSON 會變成 500）。兩種模式**只送其中一個欄位**：主題模式送 `topic` 與 `num_slides`，大綱模式只送 `outline_json`（後端拿到大綱就整段跳過 AI，`num_slides` 沒人讀，頁數是 `len(outline["slides"])`）。另外可選版型主題（`uncover`／`gaia`／`gaia-invert`／`default`，各附一句說明）、自動配圖開關與圖片來源（Pexels 圖庫／Hugging Face 生圖／Gemini 生圖，關掉配圖時整組停用）與輸出格式（HTML／PDF）；版型主題與輸出格式記在 localStorage，下次進來沿用（讀寫都包 try/catch）。

  這一頁**送出就真的做事**：後端會呼叫 AI（計入用量）、開了配圖會去外部圖庫或生圖服務抓圖、跑 marp-cli（timeout 180 秒）、最後把檔案寫上 NAS，所以頁面上方先寫明，送出後按鈕停用並顯示「通常要一到三分鐘」。成功卡列標題、頁數、格式、檔名、後端組好的 `message` 與 `nas_path`。`nas_path` 只給路徑加一鍵複製，**不連到檔案管理**：後端寫的是 `ching-tech-os/ai-presentations/` 這個相對於 NAS 分享區的路徑（`services/presentation.py` 511、530），分享區名稱是後端設定（`settings.nas_share`），前端拿不到，`/files` 的 `?path=` 對不上。400 的 detail（「請提供 topic 或 outline_json」「無效的主題：…」「無效的輸出格式：…」）原樣顯示。

  `md2ppt` 這道閘門**只有前端有**：`api/presentation.py` 46–50 只掛 `get_current_session`，沒有 `require_app_permission("md2ppt")`，登入就打得到這支端點；`md2ppt` 在 `services/permissions.py` 178 預設 `True`，所以側邊欄一般人看得到

- **訊息中心** — 路由 `/messages`，只要登入就進得去（後端 `api/messages.py` 只掛 `get_current_session`，沒有 app 閘）。Header 右側的鈴鐺顯示未讀數（超過 99 顯示 `99+`），點了帶著 `?is_read=false` 進未讀清單。清單有嚴重程度與來源兩個多選（同名參數重複帶，後端收 `list[...]`）、已讀狀態、關鍵字與日期區間，全部寫進網址；表格列嚴重程度、來源、分類、標題、時間與已讀狀態，未讀列加粗，手機寬度改卡片。可勾選多筆「標為已讀」，也可以「全部標為已讀」（有確認對話框，不受目前篩選影響）。`/messages/:id` 明細顯示標題、內容（純文字保留換行）、可摺疊的附加資料 `<pre>`、時間、嚴重程度與來源；後端讀明細**不會**順手標已讀，所以進頁面後由前端補送一次 `mark-read {ids:[id]}`。鈴鐺的未讀數用 React Query 輪詢（每分鐘一次加視窗重新取得焦點），沒有接 socket——後端雖然有 `message:unread_count` 事件，但 ctos-web 目前只在 AI 助手頁連 socket，要即時再改接


## 相關文件

設計文件位於 `ching-tech-os` 儲存庫：

- **設計規格** — `docs/superpowers/specs/2026-09-10-ctos-web-react-frontend-design.md`
- **實作計劃** — `docs/superpowers/plans/2026-09-11-ctos-web-skeleton.md`

## 授權

MIT License — 詳見 `LICENSE` 檔案。
