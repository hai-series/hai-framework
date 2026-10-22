import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST as chat } from './chat/+server.js'
import { POST as contact } from './contact/+server.js'

const mocks = vi.hoisted(() => ({
  ai: { isInitialized: false, llm: { chat: vi.fn() } },
  reach: { isInitialized: false, send: vi.fn() },
}))
vi.mock('@h-ai/ai', () => ({ ai: mocks.ai }))
vi.mock('@h-ai/reach', () => ({ reach: mocks.reach }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
  mocks.ai.isInitialized = false
  mocks.reach.isInitialized = false
})

/** 只填充两个 handler 实际读取的请求字段。 */
function event(locale: string, body: Record<string, string>): Parameters<typeof chat>[0] {
  return {
    request: new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: { locale },
  } as Parameters<typeof chat>[0]
}

describe.each(['zh-CN', 'en-US', 'ja-JP'])('aPI fallback locale %s', (locale) => {
  it('localizes unavailable and failed AI replies while preserving successful replies', async () => {
    const unavailable = await (await chat(event(locale, { message: 'hello' }))).json()
    expect(unavailable.data.reply).toContain(locale === 'en-US' ? 'unavailable' : locale === 'ja-JP' ? '利用できません' : '暂未开启')
    mocks.ai.isInitialized = true
    mocks.ai.llm.chat.mockResolvedValue({ success: false, error: { message: 'offline' } })
    const failed = await (await chat(event(locale, { message: 'hello' }))).json()
    expect(failed.data.reply).toContain(locale === 'en-US' ? 'could not reply' : locale === 'ja-JP' ? '返信できませんでした' : '暂时无法回复')
    mocks.ai.llm.chat.mockResolvedValue({ success: true, data: { choices: [{ message: { content: 'provider reply' } }] } })
    expect((await (await chat(event(locale, { message: 'hello' }))).json()).data.reply).toBe('provider reply')
  })

  it('localizes delivery unavailable, failed and successful responses', async () => {
    const body = { name: 'Test', email: 'test@example.test', message: 'hello' }
    const unavailable = await (await contact(event(locale, body))).json()
    expect(unavailable.data).toMatchObject({ sent: false })
    expect(unavailable.data.message).toContain(locale === 'en-US' ? 'not configured' : locale === 'ja-JP' ? '設定されていません' : '尚未配置')
    mocks.reach.isInitialized = true
    vi.stubEnv('HAI_CONTACT_RECIPIENT', 'recipient@example.test')
    mocks.reach.send.mockResolvedValue({ success: false, error: { message: 'offline' } })
    const failed = await (await contact(event(locale, body))).json()
    expect(failed.data.sent).toBe(false)
    expect(failed.data.message).toContain(locale === 'en-US' ? 'failed' : locale === 'ja-JP' ? '失敗' : '失败')
    mocks.reach.send.mockResolvedValue({ success: true, data: {} })
    const sent = await (await contact(event(locale, body))).json()
    expect(sent.data.sent).toBe(true)
    expect(sent.data.message).toContain(locale === 'en-US' ? 'successfully' : locale === 'ja-JP' ? '送信しました' : '成功')
  })
})
