#!/usr/bin/env node
/**
 * 後端 openapi 對前端原始碼的缺口盤點（可重跑）。
 *
 * 用法：
 *   node scripts/api-gap-inventory.mjs --openapi http://127.0.0.1:8088/openapi.json --src src
 *   node scripts/api-gap-inventory.mjs --openapi ./openapi.json --src src --json
 *
 * 做法（與 2026-09-12 早上的手工盤點同一把尺）：
 * 1. 讀 openapi，取 /api 開頭的路徑，按第一個 tag 分群（沒 tag 的歸「no tag」）。
 * 2. 掃 --src 底下的 .ts/.tsx（排除 *.test.*、*.spec.*），抓出所有 `/api/...` 字串樣板；
 *    `${...}` 一律視為一段動態值；結尾的 `${...}` 視為「任意後綴」（例如 `/api/skills/${name}${suffix}`）。
 * 3. 後端每條路徑（{param} 正規化）與前端樣板比對：任一樣板命中就算「有打到」。
 * 4. 三類：
 *    一、整個模組（tag）沒有任何路徑被打到 → 後端有、畫面沒有
 *    二、src/pages 底下的頁面檔，連同它 import 的 src 內模組，完全沒有 /api 字串；或含殼字樣
 *    三、模組有被打到，但其中某些路徑沒有 → 兩邊都有但不完整
 *    不是畫面的路徑（webhook、internal、health、config/health）預設排除，可用 --ignore 覆寫（regex）。
 */
import fs from "node:fs"
import path from "node:path"

const argv = process.argv.slice(2)
const args = {}
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) continue
  const next = argv[i + 1]
  args[argv[i].slice(2)] = next && !next.startsWith("--") ? next : "true"
}
const openapiSrc = args.openapi
const srcDir = path.resolve(args.src ?? "src")
const asJson = args.json === "true"
const ignoreRe = new RegExp(
  args.ignore ?? "^/api/(bot/(line|telegram)/webhook|internal/|health$|config/health$)",
)
if (!openapiSrc) {
  console.error("需要 --openapi <url|file>")
  process.exit(2)
}

async function loadOpenapi(s) {
  if (/^https?:\/\//.test(s)) {
    const r = await fetch(s)
    if (!r.ok) throw new Error(`openapi ${r.status}`)
    return r.json()
  }
  return JSON.parse(fs.readFileSync(s, "utf8"))
}

const norm = (p) => p.replace(/\{[^}]+\}/g, "{x}").replace(/\/$/, "")

// --- 後端路徑 ---
const spec = await loadOpenapi(openapiSrc)
const backend = []
for (const [p, ops] of Object.entries(spec.paths ?? {})) {
  if (!p.startsWith("/api")) continue
  const methods = Object.keys(ops).filter((m) => ["get", "post", "put", "patch", "delete"].includes(m))
  const tag = ops[methods[0]]?.tags?.[0] ?? "no tag"
  backend.push({ path: p, methods: methods.map((m) => m.toUpperCase()), tag, ignored: ignoreRe.test(p) })
}

// --- 前端檔案 ---
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name)
    if (e.isDirectory()) walk(f, out)
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(f)
  }
  return out
}
const files = walk(srcDir)
const contents = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]))

// --- 前端 API 樣板 → regex ---
// 樣板可以是 `/api/...` 開頭，或 `${API_BASE}/api/...` 這種前面先接一個常數的形式。
const templateRe = /["'`](?:\$\{[A-Za-z_]+\})?(\/api\/[^"'`\n]*)["'`]/g
const templates = new Set()
for (const c of contents.values()) {
  for (const m of c.matchAll(templateRe)) templates.add(m[1])
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
/**
 * 樣板 → regex 的規則（每一條都對應一種真實寫法）：
 * - `?` 之後一律丟掉（query string）。
 * - `/` 後面接的 `${…}` 是一段路徑參數 → 只對應後端的 `{param}`（正規化成 `{x}`），不吃字面子路徑（否則 `/api/knowledge/${id}` 會把 `rebuild-index` 當成 id）。
 * - 緊接在另一個 `${…}` 後面的 `${…}` 是後綴（例如 `/api/skills/${name}${suffix}`）→ 結尾時 `.*`。
 * - 接在其他字元後面的 `${…}`（例如 `/api/ai/logs${buildQuery(f)}`）是 query 或檔名尾巴 → 從那裡截斷。
 *   否則 `${qs}` 會變成「任意後綴」，把整個模組都算成有打到。
 */
function templateToRegex(t) {
  const s = t.replace(/\?.*$/, "")
  let out = ""
  let i = 0
  let prevDynamic = false
  while (i < s.length) {
    if (s.startsWith("${", i)) {
      let depth = 0
      let j = i
      for (; j < s.length; j++) {
        if (s[j] === "{") depth++
        else if (s[j] === "}" && --depth === 0) break
      }
      const unterminated = j >= s.length
      const before = out.slice(-1)
      if (before === "/" && !prevDynamic) out += "\\{x\\}"
      else if (prevDynamic) out += j + 1 >= s.length || unterminated ? ".*" : "[^/]*"
      else {
        out = out.replace(/\/$/, "")
        break
      }
      prevDynamic = true
      i = unterminated ? s.length : j + 1
      continue
    }
    out += esc(s[i])
    prevDynamic = false
    i++
  }
  return new RegExp("^" + out.replace(/\/$/, "") + "$")
}
const regexes = [...templates].map(templateToRegex)
// 尾段是 `{…path}` 的參數（FastAPI 的 `:path` 轉換器，openapi 看不出來）會吃掉斜線，
// 前端常在裡面塞字面值（例如 `/api/knowledge/assets/images/${file}`），所以改用前綴比對。
const templateNorm = [...templates].map((t) => t.replace(/\?.*$/, "").replace(/\$\{[^}]*\}.*$/, "{x}"))
const hit = (p) => {
  const n = norm(p)
  if (regexes.some((r) => r.test(n))) return true
  const m = p.match(/^(.*\/)\{[^}]*path\}$/)
  if (m) {
    const prefix = m[1]
    return templateNorm.some((t) => t.startsWith(prefix) && t.length > prefix.length)
  }
  return false
}
for (const b of backend) b.referenced = hit(b.path)

// --- 分群 ---
const byTag = new Map()
for (const b of backend) {
  if (!byTag.has(b.tag)) byTag.set(b.tag, [])
  byTag.get(b.tag).push(b)
}
const cat1 = []
const cat3 = []
for (const [tag, rows] of byTag) {
  const live = rows.filter((r) => !r.ignored)
  if (live.length === 0) continue
  const unref = live.filter((r) => !r.referenced)
  if (unref.length === live.length) cat1.push({ tag, paths: unref })
  else if (unref.length > 0) cat3.push({ tag, paths: unref, total: live.length })
}

// --- 第二類：殼 ---
const pagesDir = path.join(srcDir, "pages")
const importRe = /from\s+["'](@\/[^"']+|\.{1,2}\/[^"']+)["']/g
function resolveImport(from, spec) {
  const base = spec.startsWith("@/") ? path.join(srcDir, spec.slice(2)) : path.resolve(path.dirname(from), spec)
  for (const cand of [base, base + ".ts", base + ".tsx", path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (contents.has(cand)) return cand
  }
  return null
}
function reachesApi(file, seen = new Set()) {
  if (seen.has(file)) return false
  seen.add(file)
  const c = contents.get(file) ?? ""
  if (/["'`]\/api\//.test(c)) return true
  for (const m of c.matchAll(importRe)) {
    const r = resolveImport(file, m[1])
    if (r && reachesApi(r, seen)) return true
  }
  return false
}
const shellRe = /TODO|FIXME|尚未實作|即將推出|敬請期待|not implemented|暫不支援/
const cat2 = []
if (fs.existsSync(pagesDir)) {
  for (const f of walk(pagesDir)) {
    const rel = path.relative(process.cwd(), f)
    const c = contents.get(f)
    const marker = c.match(shellRe)?.[0]
    if (!reachesApi(f)) cat2.push({ file: rel, reason: "沒有打到任何 /api（含它 import 的 src 模組）" })
    else if (marker) cat2.push({ file: rel, reason: `含殼字樣「${marker}」` })
  }
}

// --- 輸出 ---
const liveRows = backend.filter((b) => !b.ignored)
const referenced = liveRows.filter((b) => b.referenced).length
const ignored = backend.length - liveRows.length
const summary = {
  openapi: openapiSrc,
  src: srcDir,
  apiPaths: backend.length,
  ignoredNonScreen: ignored,
  referenced,
  unreferenced: liveRows.length - referenced,
  templates: templates.size,
  pages: fs.existsSync(pagesDir) ? walk(pagesDir).length : 0,
}

if (asJson) {
  console.log(JSON.stringify({ summary, cat1, cat2, cat3 }, null, 2))
  process.exit(0)
}
const fmt = (r) => `  ${r.methods.join("/")} ${r.path}`
console.log("# API 缺口盤點\n")
console.log(`openapi：${openapiSrc}　src：${srcDir}`)
console.log(
  `後端 /api 路徑 ${summary.apiPaths}（排除非畫面 ${ignored}）；前端有打到 ${referenced}／${liveRows.length}，沒打到 ${liveRows.length - referenced}；前端樣板 ${templates.size} 條；頁面檔 ${summary.pages}\n`,
)
console.log(`## 一、後端有、畫面沒有（整個模組沒打到）：${cat1.length} 個模組`)
for (const g of cat1) {
  console.log(`- ${g.tag}`)
  g.paths.forEach((p) => console.log(fmt(p)))
}
console.log(`\n## 二、只有殼沒接上：${cat2.length} 個頁面檔`)
for (const s of cat2) console.log(`- ${s.file}：${s.reason}`)
console.log(`\n## 三、兩邊都有但不完整（模組有打到，這些路徑沒有）：${cat3.length} 個模組`)
for (const g of cat3) {
  console.log(`- ${g.tag}（${g.total - g.paths.length}/${g.total} 有打到）`)
  g.paths.forEach((p) => console.log(fmt(p)))
}
