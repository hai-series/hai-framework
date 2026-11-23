import { expect, it } from 'vitest'
import { ai, LLMConfigSchema } from '../src/index.js'

it('protocol 为全局、注册模型和请求临时覆盖选择协议', () => {
  const config = LLMConfigSchema.parse({
    apiKey: 'fixture-key',
    protocol: 'responses',
    models: [
      { id: 'claude', model: 'claude-test', protocol: 'anthropic' },
    ],
  })
  expect(ai.resolveModelApi(config)).toBe('responses')
  expect(ai.resolveModelApi(config, 'claude')).toBe('anthropic')
  expect(ai.resolveModelApi(config, 'claude', 'chat')).toBe('chat')
  const resolved = ai.resolveModelEntry(config, 'chat', 'claude')
  expect(resolved.success).toBe(true)
  if (resolved.success)
    expect(resolved.data).toMatchObject({ protocol: 'anthropic' })
})
