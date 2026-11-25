/** 从 typed client 调用 AI 扩展，并验证 Serv 上的身份、流及文件边界。 */

import type { ChatCompletionChunk } from '@h-ai/ai'
import type { HaiResult } from '@h-ai/core'
import type { AiExtensionProcedureDeps, ServContext } from '../src/index.js'
import { ai, HaiAIError } from '@h-ai/ai'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { cache } from '@h-ai/cache'
import { core, HaiCommonError } from '@h-ai/core'
import { HaiIamError, iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'
import { describe, expect, it, vi } from 'vitest'
import { serv } from '../src/index.js'

const extension = apiContract.extensions.ai
const contract = apiContract.create({ ai: extension })
const baseUrl = 'https://ai.test/api/v1'
const requestInput = {
  messages: [
    { role: 'user', content: 'Find the order' },
  ],
} as const
const MEDIA_BODY_LIMIT = 11 * 1024 * 1024
const audioBytes = new Uint8Array([
  0x52,
  0x49,
  0x46,
  0x46,
  0,
  0,
  0,
  0,
  0x57,
  0x41,
  0x56,
  0x45,
])
const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

function setup(deps: AiExtensionProcedureDeps, transportRoutes = [
  { procedure: extension.chats.streamCompletion, maxRequestBytes: 64 * 1024 },
  { procedure: extension.audio.transcribe, maxRequestBytes: MEDIA_BODY_LIMIT },
  { procedure: extension.audio.synthesize, maxRequestBytes: 64 * 1024 },
  { procedure: extension.images.generate, maxRequestBytes: MEDIA_BODY_LIMIT },
]) {
  const app = serv.createApp({
    contract,
    procedures: {
      ai: serv.createAiExtensionProcedures(deps),
    },
    transportRoutes,
    http: { openapi: false, docs: false },
    createContext: ({ request }): ServContext => {
      const auth = request.headers.get('authorization')
      const userId = auth === 'Bearer alice'
        ? 'alice'
        : auth === 'Bearer bob'
          ? 'bob'
          : undefined
      return {
        request,
        logger: core.logger.child({ module: 'serv-test' }),
        locale: 'en-US',
        requestId: 'ai-extension-test',
        scopeId: 'test-tenant',
        session: userId
          ? { userId, permissions: [], roles: [] }
          : undefined,
      }
    },
  })
  return {
    app,
    client: apiClient.create(contract),
  }
}

async function withClient<T>(
  fixture: ReturnType<typeof setup>,
  user: 'alice' | 'bob' | null,
  callback: (client: ReturnType<typeof setup>['client']) => Promise<T>,
) {
  const { client, app } = fixture
  const ready = await client.init({
    baseUrl,
    fetch: serv.toFetch(app),
    headers: user
      ? { authorization: `Bearer ${user}` }
      : undefined,
  })
  expect(ready.success).toBe(true)
  try {
    return await callback(client)
  }
  finally {
    await client.close()
  }
}

function expectSuccess<T>(result: HaiResult<T>): T {
  expect(result.success).toBe(true)
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

function partialToolChunk(): ChatCompletionChunk {
  return {
    id: 'chat-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'approved-model',
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'call-1',
              type: 'function',
              function: { name: 'getOrder', arguments: '{"id":' },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  }
}

function audioMock() {
  return {
    transcribe: vi.fn<NonNullable<AiExtensionProcedureDeps['ai']['audio']>['transcribe']>(async () => core.ok({
      text: 'Hello',
      language: 'en',
      durationMs: 125,
    })),
    synthesize: vi.fn<NonNullable<AiExtensionProcedureDeps['ai']['audio']>['synthesize']>(async () => core.ok({ data: audioBytes, format: 'wav' })),
    getCapabilities: vi.fn<NonNullable<AiExtensionProcedureDeps['ai']['audio']>['getCapabilities']>(() => core.ok({
      synthesize: {
        supported: true,
        incrementalTextInput: false,
        streamingAudioOutput: true,
        presetVoice: true,
      },
      transcribe: {
        supported: true,
        realtimeAudioInput: true,
        streamingTranscriptOutput: true,
        speechBoundaryEvents: true,
      },
    })),
  }
}

describe('serv AI HTTP extensions', () => {
  it('publishes SSE and multipart for the selected contract routes', async () => {
    const spec = await serv.generateSpec(contract)
    const stream = spec.paths?.[apiContract.pathOf(extension.chats.streamCompletion)]?.post
    const transcription = spec.paths?.[apiContract.pathOf(extension.audio.transcribe)]?.post
    const image = spec.paths?.[apiContract.pathOf(extension.images.generate)]?.post
    expect(stream?.responses?.[200]).toHaveProperty(['content', 'text/event-stream', 'schema'])
    expect(transcription?.requestBody).toHaveProperty(['content', 'multipart/form-data', 'schema'])
    expect(transcription?.requestBody).not.toHaveProperty(['content', 'application/json'])
    expect(image?.requestBody).toHaveProperty(['content', 'multipart/form-data', 'schema'])
  })

  it('scopes writes to the authenticated owner and applies the explicit scope for clearing', async () => {
    expectSuccess(await ai.init({
      memory: { embeddingEnabled: false },
    }))
    try {
      const privateScope = {
        objectId: 'alice',
        scope: { app: 'other' },
      }
      const otherApp = ai.memory.scoped(privateScope)
      const otherMemory = expectSuccess(await otherApp.add({ type: 'fact', content: 'Other app' }))
      const bobMemory = expectSuccess(await ai.memory.scoped({ objectId: 'bob' }).add({ type: 'fact', content: 'Bob secret' }))
      await withClient(setup({ ai }), 'alice', async ({ ai: clientAi }) => {
        expect(await clientAi.memories.add({ objectId: 'bob', type: 'fact', content: 'Injected' })).toMatchObject({
          success: false,
          error: { code: HaiCommonError.FORBIDDEN.code },
        })
        expect(await clientAi.memories.update({ id: bobMemory.id, content: 'Injected' })).toMatchObject({
          success: false,
          error: { code: HaiAIError.MEMORY_NOT_FOUND.code },
        })
        expect(await clientAi.memories.clear({})).toMatchObject({
          success: false,
          error: { code: HaiCommonError.FORBIDDEN.code },
        })
      })
      const fixture = setup({
        ai,
        resolveMemoryScope: ({ context, objectId }) => objectId === context.session.userId
          ? {
              objectId,
              scope: { app: 'chat' },
            }
          : null,
      })
      await withClient(fixture, 'alice', async ({ ai: clientAi }) => {
        const own = expectSuccess(await clientAi.memories.add({ type: 'fact', content: 'My fact' }))
        expect(expectSuccess(await clientAi.memories.update({ id: own.id, content: 'Changed' })).content).toBe('Changed')
        expect(await clientAi.memories.remove({ id: otherMemory.id })).toMatchObject({
          success: false,
          error: { code: HaiAIError.MEMORY_NOT_FOUND.code },
        })
        expectSuccess(await clientAi.memories.remove({ id: own.id }))
        expectSuccess(await clientAi.memories.add({ type: 'fact', content: 'Clear this fact' }))
        expectSuccess(await clientAi.memories.clear({
          types: ['fact'],
        }))
        expect(expectSuccess(await ai.memory.scoped({
          objectId: 'alice',
          scope: { app: 'chat' },
        }).list())).toEqual([])
        expect(expectSuccess(await otherApp.get(otherMemory.id)).content).toBe('Other app')
      })
    }
    finally {
      await ai.close()
    }
  })

  it('streams tool deltas before completion with the authenticated object and session', async () => {
    const providerCanFinish = Promise.withResolvers<void>()
    const chatStream = vi.fn<NonNullable<AiExtensionProcedureDeps['ai']['llm']>['chatStream']>(async function* () {
      yield partialToolChunk()
      await providerCanFinish.promise
    })
    const fixture = setup({
      ai: {
        llm: { chatStream },
      },
    })
    try {
      await withClient(fixture, null, async ({ ai }) => {
        expect(await ai.chats.streamCompletion({
          messages: [...requestInput.messages],
        })).toMatchObject({
          success: false,
          error: { httpStatus: 401 },
        })
      })
      await withClient(fixture, 'alice', async ({ ai }) => {
        expect(await ai.chats.streamCompletion({
          messages: [...requestInput.messages],
          objectId: 'bob',
        })).toMatchObject({
          success: false,
          error: { httpStatus: 403 },
        })
        expect(chatStream).not.toHaveBeenCalled()
        const stream = await ai.chats.streamCompletion({
          messages: [...requestInput.messages],
          sessionId: 'conversation',
        })
        if (!(Symbol.asyncIterator in stream))
          throw new Error(stream.error.message)
        const iterator = stream[Symbol.asyncIterator]()
        expect(await iterator.next()).toMatchObject({
          done: false,
          value: {
            type: 'delta',
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call-1',
                      function: { arguments: '{"id":' },
                    },
                  ],
                },
              },
            ],
          },
        })
        expect(chatStream).toHaveBeenCalledOnce()
        expect(chatStream).toHaveBeenCalledWith(expect.objectContaining({ objectId: 'alice', sessionId: 'conversation' }))
        providerCanFinish.resolve()
        expect(await iterator.next()).toMatchObject({
          done: false,
          value: { type: 'done' },
        })
        expect(await iterator.next()).toMatchObject({ done: true })
      })
    }
    finally {
      providerCanFinish.resolve()
    }
  })

  it('ends the provider iterator on caller cancellation and hides upstream exceptions', async () => {
    const settled = Promise.withResolvers<void>()
    const chatStream = vi.fn<NonNullable<AiExtensionProcedureDeps['ai']['llm']>['chatStream']>(async function* (request) {
      try {
        yield partialToolChunk()
        if (request.sessionId === 'cancel') {
          await new Promise<void>(resolve => request.signal?.aborted
            ? resolve()
            : request.signal?.addEventListener('abort', () => resolve(), { once: true }))
          request.signal?.throwIfAborted()
        }
        throw new Error('private upstream error')
      }
      finally {
        settled.resolve()
      }
    })
    const fixture = setup({
      ai: {
        llm: { chatStream },
      },
    })
    await withClient(fixture, 'alice', async ({ ai }) => {
      const controller = new AbortController()
      const cancelled = await ai.chats.streamCompletion({
        messages: [...requestInput.messages],
        sessionId: 'cancel',
      }, { signal: controller.signal })
      if (!(Symbol.asyncIterator in cancelled))
        throw new Error(cancelled.error.message)
      const cancelledIterator = cancelled[Symbol.asyncIterator]()
      expect(await cancelledIterator.next()).toMatchObject({
        done: false,
        value: { type: 'delta' },
      })
      controller.abort()
      await expect(cancelledIterator.next()).rejects.toMatchObject({ name: 'AbortError' })
      await settled.promise

      const failed = await ai.chats.streamCompletion({
        messages: [...requestInput.messages],
        sessionId: 'provider-error',
      })
      if (!(Symbol.asyncIterator in failed))
        throw new Error(failed.error.message)
      const failedIterator = failed[Symbol.asyncIterator]()
      expect(await failedIterator.next()).toMatchObject({
        done: false,
        value: { type: 'delta' },
      })
      await expect(failedIterator.next()).rejects.toMatchObject({ code: 'BAD_GATEWAY', message: 'Internal server error' })
    })
  })

  it('receives multipart files and returns named binary responses using the approved model', async () => {
    const audio = audioMock()
    const generate = vi.fn<NonNullable<AiExtensionProcedureDeps['ai']['image']>['generate']>(async () => core.ok({
      images: [
        { data: pngBytes, mimeType: 'image/png' },
      ],
    }))
    const fixture = setup({
      ai: {
        audio,
        image: { generate },
      },
      authorizeMedia: () => core.ok({ model: 'approved-model', voice: 'approved-voice' }),
    })
    await withClient(fixture, 'alice', async ({ ai }) => {
      expect(await ai.audio.transcribe({
        audio: new File(['fake'], 'forged.wav', { type: 'audio/wav' }),
      })).toMatchObject({
        success: false,
        error: { httpStatus: 400 },
      })
      const transcript = await ai.audio.transcribe({
        audio: new File([audioBytes], 'upload.wav', { type: 'audio/wav' }),
        model: 'unapproved',
      })
      expect(expectSuccess(transcript)).toMatchObject({ text: 'Hello', language: 'en', durationMs: 125 })
      expect(audio.transcribe).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        model: 'approved-model',
        audio: { data: audioBytes, format: 'wav' },
      }))

      const generatedAudio = await ai.audio.synthesize({ text: 'Hello', voice: 'unapproved' })
      expect(generatedAudio).toBeInstanceOf(File)
      if (!(generatedAudio instanceof File))
        throw new TypeError(generatedAudio.error.message)
      expect(generatedAudio.name).toBe('speech.wav')
      expect(generatedAudio.type).toBe('audio/wav')
      expect(audio.synthesize).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ model: 'approved-model', voice: 'approved-voice' }))

      const generatedImage = await ai.images.generate({
        prompt: 'A small garden',
        width: 256,
        height: 512,
        referenceImages: [
          new File([pngBytes], 'upload.png', { type: 'image/png' }),
        ],
      })
      expect(generatedImage).toBeInstanceOf(File)
      if (!(generatedImage instanceof File))
        throw new TypeError(generatedImage.error.message)
      expect(generatedImage.name).toBe('image.png')
      expect(new Uint8Array(await generatedImage.arrayBuffer())).toEqual(pngBytes)
      expect(generate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        size: { width: 256, height: 512 },
        referenceImages: [
          { data: pngBytes, mimeType: 'image/png' },
        ],
        model: 'approved-model',
      }))
    })
  })

  it('requires a policy and rejects media over the explicit request budget', async () => {
    const audio = audioMock()
    const routes = [
      { procedure: extension.audio.synthesize, maxRequestBytes: 64 },
    ]
    const denied = setup({
      ai: { audio },
    }, routes)
    await withClient(denied, 'alice', async ({ ai }) => {
      expect(await ai.audio.synthesize({ text: 'small' })).toMatchObject({
        success: false,
        error: { httpStatus: 403 },
      })
    })
    const allowed = setup({
      ai: { audio },
      authorizeMedia: () => core.ok({}),
    }, routes)
    await withClient(allowed, 'alice', async ({ ai }) => {
      expect(await ai.audio.synthesize({
        text: 'a'.repeat(64),
      })).toMatchObject({
        success: false,
        error: { httpStatus: 413 },
      })
    })
    expect(audio.synthesize).not.toHaveBeenCalled()
  })

  it('issues a no-store ticket for the authorized operation and consumes it exactly once', async () => {
    try {
      expectSuccess(await reldb.init({ type: 'sqlite', database: ':memory:' }))
      expectSuccess(await cache.init({ type: 'memory' }))
      expectSuccess(await iam.init({}))
      const audio = audioMock()
      const fixture = setup({
        ai: { audio },
        audioTickets: iam.ticket,
        authorizeMedia: request => request.model === 'blocked'
          ? core.err(HaiCommonError.FORBIDDEN, 'Media model is forbidden')
          : core.ok({ model: 'approved-model' }),
      })
      const denied = await fixture.app.request(`${baseUrl}/ai/audio/tickets`, {
        method: 'POST',
        headers: { 'authorization': 'Bearer alice', 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'synthesize', model: 'blocked' }),
      })
      expect(await denied.json()).toMatchObject({
        success: false,
        error: { code: HaiCommonError.FORBIDDEN.code },
      })
      expect(audio.getCapabilities).not.toHaveBeenCalled()
      const issued = await fixture.app.request(`${baseUrl}/ai/audio/tickets`, {
        method: 'POST',
        headers: { 'authorization': 'Bearer alice', 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'transcribe', model: 'model-alias' }),
      })
      expect(issued.headers.get('cache-control')).toContain('no-store')
      const parsed = extension.audio.issueTicket['~orpc'].outputSchema.parse(await issued.json())
      const ticket = expectSuccess(parsed)
      expect(ticket.expiresAt).toBeGreaterThan(Date.now())
      expect(await iam.ticket.consume(ticket.ticket, { purpose: 'other' })).toMatchObject({
        success: false,
        error: { code: HaiIamError.TICKET_INVALID.code },
      })
      const outcomes = await Promise.all([
        iam.ticket.consume(ticket.ticket, { purpose: 'ai-audio' }),
        iam.ticket.consume(ticket.ticket, { purpose: 'ai-audio' }),
      ])
      expect(outcomes.filter(outcome => outcome.success)).toEqual([
        core.ok({
          subjectId: 'alice',
          purpose: 'ai-audio',
          grant: { operation: 'transcribe', model: 'approved-model', scopeId: 'test-tenant' },
        }),
      ])
      await withClient(fixture, 'alice', async ({ ai }) => {
        const capabilities = expectSuccess(await ai.audio.getCapabilities({ operation: 'transcribe' }))
        expect(capabilities).toMatchObject({ operation: 'transcribe', realtimeAudioInput: true })
        expect(capabilities).not.toHaveProperty('model')
      })
    }
    finally {
      await iam.close()
      await cache.close()
      await reldb.close()
    }
  })
})
