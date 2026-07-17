import process from 'node:process'
import { expect, test } from '@playwright/test'

const live = process.env.HAI_E2E_LIVE === '1'

test.skip(!live, 'Set HAI_E2E_LIVE=1 to call the real AI APIs')

test('真实 LLM、Memory、TTS、ASR 链路可用', async ({ request }) => {
  test.setTimeout(180_000)
  const profileId = `live-${Date.now()}`

  const chat = await request.post('/api/chat/stream', {
    data: {
      profileId,
      sessionId: `${profileId}-session`,
      messages: [{ role: 'user', content: 'AI live test passed' }],
      useMemory: false,
    },
  })
  expect(chat.ok(), await chat.text()).toBe(true)
  const chatEvents = (await chat.text())
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as { text?: string, final?: boolean, error?: boolean })
  expect(chatEvents.some(event => event.error)).toBe(false)
  expect(chatEvents.at(-1)?.final).toBe(true)
  expect((chatEvents.at(-1)?.text ?? '').length).toBeGreaterThan(0)

  const created = await request.post('/api/memories', {
    data: {
      profileId,
      content: 'Live E2E prefers concise answers',
      type: 'preference',
      importance: 0.9,
    },
  })
  expect(created.ok(), await created.text()).toBe(true)

  const listed = await request.get(`/api/memories?profileId=${profileId}&query=`)
  expect(listed.ok(), await listed.text()).toBe(true)
  const listedBody = await listed.json()
  expect(listedBody.data.some((entry: { content: string }) => entry.content.includes('Live E2E'))).toBe(true)

  const memoryChat = await request.post('/api/chat/stream', {
    data: {
      profileId,
      sessionId: `${profileId}-memory-session`,
      messages: [{ role: 'user', content: 'According to memory, what answer style does Live E2E prefer?' }],
      useMemory: true,
    },
  })
  expect(memoryChat.ok(), await memoryChat.text()).toBe(true)
  const memoryChatEvents = (await memoryChat.text())
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as { text?: string, final?: boolean, error?: boolean })
  expect(memoryChatEvents.some(event => event.error)).toBe(false)
  expect(memoryChatEvents.at(-1)?.final).toBe(true)
  expect((memoryChatEvents.at(-1)?.text ?? '').length).toBeGreaterThan(0)

  const phrase = '你好，这是海框架语音链路测试。'
  const tts = await request.post('/api/tts', {
    data: {
      text: phrase,
      instruction: '自然清晰地朗读',
    },
  })
  expect(tts.ok(), await tts.text()).toBe(true)
  expect(tts.headers()['content-type']).toContain('audio/wav')
  const wav = await tts.body()
  expect(wav.length).toBeGreaterThan(100)

  const asr = await request.post('/api/asr', {
    multipart: {
      language: 'zh',
      audio: {
        name: 'live-tts.wav',
        mimeType: 'audio/wav',
        buffer: wav,
      },
    },
  })
  expect(asr.ok(), await asr.text()).toBe(true)
  const asrBody = await asr.json()
  expect(asrBody.success).toBe(true)
  expect(asrBody.data.text.length).toBeGreaterThan(2)

  // 流式语音识别（麦克风实时转写示例使用）：验证渐进式 NDJSON 转写输出
  const asrStream = await request.post('/api/asr/stream', {
    multipart: {
      language: 'zh',
      audio: {
        name: 'live-tts.wav',
        mimeType: 'audio/wav',
        buffer: wav,
      },
    },
  })
  expect(asrStream.ok(), await asrStream.text()).toBe(true)
  const streamEvents = (await asrStream.text())
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as { text?: string, final?: boolean, error?: boolean })
  expect(streamEvents.some(event => event.error)).toBe(false)
  expect(streamEvents.at(-1)?.final).toBe(true)
  expect((streamEvents.at(-1)?.text ?? '').length).toBeGreaterThan(2)

  const cleared = await request.delete(`/api/memories?profileId=${profileId}`)
  expect(cleared.ok(), await cleared.text()).toBe(true)
})
