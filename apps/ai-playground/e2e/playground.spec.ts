import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'

interface MemoryMock {
  id: string
  content: string
  type: 'fact' | 'preference' | 'event' | 'entity' | 'instruction'
  importance: number
  createdAt: number
}

test('每项实验都显示可复制的 TypeScript 接入示例', async ({ page, context }, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.route('**/api/status', route => route.fulfill({
    json: {
      success: true,
      data: {
        ready: true,
        llmModel: 'demo-llm',
        ttsModel: 'demo-tts',
        asrModel: 'demo-asr',
        imageModel: 'demo-image',
        ttsVoices: [],
        memoryMode: 'ephemeral',
      },
    },
  }))
  await page.route('**/api/demos', route => route.fulfill({
    json: {
      success: true,
      data: { unavailable: {} },
    },
  }))
  await page.route('**/api/memories?*', route => route.fulfill({
    json: { success: true, data: [] },
  }))
  await page.goto('/')
  const setup = page.getByTestId('api-guide-setup-panel')
  await setup.locator('summary').click()
  await expect(setup.locator('pre')).toContainText('await ai.init(')
  await page.goto('/?section=models')
  const guide = page.getByTestId('api-guide-llm')
  await expect(guide.getByText('ai.llm.ask', { exact: true })).toBeVisible()
  await guide.locator('summary').click()
  await expect(guide.getByText('调用参数', { exact: true })).toBeVisible()
  await expect(guide.getByText('返回值', { exact: true })).toBeVisible()
  await expect(guide.getByText('所需配置', { exact: true })).toBeVisible()
  await expect(guide.locator('pre')).toContainText('await ai.llm.ask(')
  await guide.locator('[data-copy-code]').click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('await ai.llm.ask(')
  await page.screenshot({
    path: testInfo.outputPath('playground-api-example-desktop.png'),
  })

  const sections = [
    [
      'models',
      [
        'llm',
        'stream',
        'structured',
        'reasoning',
      ],
      ['chat-panel'],
    ],
    [
      'knowledge',
      [
        'file',
        'embedding',
        'rerank',
        'retrieval',
        'rag',
        'knowledge',
      ],
      [],
    ],
    [
      'context',
      [
        'persona',
        'context',
        'token',
        'summary',
        'compress',
      ],
      ['memory-panel'],
    ],
    [
      'agents',
      [
        'tools',
        'mcp',
        'mcp-remote',
        'mcp-job',
        'a2a',
        'acp',
      ],
      [],
    ],
    [
      'media',
      ['audio-capabilities', 'tts-stream'],
      [
        'image-panel',
        'tts-panel',
        'asr-panel',
        'mic-panel',
      ],
    ],
  ] as const
  for (const [section, demos, panels] of sections) {
    await page.getByTestId(`lab-nav-${section}`).click()
    for (const id of demos) {
      await page.getByTestId(`demo-select-${id}`).click()
      await expect(page.getByTestId(`api-guide-${id}`).locator('summary')).toBeVisible()
      await expect(page.getByTestId(`api-guide-${id}`).locator('pre')).toContainText('from \'@h-ai/ai\'')
    }
    for (const id of panels) {
      await expect(page.getByTestId(`api-guide-${id}`).locator('summary')).toBeVisible()
      await expect(page.getByTestId(`api-guide-${id}`).locator('pre')).toContainText('from \'@h-ai/ai\'')
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const imageGuide = page.getByTestId('api-guide-image-panel')
  await imageGuide.locator('summary').click()
  await expect(imageGuide.getByText('调用参数', { exact: true })).toBeVisible()
  await expect(imageGuide.locator('pre')).toContainText('ai.image.generate(')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('playground-api-example-mobile.png'),
  })
})

test('接入说明跟随中英日语界面', async ({ page, context, baseURL }) => {
  if (!baseURL)
    throw new Error('The language test requires a base URL')
  for (const [locale, labels] of [
    [
      'zh-CN',
      ['调用参数', '返回值', '所需配置'],
    ],
    [
      'en-US',
      ['Parameters', 'Returns', 'Required configuration'],
    ],
    [
      'ja-JP',
      ['パラメーター', '戻り値', '必要な設定'],
    ],
  ] as const) {
    await context.addCookies([
      { name: 'PARAGLIDE_LOCALE', value: locale, url: baseURL },
    ])
    await page.goto('/?section=models')
    const guide = page.getByTestId('api-guide-llm')
    await guide.locator('summary').click()
    for (const label of labels)
      await expect(guide.getByText(label, { exact: true })).toBeVisible()
    await expect(guide.locator('pre')).toContainText('await ai.llm.ask(')
  }
})

test('可在一个页面操作 LLM、文生图、Memory、TTS 与 ASR', async ({ page }, testInfo) => {
  const memories: MemoryMock[] = []

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (url.pathname === '/api/demos') {
      await route.fulfill({
        json: {
          success: true,
          data: method === 'GET'
            ? {
                unavailable: { 'mcp-remote': 'mcp-remote' },
              }
            : {
                result: { received: request.postDataJSON().input, tokens: 4 },
              },
        },
      })
      return
    }

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
            imageProvider: 'pollinations',
            imageModel: 'zimage',
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
      await route.fulfill({
        json: {
          success: true,
          data: { reply: '这是 AI 的测试回复。' },
        },
      })
      return
    }

    if (url.pathname === '/api/chat/remember') {
      await route.fulfill({
        json: {
          success: true,
          data: { remembered: 1 },
        },
      })
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

    if (url.pathname === '/api/image') {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XwM8WQAAAABJRU5ErkJggg==', 'base64'),
      })
      return
    }

    if (url.pathname === '/api/asr') {
      await route.fulfill({
        json: {
          success: true,
          data: { text: '这是语音识别测试。' },
        },
      })
      return
    }

    if (url.pathname === '/api/asr/stream') {
      await route.fulfill({ contentType: 'application/x-ndjson', body: '{"text":"开始转写"}\n{"text":"流式识别完成。","final":true}\n' })
      return
    }

    if (url.pathname === '/api/memories' && method === 'GET') {
      await route.fulfill({
        json: { success: true, data: memories },
      })
      return
    }

    if (url.pathname === '/api/memories' && method === 'POST') {
      const body = request.postDataJSON() as Omit<MemoryMock, 'id' | 'createdAt'>
      const memory: MemoryMock = {
        ...body,
        id: 'memory-1',
        createdAt: Date.now(),
      }
      memories.unshift(memory)
      await route.fulfill({
        json: { success: true, data: memory },
      })
      return
    }

    if (url.pathname === '/api/memories' && method === 'DELETE') {
      memories.splice(0)
      await route.fulfill({
        json: { success: true },
      })
      return
    }

    if (url.pathname.startsWith('/api/memories/') && method === 'DELETE') {
      memories.splice(0)
      await route.fulfill({
        json: { success: true },
      })
      return
    }

    await route.abort()
  })

  await page.goto('/')
  await expect(page.getByTestId('connection-status')).toContainText('已连接')
  await expect(page.getByTestId('setup-guide')).toBeVisible()
  for (const width of [390, 1440, 1920, 2560, 3840]) {
    await page.setViewportSize({ width, height: 960 })
    const availableWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await page.locator('main').boundingBox())!.width).toBeGreaterThan(availableWidth - 2)
  }
  await page.setViewportSize({ width: 1280, height: 960 })
  await page.screenshot({
    path: testInfo.outputPath('playground-setup-desktop.png'),
  })

  await page.getByTestId('lab-nav-context').click()
  await page.getByTestId('demo-select-token').click()
  await page.getByTestId('demo-input').fill('测试 token')
  await page.getByTestId('demo-run').click()
  await expect(page.getByTestId('demo-output')).toContainText('"tokens": 4')
  await page.screenshot({
    path: testInfo.outputPath('playground-context-desktop.png'),
  })
  await page.getByTestId('lab-nav-agents').click()
  await page.getByTestId('demo-select-mcp-remote').click()
  await expect(page.getByTestId('demo-run')).toBeDisabled()
  await page.reload()
  await expect(page.getByTestId('demo-select-mcp-remote')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByTestId('demo-select-mcp-remote').click()
  await expect(page.getByTestId('demo-run')).toBeDisabled()
  await page.screenshot({
    path: testInfo.outputPath('playground-integrations-mobile.png'),
  })
  await page.setViewportSize({ width: 1280, height: 960 })
  await page.getByTestId('lab-nav-models').click()

  await page.getByLabel('聊天消息').fill('你好，请介绍这个实验台。')
  await page.getByTestId('chat-send').click()
  await expect(page.locator('[data-role="assistant"]').last()).toContainText('这是 AI 的测试回复。')
  await expect(page.locator('.hai-toast-item[data-variant="success"]')).toContainText('本轮提取了 1 条记忆')

  await page.getByTestId('lab-nav-context').click()
  await page.getByPlaceholder('添加一条事实、偏好或长期指令…').fill('我偏好简洁的中文回答')
  await page.getByTestId('memory-add').click()
  await expect(page.getByTestId('memory-list')).toContainText('我偏好简洁的中文回答')

  await page.getByTestId('lab-nav-media').click()
  await page.getByTestId('image-references').setInputFiles({
    name: 'reference.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgo=', 'base64'),
  })
  await page.getByTestId('image-run').click()
  await expect(page.getByTestId('image-result')).toBeVisible()

  await page.getByTestId('tts-run').click()
  await expect(page.getByTestId('tts-audio')).toBeVisible()

  await page.getByTestId('asr-file').setInputFiles({
    name: 'speech.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('RIFFmockWAVE'),
  })
  await page.getByTestId('asr-run').click()
  await expect(page.getByTestId('asr-result')).toContainText('这是语音识别测试。')
  await page.getByTestId('asr-stream-run').click()
  await expect(page.getByTestId('asr-result')).toContainText('流式识别完成。')

  await page.getByTestId('mic-start').click()
  await expect(page.getByTestId('mic-stop')).toBeVisible()
  await expect(page.getByTestId('mic-result')).toContainText('这是语音识别测试。', { timeout: 20_000 })
  // 结果必须在录音仍进行时出现，而不是点击停止后才开始转写
  await expect(page.getByTestId('mic-stop')).toBeVisible()
  await page.getByTestId('mic-stop').click()
  await expect(page.getByTestId('mic-start')).toBeEnabled({ timeout: 20_000 })
  const dismiss = page.locator('.hai-toast-layer').getByRole('button', { name: /^(关闭|Dismiss|閉じる)$/ })
  for (let count = 0; count < 10 && await dismiss.count(); count++)
    await dismiss.click()
  await page.route('**/api/image', route => route.fulfill({
    status: 500,
    json: {
      success: false,
      error: { code: 'PROVIDER_ERROR', message: 'Private provider details (traceId: ai-request)' },
    },
  }))
  await page.getByTestId('image-run').click()
  const notification = page.locator('.hai-toast-item[data-variant=error]')
  await expect(notification).toBeVisible()
  await expect(notification).not.toContainText('traceId:')
  await expect(notification.locator('code')).toHaveCount(0)
  await expect(notification).not.toContainText('Private provider')
  await notification.getByRole('button', { name: '查看排查信息', exact: true }).click()
  await expect(notification.locator('code')).toHaveText('ai-request')
  await expect(notification).toContainText('联系客户支持或开发人员时，请提供此编号')
  await expect(notification.getByRole('button', { name: '复制编号', exact: true })).toBeVisible()
  await expect(notification).not.toContainText('Private provider')
  await page.setViewportSize({ width: 390, height: 960 })
  await expect(notification).toBeInViewport({ ratio: 1 })
  await page.screenshot({
    path: testInfo.outputPath('ai-error-toast-390.png'),
    fullPage: true,
  })
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
              imageProvider: 'pollinations',
              imageModel: 'zimage',
              ttsVoices: ['demo_voice'],
              memoryMode: 'ephemeral',
            },
          },
        })
        return
      }

      if (url.pathname === '/api/memories' && request.method() === 'GET') {
        await route.fulfill({
          json: { success: true, data: [] },
        })
        return
      }

      if (url.pathname === '/api/chat/stream') {
        chatCount++
        const reply = chatCount === 1
          ? '第一轮回复。'
          : '第二轮回复。'
        await route.fulfill({
          contentType: 'application/x-ndjson',
          body: `${JSON.stringify({ text: reply, final: true })}\n`,
        })
        return
      }

      if (url.pathname === '/api/chat/remember') {
        markRememberStarted?.()
        await rememberReleased
        await route.fulfill({
          json: {
            success: true,
            data: { remembered: 1 },
          },
        }).catch(() => {})
        return
      }

      await route.abort()
    })

    await page.goto('/?section=models')
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
