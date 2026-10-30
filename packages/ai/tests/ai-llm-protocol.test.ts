import { afterEach, expect, it, vi } from 'vitest'
import { ai, AIConfigSchema, HaiAIError, LLMConfigSchema, resolveModelApi, resolveModelEntry } from '../src/index.js'

afterEach(async () => {
  await ai.close()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it.each(['HAI_AI_LLM_API', 'HAI_AI_LLM_MODELS_0_API'])('旧环境变量 %s 不能被静默忽略', async (name) => {
  vi.stubEnv(name, 'anthropic')
  const result = await ai.init({ llm: { apiKey: 'fixture-key' } })
  expect(result.success).toBe(false)
  if (!result.success)
    expect(result.error.message).toContain('PROTOCOL')
})

it('protocol 为全局、注册模型和请求临时覆盖选择协议', () => {
  const config = LLMConfigSchema.parse({ apiKey: 'fixture-key', protocol: 'responses', models: [{ id: 'claude', model: 'claude-test', protocol: 'anthropic' }] })
  expect(resolveModelApi(config)).toBe('responses')
  expect(resolveModelApi(config, 'claude')).toBe('anthropic')
  expect(resolveModelApi(config, 'claude', 'chat')).toBe('chat')
  const resolved = resolveModelEntry(config, 'chat', 'claude')
  expect(resolved.success).toBe(true)
  if (resolved.success)
    expect(resolved.data).toMatchObject({ protocol: 'anthropic' })
})

it.each([{ llm: { api: 'anthropic' } }, { llm: { models: [{ id: 'old', model: 'old-model', api: 'responses' }] } }])('旧 api 配置明确报告 protocol 迁移，不静默回退', (input) => {
  const parsed = AIConfigSchema.safeParse(input)
  expect(parsed.success).toBe(false)
  if (!parsed.success)
    expect(parsed.error.issues.map(issue => issue.message).join(' ')).toContain('protocol')
})

it('临时模型的旧 api 在调用厂商前拒绝，并给出迁移说明', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect(await ai.init({ llm: { apiKey: 'fixture-key' } })).toMatchObject({ success: true })
  const request = { messages: [{ role: 'user' as const, content: 'hello' }], tempModel: { model: 'old-model', api: 'anthropic' } }
  const result = await ai.llm.chat(request)
  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error.code).toBe(HaiAIError.INVALID_REQUEST.code)
    expect(result.error.message).toContain('protocol')
  }
  expect(fetch).not.toHaveBeenCalled()
})
