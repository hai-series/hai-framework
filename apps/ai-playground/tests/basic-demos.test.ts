import { ai } from '@h-ai/ai'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { basicDemoUnavailable, runBasicDemo } from '../src/lib/server/basic-demos.js'

describe('aI Playground local demos', () => {
  beforeAll(async () => {
    const result = await ai.init({})
    expect(result.success).toBe(true)
  })

  afterAll(async () => {
    await ai.close()
  })

  function run(id: Parameters<typeof runBasicDemo>[0], input: string) {
    return runBasicDemo(id, input, new AbortController().signal, 'browser-demo-test')
  }

  it('passes multilingual fragments through the real AI stream processor', async () => {
    const text = 'abc你好🌞de\nxyz'
    await expect(run('stream', text)).resolves.toEqual({
      success: true,
      data: { text, chunks: 2 },
    })
  })

  it('shows token overhead, budget-based compression and parsed HTML without model calls', async () => {
    const token = await run('token', '你好 world')
    expect(token).toMatchObject({
      success: true,
      data: {
        textTokens: expect.any(Number),
        messageTokens: expect.any(Number),
      },
    })
    await expect(run('compress', 'Original conversation')).resolves.toMatchObject({
      success: true,
      data: {
        removedCount: 2,
        messages: [
          { role: 'user', content: 'Summarize the next step.' },
        ],
      },
    })
    await expect(run('file', '<h1>Example title</h1>')).resolves.toMatchObject({
      success: true,
      data: { text: 'Example title', method: 'html' },
    })
  })

  it('composes a persona without retaining a row and reads the isolated context preview', async () => {
    await expect(run('persona', 'Only use verified facts')).resolves.toMatchObject({
      success: true,
      data: {
        systemPrompt: expect.stringContaining('Only use verified facts'),
      },
    })
    await expect(ai.persona.list({ objectId: 'browser-demo-test' })).resolves.toEqual({ success: true, data: [] })
    await expect(run('context', 'Use short answers')).resolves.toMatchObject({
      success: true,
      data: {
        usage: { budget: 512 },
        messages: [
          { role: 'system', content: 'Use short answers' },
        ],
      },
    })
  })

  it('identifies embedding and rerank scenarios needed by model-backed examples', () => {
    expect(basicDemoUnavailable()).toEqual({
      embedding: 'embedding',
      retrieval: 'embedding',
      rag: 'embedding',
      knowledge: 'embedding',
      rerank: 'rerank',
    })
  })
})
