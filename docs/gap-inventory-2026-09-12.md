# 新前端缺口盤點（2026-09-12）

對照方式，不憑印象：

- 後端：從 ching-tech-os `main`（`617a2d7`）以 `ENABLED_MODULES=*` 把 app import 起來列路由，`/api` 下 **140 條唯一路徑**（含方法共 194 個端點），按 router tag 分群。
- 前端：`src/pages` 底下 52 個檔、`src/routes.tsx` 的 24 條路由、`src/lib/*.ts` 裡實際打的 API 字串。
- 結果：**62 條路徑前端有打、78 條沒打**。沒打的逐條歸類到下面三類，每項標模組（用舊桌面 app id，權限預設值取自 `permissions.py` 的 `DEFAULT_APP_PERMISSIONS`）。

webhook、`/api/internal/*`、`/api/health`、`/api/config/*` 不是畫面，不列。

## 進度更新（2026-09-12 晚間）

盤點當天下午到晚上，第一類「整個模組缺」與第三類「不完整」的項目已全部進 main（一件一支 PR，每支本機真後端端到端後才合）：

| 項目 | PR | 備註 |
|---|---|---|
| 使用者管理管理員動作 | #21 | 分層級（兩級加開關或第三級）仍待本人拍板 |
| 設定頁：PAT、變更密碼、偏好 | #22 #24 #25 | 偏好持久化依賴 ching-tech-os #240（已修，待部署） |
| 檔案管理 A＋B | #23 #28 | 真 NAS 沒帳密未驗；分享路徑對照見 ching-tech-os #243 |
| 記憶管理 | #31 | |
| 分享管理 | #33 | 後端 GET／DELETE 沒掛閘：ching-tech-os #247 |
| 訊息中心＋header 鈴鐺 | #35 | 輪詢，未接 socket |
| Prompt 編輯器＋Agent 設定 | #36 | 後端跟進 #249 #250 #251 #252 |
| Skills 設定 | #40 | 後端跟進 #253 #254 |
| 排程 | #37 | |
| 語音設定 | #38 | 後端跟進 #256 |
| 登入紀錄 | #44 | stats 500 已修（ching-tech-os #255／#258，待部署） |
| Bot 平台設定 | #42 | |
| 簡報產生 | #41 | 後端跟進 #257 |
| 基礎建設 | #29 #30 #34 #43 | flaky 慣例、typecheck 真的查型別、E2E_PORT |

**還沒做**：公開分享頁要不要搬（需拍板）、AI 助手附件與語音輸入、知識庫 rebuild-index、Bot 使用者明細頁、管理員在訊息中心依使用者篩選。第一（AI Log 缺什麼）、第二（分層級）兩題等本人回答；排版三張圖等本人指。以下原文保留當時的盤點。

## 一、後端有、畫面沒有（整個模組缺）

| 模組（app id，預設權限） | 後端路徑 | 說明 |
|---|---|---|
| 檔案管理 `file-manager`（True） | `/api/files/{zone}/{path}`、`/list`、`/download`；`/api/nas/*` 11 條（browse、search、upload、download、mkdir、rename、delete、connect、disconnect、connections、shares） | 舊桌面每天在用的 App，新前端完全沒有。這是「登入後很多功能還沒完成」最大的一塊。 |
| 分享管理 `share-manager`（False，#219 起） | `GET /api/share`（我的連結）、`DELETE /api/share/{token}` | 前端只有知識庫裡的「建連結」（POST）。沒有「列出我發過的、撤掉」，#218 修好的歸屬在畫面上用不到。 |
| 公開分享頁 `public-share` | `/api/public/{token}`、`/attachments/{path}`、`/download` | 分享連結打開的那頁。新前端是 GitHub Pages，這頁目前還是後端的 `share.html` 在扛，要不要搬過來另議。 |
| 記憶管理 `memory-manager`（True） | `GET/POST /api/bot/groups/{id}/memories`、`GET/POST /api/bot/users/{id}/memories`、`PUT/DELETE /api/bot/memories/{id}` | 舊桌面有獨立 App。 |
| Agent 設定 `agent-settings`（False） | `/api/ai/agents` 的 POST／PUT／DELETE／by-name、`/api/ai/providers/status`、`POST /api/ai/test`；`/api/skills/*` 14 條（含 hub 搜尋／安裝、reload、scripts run） | 前端只 GET 一次 agents 清單給 AI 助手選單。整個 Agent／Skill 編輯器沒有。#199 修的就是舊桌面這支。 |
| Prompt 編輯器 `prompt-editor`（False） | `/api/ai/prompts` 全部 5 條 | 舊桌面有。bot prompt（032／033 改的那些）只能在這裡看。 |
| 排程 `task-scheduler`（False） | `/api/scheduler/tasks` 7 條（含 run、toggle） | 舊桌面清單裡也沒有它的圖示，屬於從來沒有畫面的模組。 |
| 訊息中心（core） | `/api/messages`、`/unread-count`、`/mark-read`、`/{id}` | 舊桌面 header 的通知鈴。新前端 shell 沒有。 |
| 登入紀錄（admin） | `/api/login-records` 4 條 | 管理員看誰何時登入。 |
| Bot 平台設定（admin） | `/api/admin/bot-settings/{platform}` GET／PUT／DELETE、`/test` | LINE／Telegram token 與測試連線。舊桌面在「系統設定」裡。 |
| 語音設定 `voice` | `/api/voice/settings`、`/voices`、`/scopes`、`/preview` | 舊桌面在設定裡。 |
| 文件工具 `docs-tools` | `POST /api/presentation/generate` | 簡報產生。低頻。 |

## 二、畫面有但只是殼、還沒接上

用 `TODO|FIXME|尚未|即將|敬請期待|not implemented` 掃 `src/pages` 與 `src/components`：**沒有殼**。唯一命中的「尚未綁定群組」是專案分頁的正常空狀態。所有已建的頁面都接了後端，這一類目前是空的。

## 三、兩邊都有，但功能不完整

| 模組 | 現況 | 缺的（後端已有） |
|---|---|---|
| 使用者管理 `/admin/users` | 使用者清單＋每人 app／知識庫權限開關（PATCH permissions） | `POST /api/admin/users` 新增、`PATCH /{id}` 改名／改角色、`PATCH /{id}/status` 停用啟用、`DELETE`、`reset-password`、`clear-password`。**「分層級」的現況**：後端只有 `users.role` = `user`／`admin` 兩級，其餘分層全靠 per-app 開關；如果本人要的是第三級（例如主管），那是後端資料模型的事，要先拍板。 |
| 設定 `/settings` | 帳號資訊、NAS 帳號綁定／解綁 | `POST /api/auth/change-password`；`GET/POST/DELETE /api/auth/tokens`（**PAT，`ctos` CLI 要用的**，現在只能在舊桌面發）；`GET/PUT /api/user/preferences`；語音設定；管理員的 Bot 平台設定。 |
| AI Log `/ai-log` | 清單（9 欄，比舊桌面 7 欄多）、統計、篩選、明細含工具呼叫時間軸（PR #5） | 前端已把後端存的東西全部畫出來。後端 `parsed_response` 存的是每次工具呼叫的 name／input／output（依順序）＋ `tool_timings` 的 duration；**沒有存**工具呼叫之間助手的中間文字、每次呼叫的時間戳、MCP server 載入事件。本人說的「比原版少很多、沒有工具呼叫與調用順序」如果指的是這些，缺口在 ching-tech-os 後端（`claude_agent.py`／`codex_agent.py` 的收集），不在前端。要先請本人指一筆具體的 log 說哪裡少。 |
| AI 助手 `/assistant` | 對話清單、Socket.IO 串流、Markdown、工具時間軸、Agent 選單、壓縮 | 附件上傳（後端 `ai_chat_event` 是否支援待查）、語音輸入。 |
| 知識庫 `/kb` | 清單／閱讀／編輯／附件／分享／版本 | `POST /api/knowledge/rebuild-index`（管理員動作）；Markdown 內文圖片走 `/api/knowledge/assets/{path}`，前端沒有對這條路徑做 token 處理，要驗一次圖片在新前端顯不顯示。 |
| Bot 管理 `/bot` | 六個分頁、群組明細 | `GET /api/bot/users/{id}` 使用者明細頁；`GET /api/bot/groups/{id}/files` 群組檔案分頁（現在是用 `/api/bot/files?group_id` 篩）；群組／使用者記憶（歸記憶管理）。 |
| 專案、往來對象、物料庫存、採購單、倉庫 | 14＋12＋5＋3＋4＋6 條路徑全部有打 | 無。 |

## 排序建議（判準：本人講過的痛點，不是工程上好做）

本人講過四件，全部排在新功能前面：

1. **AI Log 內容比原版少、沒有工具呼叫與調用順序的完整記錄。**
   先做一件不寫程式的事：部署完成後，請本人在新前端點開一筆有工具呼叫的 log（明細頁已有時間軸），說出還缺什麼。若缺的是「助手在工具之間說了什麼」「每一步的時間點」，修在 ching-tech-os 的 `claude_agent.py`／`codex_agent.py`／`linebot_ai.py`（把中間訊息與時間戳收進 `parsed_response`），前端再把它畫出來。這件不確認就動手會做錯方向。
2. **使用者分層級、權限由管理員設。**
   前端補齊管理員動作（新增、停用、刪除、重設密碼、升降管理員），後端都在，純前端一支 PR。「分層級」要先問一題：兩級（管理員／使用者）加 per-app 開關夠不夠，還是要第三級？要第三級就是後端 schema 加 migration，另開規格。
3. **登入後很多功能還沒完成。**
   照使用頻率排：設定頁補變更密碼、PAT（`ctos` CLI 的入口）、偏好 → 檔案管理（最大缺口，可拆瀏覽／搜尋／上傳下載兩支 PR）→ 分享管理（列出與撤銷，接上 #218）→ 記憶管理 → 訊息中心（shell 的鈴）→ Agent／Prompt／Skill 設定（管理員用）→ 排程 → 登入紀錄 → Bot 平台設定 → 語音設定 → 簡報產生。
4. **排版不要太花俏、參考 larch.ink/dashboard。**
   PR #6（09-11）已做過一輪收斂，對不對本人的眼睛只有他能判。做法：本機 dev 截首頁、清單頁、明細頁各一張給他看，他點頭再往下；不點頭就在他指的那頁改，不要全站重排。

以上四件之後才是：公開分享頁要不要搬、AI 助手附件與語音、知識庫 rebuild-index、Bot 使用者明細。

## 線上路徑回 404 是正常的（2026-09-12 查證）

`https://os.ching-tech.com/ai-log` 這類深層路徑直接打會回 HTTP 404，內容卻是 app 本身。這是 GitHub Pages 的 SPA fallback：`deploy.yml` 有 `cp dist/index.html dist/404.html`，Pages 找不到檔案就回 `404.html`，React Router 接手後畫面正常。**不要拿狀態碼當證據去「修」它。** 副作用：任何用狀態碼判死活的監控會對深層路徑誤報；之後接監控要判內容（例如頁面含 app 的 root 節點）不判碼，或只監控 `/`。

## 驗收怎麼打（給接手的人）

- **一律打本機後端，不打正式機。** 正式機（`https://ching-tech.ddns.net/ctos`）在 2026-09-12 部署完成之前沒有 erp 模組的路由，`/api/parties`、`/api/items`、`/api/purchase-orders` 都是 `application/json` 的 404；打過去只會誤以為前端寫錯。就算部署完成，正式機也不是驗收環境。
- 本機後端：ching-tech-os `backend/` 以 `ENABLED_MODULES='*' uv run uvicorn ching_tech_os.main:socket_app --port 8088` 起，`.env` 的 `VITE_API_BASE` 指過去。
- **本機資料庫要先能用**：這台開發機的 `ching-tech-os-db` 目前停在 alembic 009 且升不上去（缺 `bot_settings` 表），要砍掉重建。重建時會踩 ching-tech-os #237（migration 003 把 002 種的 prompt／agent 全刪掉，起來的後端沒有 agent，AI 助手打不通）。所以「本機能驗收」的前置是修 #237，或用 #237 裡寫的手法把種子資料的 tenant id 改成 003 保留的那個再升上去。
- e2e（Playwright）全部 mock，不需要後端；上面講的是人工冒煙與契約核對。契約一律對 ching-tech-os 的原始碼（models、SQL 欄位），不憑猜。
