/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  /** 檔案頁連線對話框的 NAS 主機預設值（後端沒有端點可拿 `settings.nas_host`）。 */
  readonly VITE_NAS_HOST?: string
  /** e2e build 專用旗標（`npm run build:e2e`）：開了才會把 socket 換成假的；正式 build 沒有這個值，假 socket 會被 tree-shake 掉。 */
  readonly VITE_E2E?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
