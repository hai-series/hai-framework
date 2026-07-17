import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'

interface MemoryMock {
  id: string
  content: string
  type: 'fact' | 'preference' | 'event' | 'entity' | 'instruction'
  importance: number
  createdAt: number
}

test('可在一个页面操作 LLM、Memory、TTS 与 ASR', async ({ page }) => {
  const memories: MemoryMock[] = []

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (url.pathname === '/api/status') {
      await route.fulfill({
        json: {
          success: true,
          data: {
            ready: true,
            provider: 'mimo',
            llmModel: 'demo-llm',
            ttsModel: 'demo-tts',
            asrModel: 'demo-asr',
            ttsVoices: ['demo_voice'],
            memoryMode: 'ephemeral',
          },
        },
      })
      return
    }

    if (url.pathname === '/api/chat/stream') {
      await route.fulfill({
        contentType: 'application/x-ndjson',
        body: [
          JSON.stringify({ text: '这是 AI 的' }),
          JSON.stringify({ text: '这是 AI 的测试回复。', final: true }),
          '',
        ].join('\n'),
      })
      return
    }

    if (url.pathname === '/api/chat') {
      await route.fulfill({ json: { success: true, data: { reply: '这是 AI 的测试回复。' } } })
      return
    }

    if (url.pathname === '/api/chat/remember') {
      await route.fulfill({ json: { success: true, data: { remembered: 1 } } })
      return
    }

    if (url.pathname === '/api/tts') {
      await route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        body: Buffer.from('RIFFmockWAVE'),
      })
      return
    }

    if (url.pathname === '/api/asr') {
      await route.fulfill({ json: { success: true, data: { text: '这是语音识别测试。' } } })
      return
    }

    if (url.pathname === '/api/memories' && method === 'GET') {
      await route.fulfill({ json: { success: true, data: memories } })
      return
    }

    if (url.pathname === '/api/memories' && method === 'POST') {
      const body = request.postDataJSON() as Omit<MemoryMock, 'id' | 'createdAt'>
      const memory: MemoryMock = { ...body, id: 'memory-1', createdAt: Date.now() }
      memories.unshift(memory)
      await route.fulfill({ json: { success: true, data: memory } })
      return
    }

    if (url.pathname === '/api/memories' && method === 'DELETE') {
      memories.splice(0)
      await route.fulfill({ json: { success: true } })
      return
    }

    if (url.pathname.startsWith('/api/memories/') && method === 'DELETE') {
      memories.splice(0)
      await route.fulfill({ json: { success: true } })
      return
    }

    await route.abort()
  })

  await page.goto('/')
  await expect(page.getByTestId('connection-status')).toContainText('已连接')

  await page.getByLabel('聊天消息').fill('你好，请介绍这个实验台。')
  await page.getByTestId('chat-send').click()
  await expect(page.locator('[data-role="assistant"]').last()).toContainText('这是 AI 的测试回复。')

  await page.getByPlaceholder('添加一条事实、偏好或长期指令…').fill('我偏好简洁的中文回答')
  await page.getByTestId('memory-add').click()
  await expect(page.getByTestId('memory-list')).toContainText('我偏好简洁的中文回答')

  await page.getByTestId('tts-run').click()
  await expect(page.getByTestId('tts-audio')).toBeVisible()

  await page.getByTestId('asr-file').setInputFiles({
    name: 'speech.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('RIFFmockWAVE'),
  })
  await page.getByTestId('asr-run').click()
  await expect(page.getByTestId('asr-result')).toContainText('这是语音识别测试。')

  await page.getByTestId('mic-start').click()
  await expect(page.getByTestId('mic-stop')).toBeVisible()
  await expect(page.getByTestId('mic-result')).toContainText('这是语音识别测试。', { timeout: 20_000 })
  // 结果必须在录音仍进行时出现，而不是点击停止后才开始转写
  await expect(page.getByTestId('mic-stop')).toBeVisible()
  await page.getByTestId('mic-stop').click()
  await expect(page.getByTestId('mic-start')).toBeEnabled({ timeout: 20_000 })
})

for (const secondUseMemory of [true, false]) {
  test(`记忆提取挂起时第二轮仍可返回（useMemory=${secondUseMemory}）`, async ({ page }) => {
    let chatCount = 0
    let markRememberStarted: (() => void) | undefined
    let releaseRemember: (() => void) | undefined
    const rememberStarted = new Promise<void>((resolve) => {
      markRememberStarted = resolve
    })
    const rememberReleased = new Promise<void>((resolve) => {
      releaseRemember = resolve
    })

    await page.route('**/api/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())

      if (url.pathname === '/api/status') {
        await route.fulfill({
          json: {
            success: true,
            data: {
              ready: true,
              provider: 'mimo',
              llmModel: 'demo-llm',
              ttsModel: 'demo-tts',
              asrModel: 'demo-asr',
              ttsVoices: ['demo_voice'],
              memoryMode: 'ephemeral',
            },
          },
        })
        return
      }

      if (url.pathname === '/api/memories' && request.method() === 'GET') {
        await route.fulfill({ json: { success: true, data: [] } })
        return
      }

      if (url.pathname === '/api/chat/stream') {
        chatCount++
        const reply = chatCount === 1 ? '第一轮回复。' : '第二轮回复。'
        await route.fulfill({
          contentType: 'application/x-ndjson',
          body: `${JSON.stringify({ text: reply, final: true })}\n`,
        })
        return
      }

      if (url.pathname === '/api/chat/remember') {
        markRememberStarted?.()
        await rememberReleased
        await route.fulfill({ json: { success: true, data: { remembered: 1 } } }).catch(() => {})
        return
      }

      await route.abort()
    })

    await page.goto('/')
    await page.getByLabel('聊天消息').fill('第一个问题')
    await page.getByTestId('chat-send').click()
    await expect(page.locator('[data-role="assistant"]').last()).toContainText('第一轮回复。')
    await rememberStarted
    await expect(page.getByText('正在提取记忆…')).toBeVisible()

    if (!secondUseMemory)
      await page.getByLabel('启用记忆').uncheck()
    await page.getByLabel('聊天消息').fill('第二个问题')
    await page.getByTestId('chat-send').click()

    await expect(page.locator('[data-role="assistant"]').last()).toContainText('第二轮回复。')
    releaseRemember?.()
    await expect(page.getByText('正在提取记忆…')).toBeHidden()
  })
}
