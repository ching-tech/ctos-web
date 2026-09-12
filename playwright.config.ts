import { defineConfig, devices } from "@playwright/test"

/**
 * 時區要釘死，而且 Node 與瀏覽器必須是同一個。
 *
 * - `use.timezoneId` 管**瀏覽器**：畫面上的本地時間（例如物料異動的
 *   `created_at` 是 timestamptz，要轉成使用者所在時區才顯示）。
 * - `process.env.TZ` 管**跑測試的 Node**：好幾支測試是在 Node 端算期望值再跟
 *   畫面或請求比對（`ai-log.spec.ts` 的 `start_date`、`home.spec.ts` 的「今天」）。
 *
 * 只釘瀏覽器那一邊，在本機（UTC+8）看不出問題，但 CI runner 的 Node 是 UTC，
 * 兩邊算出來的「今天」與時間戳就會差八小時。這一行必須在 defineConfig 之前跑，
 * 每個 worker 都會重新載入這支設定檔，所以 worker 的 Node 也吃得到。
 */
const TEST_TIMEZONE = "Asia/Taipei"
process.env.TZ = TEST_TIMEZONE

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure", timezoneId: TEST_TIMEZONE },
  webServer: {
    // build:e2e 帶 VITE_E2E=1，讓 src/lib/socket.ts 換成假 socket，輸出另外放 dist-e2e/，
    // 免得把正式 `npm run build` 的 dist/ 蓋成含假 socket 的版本。
    command: "npm run build:e2e && npm run preview:e2e -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    // 檔案頁連線對話框的 host 預設值來自 build 時的環境變數；e2e 一律給假主機，
    // 不讓真的 NAS 位址進 repo，測試也才有固定值可比對。
    env: { VITE_NAS_HOST: "nas.test.invalid" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
})
