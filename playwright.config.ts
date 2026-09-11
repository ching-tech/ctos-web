import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  // timezoneId 固定住：異動時間是 timestamptz，畫面要轉成本地時間，
  // 不釘死的話 CI 與本機會算出不同的字串。
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure", timezoneId: "Asia/Taipei" },
  webServer: {
    // build:e2e 帶 VITE_E2E=1，讓 src/lib/socket.ts 換成假 socket，輸出另外放 dist-e2e/，
    // 免得把正式 `npm run build` 的 dist/ 蓋成含假 socket 的版本。
    command: "npm run build:e2e && npm run preview:e2e -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
})
