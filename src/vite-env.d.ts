/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  /** 檔案頁連線對話框的 NAS 主機預設值（後端沒有端點可拿 `settings.nas_host`）。 */
  readonly VITE_NAS_HOST?: string
  /** 檔案管理器路徑前綴對後端掛載點的對照，`<前綴>=<掛載點>` 多組用 `;` 分隔；沒設就不顯示分享連結按鈕。 */
  readonly VITE_NAS_SHARE_MOUNTS?: string
  /** e2e build 專用旗標（`npm run build:e2e`）：開了才會把 socket 換成假的；正式 build 沒有這個值，假 socket 會被 tree-shake 掉。 */
  readonly VITE_E2E?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
