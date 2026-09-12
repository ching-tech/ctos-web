import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "./api"
import {
  createScheduledTask,
  cronText,
  deleteScheduledTask,
  diffTaskUpdate,
  executorText,
  getScheduledTask,
  intervalText,
  isEditableTask,
  listScheduledTasks,
  listSkillsForPicker,
  runScheduledTask,
  toggleScheduledTask,
  triggerText,
  updateScheduledTask,
  validateJsonInput,
  type ScheduledTask,
} from "./scheduler"
import { setToken } from "./token"

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  setToken("T")
})
afterEach(() => vi.unstubAllGlobals())

const TASK_ID = "11111111-1111-4111-8111-111111111111"

const taskFixture: ScheduledTask = {
  id: TASK_ID,
  name: "每日摘要",
  description: "早上寄出前一天的摘要",
  trigger_type: "cron",
  trigger_config: { minute: "0", hour: "9", day: "*", month: "*", day_of_week: "*" },
  executor_type: "agent",
  executor_config: { agent_name: "web-chat-default", prompt: "整理昨天的紀錄" },
  is_enabled: true,
  created_by: 1,
  last_run_at: "2026-09-11T01:00:00Z",
  next_run_at: "2026-09-12T01:00:00Z",
  last_run_success: true,
  last_run_error: null,
  consecutive_failures: 0,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-11T01:00:00Z",
  source: "dynamic",
}

function stubJson(body: unknown, status = 200) {
  const fn = vi.fn(async () =>
    status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status }),
  )
  vi.stubGlobal("fetch", fn)
  return fn
}

/** 七支端點各一條，路徑、方法與 body 都對 `api/scheduler.py` 44–240。 */
describe("端點", () => {
  it("listScheduledTasks GET /api/scheduler/tasks，沒有 query 參數", async () => {
    const fn = stubJson({ tasks: [taskFixture] })
    const res = await listScheduledTasks()
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/scheduler/tasks`)
    expect(init.method ?? "GET").toBe("GET")
    expect(res.tasks[0].name).toBe("每日摘要")
  })

  it("getScheduledTask GET /api/scheduler/tasks/:id", async () => {
    const fn = stubJson(taskFixture)
    await getScheduledTask(TASK_ID)
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/scheduler/tasks/${TASK_ID}`)
    expect(init.method ?? "GET").toBe("GET")
  })

  it("createScheduledTask POST 整包 body", async () => {
    const fn = stubJson(taskFixture, 201)
    await createScheduledTask({
      name: "每小時巡檢",
      description: null,
      trigger_type: "interval",
      trigger_config: { weeks: 0, days: 0, hours: 1, minutes: 0, seconds: 0 },
      executor_type: "agent",
      executor_config: { agent_name: "web-chat-default", prompt: "回覆 ok" },
      is_enabled: false,
    })
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/scheduler/tasks`)
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({
      name: "每小時巡檢",
      description: null,
      trigger_type: "interval",
      trigger_config: { weeks: 0, days: 0, hours: 1, minutes: 0, seconds: 0 },
      executor_type: "agent",
      executor_config: { agent_name: "web-chat-default", prompt: "回覆 ok" },
      is_enabled: false,
    })
  })

  it("updateScheduledTask PUT 只送給它的欄位", async () => {
    const fn = stubJson(taskFixture)
    await updateScheduledTask(TASK_ID, { description: "改過的說明" })
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/scheduler/tasks/${TASK_ID}`)
    expect(init.method).toBe("PUT")
    expect(JSON.parse(init.body as string)).toEqual({ description: "改過的說明" })
  })

  it("deleteScheduledTask DELETE，204 沒有內容", async () => {
    const fn = stubJson(null, 204)
    await expect(deleteScheduledTask(TASK_ID)).resolves.toBeUndefined()
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/scheduler/tasks/${TASK_ID}`)
    expect(init.method).toBe("DELETE")
  })

  it("toggleScheduledTask PATCH /toggle 送 is_enabled", async () => {
    const fn = stubJson({ ...taskFixture, is_enabled: false })
    await toggleScheduledTask(TASK_ID, false)
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/scheduler/tasks/${TASK_ID}/toggle`)
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body as string)).toEqual({ is_enabled: false })
  })

  it("runScheduledTask POST /run，沒有 body", async () => {
    const fn = stubJson({ message: "已送出執行: 每日摘要" })
    const res = await runScheduledTask(TASK_ID)
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/scheduler/tasks/${TASK_ID}/run`)
    expect(init.method).toBe("POST")
    expect(init.body).toBeUndefined()
    expect(res.message).toContain("已送出執行")
  })

  it("listSkillsForPicker GET /api/skills", async () => {
    const fn = stubJson({ skills: [{ name: "daily-report", description: null, scripts: ["build.py"] }] })
    const res = await listSkillsForPicker()
    const [url] = fn.mock.calls[0] as unknown as [string]
    expect(url).toBe(`${API_BASE}/api/skills`)
    expect(res.skills[0].scripts).toEqual(["build.py"])
  })
})

describe("triggerText", () => {
  it("cron 依 分 時 日 月 週 排出五欄", () => {
    expect(cronText({ minute: "0", hour: "9", day: "*", month: "*", day_of_week: "*" })).toBe("0 9 * * *")
  })

  it("cron 缺的欄位補星號（靜態排程只回非星號欄位）", () => {
    expect(cronText({ hour: "3" })).toBe("* 3 * * *")
    expect(triggerText("cron", { day_of_week: "mon", hour: "8", minute: "0" })).toBe("Cron 0 8 * * mon")
  })

  it("靜態排程多回的 second：整分不顯示，不是整分才補在後面", () => {
    // 本機後端的 cleanup_old_messages 就是這個形狀
    expect(cronText({ hour: "3", minute: "0", second: "0" })).toBe("0 3 * * *")
    expect(cronText({ hour: "3", minute: "0", second: "30" })).toBe("0 3 * * *（秒 30）")
  })

  it("interval 串出非零的單位", () => {
    expect(intervalText({ hours: 1 })).toBe("每 1 小時")
    expect(intervalText({ days: 2, hours: 3 })).toBe("每 2 天 3 小時")
    expect(triggerText("interval", { weeks: 0, days: 0, hours: 6, minutes: 30, seconds: 0 })).toBe("每 6 小時 30 分")
  })

  it("interval 全是 0 時照後端的 fallback 顯示每 1 小時", () => {
    expect(intervalText({ weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0 })).toBe("每 1 小時")
    expect(intervalText({})).toBe("每 1 小時")
  })
})

describe("executorText", () => {
  it("agent 顯示 agent 名稱", () => {
    expect(executorText("agent", { agent_name: "web-chat-default", prompt: "x" })).toBe("web-chat-default")
  })

  it("skill_script 顯示 skill / script", () => {
    expect(executorText("skill_script", { skill: "daily-report", script: "build.py", input: "" })).toBe(
      "daily-report / build.py",
    )
  })

  it("靜態排程的 executor_config 是空的，不要印 undefined", () => {
    expect(executorText("agent", {})).toBe("（未設定 agent）")
    expect(executorText("skill_script", {})).toBe("（未設定 skill）")
  })
})

describe("isEditableTask", () => {
  it("只有 dynamic 改得動", () => {
    expect(isEditableTask({ source: "dynamic" })).toBe(true)
    expect(isEditableTask({ source: "system" })).toBe(false)
    expect(isEditableTask({ source: "module" })).toBe(false)
  })
})

describe("diffTaskUpdate", () => {
  const base = { ...taskFixture }

  it("沒改就送空物件", () => {
    expect(
      diffTaskUpdate(base, {
        name: base.name,
        description: base.description,
        trigger_type: base.trigger_type,
        trigger_config: { ...base.trigger_config },
        executor_type: base.executor_type,
        executor_config: { ...base.executor_config },
        is_enabled: base.is_enabled,
      }),
    ).toEqual({})
  })

  it("只改說明就只送說明", () => {
    expect(
      diffTaskUpdate(base, {
        name: base.name,
        description: "改過的說明",
        trigger_type: base.trigger_type,
        trigger_config: { ...base.trigger_config },
        executor_type: base.executor_type,
        executor_config: { ...base.executor_config },
        is_enabled: base.is_enabled,
      }),
    ).toEqual({ description: "改過的說明" })
  })

  it("欄位順序不同不算改", () => {
    expect(
      diffTaskUpdate(base, {
        name: base.name,
        description: base.description,
        trigger_type: "cron",
        trigger_config: { day_of_week: "*", month: "*", day: "*", hour: "9", minute: "0" },
        executor_type: base.executor_type,
        executor_config: { prompt: "整理昨天的紀錄", agent_name: "web-chat-default" },
        is_enabled: base.is_enabled,
      }),
    ).toEqual({})
  })

  it("清空說明要送空字串，因為後端 exclude_none 會把 null 丟掉", () => {
    expect(
      diffTaskUpdate(base, {
        name: base.name,
        description: null,
        trigger_type: base.trigger_type,
        trigger_config: { ...base.trigger_config },
        executor_type: base.executor_type,
        executor_config: { ...base.executor_config },
        is_enabled: base.is_enabled,
      }),
    ).toEqual({ description: "" })
  })
})

describe("validateJsonInput", () => {
  it("空字串代表沒有輸入", () => {
    expect(validateJsonInput("")).toBeNull()
    expect(validateJsonInput("   ")).toBeNull()
  })

  it("合法 JSON 過關", () => {
    expect(validateJsonInput('{"days": 7}')).toBeNull()
  })

  it("壞掉的 JSON 給訊息", () => {
    expect(validateJsonInput("{days: 7}")).toBe("輸入資料必須是合法的 JSON")
  })
})
