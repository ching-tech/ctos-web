import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import {
  deleteSkill,
  getSkill,
  getSkillFile,
  getSkillReference,
  hubInspect,
  hubInstall,
  hubSearch,
  listHubSources,
  listSkills,
  reloadSkills,
  requiredApps,
  skillUpdatePatch,
  updateSkill,
} from "./skills"

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})
afterEach(() => vi.unstubAllGlobals())

function stubFetch(json: unknown, status = 200) {
  const fn = vi.fn(async () => new Response(JSON.stringify(json), { status }))
  vi.stubGlobal("fetch", fn)
  return fn
}

function callOf(fn: ReturnType<typeof stubFetch>, i = 0): [string, RequestInit] {
  return fn.mock.calls[i] as unknown as [string, RequestInit]
}

const summaryJson = {
  name: "inventory-helper",
  description: "查庫存與調撥的說明。",
  requires_app: "inventory-management",
  tools_count: 3,
  has_prompt: true,
  references: ["references/stock.md"],
  scripts: ["check.py"],
  scripts_count: 1,
  assets: [],
  source: "native",
  license: "MIT",
  compatibility: ">=0.3",
  has_module: false,
}

describe("listSkills", () => {
  it("GET /api/skills，欄位照後端清單原樣回", async () => {
    const fn = stubFetch({ skills: [summaryJson] })
    const res = await listSkills()
    expect(callOf(fn)[0]).toBe(`${API_BASE}/api/skills`)
    expect(res.skills[0].name).toBe("inventory-helper")
    expect(res.skills[0].scripts_count).toBe(1)
  })
})

describe("getSkill", () => {
  it("GET /api/skills/{name}，名稱做 encodeURIComponent", async () => {
    const fn = stubFetch({ ...summaryJson, allowed_tools: [], mcp_servers: [], prompt: "", script_tools: [], metadata: {}, contributes: null, meta: null })
    await getSkill("甲 skill")
    expect(callOf(fn)[0]).toBe(`${API_BASE}/api/skills/${encodeURIComponent("甲 skill")}`)
  })

  it("404 的 detail 原樣丟出來", async () => {
    stubFetch({ detail: "Skill 'nope' not found" }, 404)
    await expect(getSkill("nope")).rejects.toMatchObject({ status: 404, detail: "Skill 'nope' not found" })
  })
})

describe("updateSkill", () => {
  it("PUT，body 就是傳進去的 patch", async () => {
    const fn = stubFetch({ name: "inventory-helper", requires_app: ["erp", "inventory-management"], allowed_tools: [], mcp_servers: [] })
    const res = await updateSkill("inventory-helper", { requires_app: ["erp", "inventory-management"] })
    const [url, init] = callOf(fn)
    expect(url).toBe(`${API_BASE}/api/skills/inventory-helper`)
    expect(init.method).toBe("PUT")
    expect(JSON.parse(init.body as string)).toEqual({ requires_app: ["erp", "inventory-management"] })
    expect(res.requires_app).toEqual(["erp", "inventory-management"])
  })

  it("後端「一個欄位都沒送」的 400 原樣丟出來", async () => {
    stubFetch({ detail: "No fields to update" }, 400)
    await expect(updateSkill("inventory-helper", {})).rejects.toMatchObject({ status: 400, detail: "No fields to update" })
  })
})

describe("skillUpdatePatch", () => {
  const original = { requires_app: "inventory-management", allowed_tools: ["Read", "Write"], mcp_servers: ["erp"] }

  it("全都沒變回 null，呼叫端就不會送出 400 的空 body", () => {
    expect(
      skillUpdatePatch(original, { requires_app: ["inventory-management"], allowed_tools: ["Read", "Write"], mcp_servers: ["erp"] }),
    ).toBeNull()
  })

  it("只把變動的欄位放進 patch", () => {
    const patch = skillUpdatePatch(original, {
      requires_app: ["inventory-management", "vendor-management"],
      allowed_tools: ["Read", "Write"],
      mcp_servers: ["erp"],
    })
    expect(patch).toEqual({ requires_app: ["inventory-management", "vendor-management"] })
  })

  it("清空 requires_app 送 null，不是空陣列", () => {
    expect(skillUpdatePatch(original, { requires_app: [], allowed_tools: ["Read", "Write"], mcp_servers: ["erp"] })).toEqual({
      requires_app: null,
    })
  })

  it("工具與 MCP servers 各自獨立比對", () => {
    expect(
      skillUpdatePatch(original, { requires_app: ["inventory-management"], allowed_tools: ["Read"], mcp_servers: [] }),
    ).toEqual({ allowed_tools: ["Read"], mcp_servers: [] })
  })
})

describe("requiredApps", () => {
  it("null／空字串／空清單都是不需要權限", () => {
    expect(requiredApps(null)).toEqual([])
    expect(requiredApps("")).toEqual([])
    expect(requiredApps([])).toEqual([])
  })

  it("單一字串包成一個元素，清單濾掉空字串", () => {
    expect(requiredApps("erp")).toEqual(["erp"])
    expect(requiredApps(["erp", "", "inventory-management"])).toEqual(["erp", "inventory-management"])
  })
})

describe("deleteSkill", () => {
  it("DELETE /api/skills/{name}，回 removed", async () => {
    const fn = stubFetch({ removed: "demo-skill" })
    const res = await deleteSkill("demo-skill")
    const [url, init] = callOf(fn)
    expect(url).toBe(`${API_BASE}/api/skills/demo-skill`)
    expect(init.method).toBe("DELETE")
    expect(res.removed).toBe("demo-skill")
  })
})

describe("reloadSkills", () => {
  it("POST /api/skills/reload，回重新載入的數量", async () => {
    const fn = stubFetch({ reloaded: 9 })
    const res = await reloadSkills()
    const [url, init] = callOf(fn)
    expect(url).toBe(`${API_BASE}/api/skills/reload`)
    expect(init.method).toBe("POST")
    expect(res.reloaded).toBe(9)
  })
})

describe("hub", () => {
  it("GET /hub/sources", async () => {
    const fn = stubFetch({ sources: [{ id: "clawhub", name: "ClawHub", enabled: true }] })
    const res = await listHubSources()
    expect(callOf(fn)[0]).toBe(`${API_BASE}/api/skills/hub/sources`)
    expect(res.sources[0].id).toBe("clawhub")
  })

  it("POST /hub/search，沒指定來源時 source 送 null（兩家一起搜）", async () => {
    const fn = stubFetch({ query: "pdf", results: [], sources: ["clawhub"], errors: null })
    await hubSearch("pdf")
    const [url, init] = callOf(fn)
    expect(url).toBe(`${API_BASE}/api/skills/hub/search`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({ query: "pdf", source: null })
  })

  it("POST /hub/search 指定來源", async () => {
    const fn = stubFetch({ query: "pdf", results: [{ slug: "pdf-tools", source: "clawhub" }] })
    const res = await hubSearch("pdf", "clawhub")
    expect(JSON.parse(callOf(fn)[1].body as string)).toEqual({ query: "pdf", source: "clawhub" })
    expect(res.results[0].slug).toBe("pdf-tools")
  })

  it("POST /hub/inspect", async () => {
    const fn = stubFetch({ slug: "pdf-tools", source: "clawhub", content: "# PDF", skill: {}, owner: {}, latestVersion: {} })
    const res = await hubInspect("pdf-tools", "clawhub")
    const [url, init] = callOf(fn)
    expect(url).toBe(`${API_BASE}/api/skills/hub/inspect`)
    expect(JSON.parse(init.body as string)).toEqual({ slug: "pdf-tools", source: "clawhub" })
    expect(res.content).toBe("# PDF")
  })

  it("POST /hub/install，沒指定版本就不送 version", async () => {
    const fn = stubFetch({ installed: "pdf-tools", version: "1.2.0", source: "clawhub", path: "/x", description: "", scripts_count: 0 })
    await hubInstall("pdf-tools", "clawhub")
    expect(JSON.parse(callOf(fn)[1].body as string)).toEqual({ name: "pdf-tools", source: "clawhub" })

    const withVersion = stubFetch({ installed: "pdf-tools", version: "1.1.0", source: "clawhub", path: "/x", description: "", scripts_count: 0 })
    await hubInstall("pdf-tools", "clawhub", "1.1.0")
    expect(JSON.parse(callOf(withVersion)[1].body as string)).toEqual({ name: "pdf-tools", source: "clawhub", version: "1.1.0" })
  })

  it("已安裝的 409 detail 原樣丟出來", async () => {
    stubFetch({ detail: "Skill 'pdf-tools' 已安裝。如需更新請先移除。" }, 409)
    await expect(hubInstall("pdf-tools", "clawhub")).rejects.toMatchObject({
      status: 409,
      detail: "Skill 'pdf-tools' 已安裝。如需更新請先移除。",
    })
  })
})

describe("檔案讀取", () => {
  it("GET /{name}/files/{path}，路徑逐段編碼但保留斜線", async () => {
    const fn = stubFetch({ path: "references/stock.md", content: "# 庫存" })
    const res = await getSkillFile("inventory-helper", "references/stock.md")
    expect(callOf(fn)[0]).toBe(`${API_BASE}/api/skills/inventory-helper/files/references/stock.md`)
    expect(res.content).toBe("# 庫存")
  })

  it("GET /{name}/references/{path}（向下相容那支）", async () => {
    const fn = stubFetch({ path: "stock.md", content: "# 庫存" })
    await getSkillReference("inventory-helper", "stock.md")
    expect(callOf(fn)[0]).toBe(`${API_BASE}/api/skills/inventory-helper/references/stock.md`)
  })

  it("讀不到時 404 的 detail 原樣丟出來", async () => {
    stubFetch({ detail: "File not found" }, 404)
    await expect(getSkillFile("inventory-helper", "nope.md")).rejects.toMatchObject({ status: 404, detail: "File not found" })
  })
})
