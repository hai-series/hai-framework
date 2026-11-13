import { ai } from '@h-ai/ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { integrationDemoUnavailable, registerPlaygroundIntegrations, runIntegrationDemo } from '#lib/server/integration-demos.js'

const signal = new AbortController().signal
const browserId = 'browser-owner'

afterEach(() => ai.close())

describe('playground integration examples', () => {
  it('reads audio capabilities and counts streamed MiMo chunks', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response([
      'data: {"choices":[{"delta":{"audio":{"data":"AQID"}}}]}',
      '',
      'data: {"choices":[{"delta":{"audio":{"data":"BAU="}}}]}',
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n'), {
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    try {
      expect((await ai.init({
        audio: {
          models: [
            {
              id: 'asr',
              provider: 'mimo',
              model: 'fixture-asr',
              operations: ['transcribe'],
              baseUrl: 'https://fixture.invalid/v1',
              apiKey: 'fixture-key',
            },
            {
              id: 'tts',
              provider: 'mimo',
              model: 'fixture-tts',
              operations: ['synthesize'],
              baseUrl: 'https://fixture.invalid/v1',
              apiKey: 'fixture-key',
            },
          ],
          transcribeModel: 'asr',
          synthesizeModel: 'tts',
        },
      })).success).toBe(true)
      const capabilities = await runIntegrationDemo('audio-capabilities', 'check', signal, browserId)
      expect(capabilities).toMatchObject({
        success: true,
        data: {
          transcription: expect.any(Object),
          synthesis: expect.any(Object),
        },
      })
      expect(fetcher).not.toHaveBeenCalled()
      expect(await runIntegrationDemo('tts-stream', 'read this', signal, browserId)).toMatchObject({
        success: true,
        data: {
          started: { format: 'wav' },
          audioChunks: 2,
          bytes: 5,
          completed: true,
        },
      })
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
    finally {
      fetcher.mockRestore()
    }
  })

  it('runs the function tool and returns the local MCP tool, resource and prompt', async () => {
    expect((await ai.init()).success).toBe(true)
    expect(registerPlaygroundIntegrations().success).toBe(true)
    const tools = await runIntegrationDemo('tools', 'two words', signal, browserId)
    expect(tools).toMatchObject({
      success: true,
      data: {
        toolResult: { role: 'tool', content: '{"words":2}' },
      },
    })
    const mcp = await runIntegrationDemo('mcp', 'hello', signal, browserId)
    expect(mcp).toMatchObject({
      success: true,
      data: {
        tool: { text: 'hello' },
        resource: { uri: 'playground://handbook' },
        prompt: [
          {
            role: 'user',
            content: { text: 'hello' },
          },
        ],
      },
    })
    expect(await integrationDemoUnavailable()).toMatchObject({ 'mcp-remote': 'mcp-remote', 'a2a': 'a2a', 'acp': 'acp' })
    expect((await runIntegrationDemo('mcp-remote', 'hello', signal, browserId)).success).toBe(false)
  })

  it('runs a real SDK A2A message and only returns the public reply', async () => {
    expect((await ai.init({
      a2a: {
        agentCard: { name: 'Playground', url: 'https://example.invalid/a2a' },
      },
    })).success).toBe(true)
    expect(registerPlaygroundIntegrations().success).toBe(true)
    const result = await runIntegrationDemo('a2a', 'hello', signal, browserId)
    expect(result).toMatchObject({
      success: true,
      data: {
        card: { name: 'Playground' },
        response: {
          result: {
            message: {
              parts: [
                { text: 'hello' },
              ],
            },
          },
        },
      },
    })
  })
})
