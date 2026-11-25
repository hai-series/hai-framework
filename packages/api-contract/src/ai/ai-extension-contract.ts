/** @h-ai/api-contract — 按需挂载的 AI HTTP 契约。 */

import { eventIterator } from '@orpc/contract'
import { z } from 'zod'
import { haiResultSchema, HaiVoidResultSchema } from '../common/result-schemas.js'
import { route } from '../common/route.js'
import { AiChatCompletionInputSchema, AiMemoryEntrySchema, AiMemoryTypeSchema } from './ai-schemas.js'

const MAX_AUDIO_BYTES = 8 * 1024 * 1024
const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024
const image = z.file().min(1).mime([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])
// oRPC 的 multipart 编码将数值字段写为十进制字符串。
const imageDimension = z.union([
  z.number(),
  z.string().regex(/^\d{1,4}$/).transform(Number),
])
  .pipe(z.number().int().positive().max(2048))
  .optional()
const model = z.string().trim().min(1).max(128).optional()
const objectId = z.string().trim().min(1).max(128).optional()
const memoryId = z.string().trim().min(1).max(128)
const memoryFields = {
  content: z.string().trim().min(1).max(5000),
  type: AiMemoryTypeSchema,
  importance: z.number().min(0).max(1).optional(),
}
const memoryUpdate = z.object(memoryFields).partial().extend({ id: memoryId, objectId }).strict().refine(input => input.content !== undefined || input.type !== undefined || input.importance !== undefined)

const audioOperation = z.object({
  operation: z.enum(['transcribe', 'synthesize']),
  model,
}).strict()

const memoryOutput = haiResultSchema(AiMemoryEntrySchema)
const streamToolCall = z.object({
  index: z.number().int().nonnegative(),
  id: z.string().optional(),
  type: z.literal('function').optional(),
  function: z.object({
    name: z.string().optional(),
    arguments: z.string().optional(),
  }).optional(),
})
const usage = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
})

/**
 * 聊天流事件。delta 可能只包含分片工具参数或用量，done 标记完整结束。
 * @example
 * ```ts
 * import { AiChatStreamEventSchema } from '@h-ai/api-contract'
 *
 * const event = AiChatStreamEventSchema.parse({ type: 'done' })
 * void event
 * ```
 */
export const AiChatStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('delta'),
    id: z.string(),
    model: z.string(),
    created: z.number().int().nonnegative(),
    choices: z.array(z.object({
      index: z.number().int().nonnegative(),
      delta: z.object({
        role: z.literal('assistant').optional(),
        content: z.string().nullable().optional(),
        tool_calls: z.array(streamToolCall).optional(),
      }),
      finish_reason: z.enum([
        'stop',
        'length',
        'tool_calls',
        'content_filter',
        'function_call',
      ]).nullable(),
    })),
    usage: usage.nullable().optional(),
  }),
  z.object({
    type: z.literal('done'),
  }),
])

/**
 * 聊天流中的单条事件，用 type 区分增量与完成。
 * @example
 * ```ts
 * import type { AiChatStreamEvent } from '@h-ai/api-contract'
 *
 * function isDone(event: AiChatStreamEvent) {
 *   return event.type === 'done'
 * }
 * ```
 */
export type AiChatStreamEvent = z.infer<typeof AiChatStreamEventSchema>

/**
 * AI 可选路由。应用将需要的路由与默认 AI 契约按分组组合。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const path = apiContract.pathOf(apiContract.extensions.ai.chats.streamCompletion)
 * void path
 * ```
 */
export const aiExtensionContract = {
  chats: {
    streamCompletion: route({
      method: 'POST',
      path: '/ai/chats/completions/stream',
      operationId: 'ai.chats.streamCompletion',
      summary: 'Stream chat completion and function tool deltas',
      tags: ['ai', 'chats'],
    })
      .input(AiChatCompletionInputSchema)
      .output(eventIterator(AiChatStreamEventSchema)),
  },
  memories: {
    add: route({
      method: 'POST',
      path: '/ai/memories',
      operationId: 'ai.memories.add',
      summary: 'Add an owned memory',
      tags: ['ai', 'memories'],
    })
      .input(z.object({ ...memoryFields, objectId }).strict())
      .output(memoryOutput),
    update: route({
      method: 'PATCH',
      path: '/ai/memories/{id}',
      operationId: 'ai.memories.update',
      summary: 'Update an owned memory',
      tags: ['ai', 'memories'],
    })
      .input(memoryUpdate)
      .output(memoryOutput),
    remove: route({
      method: 'DELETE',
      path: '/ai/memories/{id}',
      operationId: 'ai.memories.remove',
      summary: 'Remove an owned memory',
      tags: ['ai', 'memories'],
    })
      .input(z.object({ id: memoryId, objectId }).strict())
      .output(HaiVoidResultSchema),
    clear: route({
      method: 'DELETE',
      path: '/ai/memories',
      operationId: 'ai.memories.clear',
      summary: 'Clear memories in an authorized scope',
      tags: ['ai', 'memories'],
    })
      .input(z.object({
        objectId,
        types: z.array(AiMemoryTypeSchema).min(1).optional(),
      }).strict())
      .output(HaiVoidResultSchema),
  },
  audio: {
    getCapabilities: route({
      method: 'GET',
      path: '/ai/audio/capabilities',
      operationId: 'ai.audio.getCapabilities',
      summary: 'Read available speech features for the authorized model',
      tags: ['ai', 'audio'],
    })
      .input(audioOperation)
      .output(haiResultSchema(z.discriminatedUnion('operation', [
        z.object({
          operation: z.literal('transcribe'),
          realtimeAudioInput: z.boolean(),
          streamingTranscriptOutput: z.boolean(),
          speechBoundaryEvents: z.boolean(),
          languageHint: z.boolean().optional(),
          languageDetection: z.boolean().optional(),
        }),
        z.object({
          operation: z.literal('synthesize'),
          incrementalTextInput: z.boolean(),
          streamingAudioOutput: z.boolean(),
          presetVoice: z.boolean().optional(),
          supportedLanguages: z.array(z.string()).optional(),
        }),
      ]))),
    issueTicket: route({
      method: 'POST',
      path: '/ai/audio/tickets',
      operationId: 'ai.audio.issueTicket',
      summary: 'Issue a single-use audio WebSocket ticket',
      tags: ['ai', 'audio'],
    })
      .input(audioOperation)
      .output(haiResultSchema(z.object({
        ticket: z.string().min(1),
        expiresAt: z.number().int().positive(),
      }))),
    transcribe: route({
      method: 'POST',
      path: '/ai/audio/transcriptions',
      operationId: 'ai.audio.transcribe',
      summary: 'Transcribe an uploaded WAV or MP3 file',
      tags: ['ai', 'audio'],
      spec: (operation) => {
        const requestBody = operation.requestBody
        if (requestBody && !('$ref' in requestBody)) {
          const multipart = requestBody.content['multipart/form-data']
          if (multipart) {
            return {
              ...operation,
              requestBody: {
                ...requestBody,
                content: { 'multipart/form-data': multipart },
              },
            }
          }
        }
        return operation
      },
    })
      .input(z.object({
        audio: z.file().min(1).max(MAX_AUDIO_BYTES).mime([
          'audio/wav',
          'audio/x-wav',
          'audio/mpeg',
          'audio/mp3',
        ]),
        model,
        language: z.string().trim().min(1).max(35).optional(),
      }).strict())
      .output(haiResultSchema(z.object({
        text: z.string(),
        language: z.string().optional(),
        durationMs: z.number().nonnegative().optional(),
      }))),
    synthesize: route({
      method: 'POST',
      path: '/ai/audio/speech',
      operationId: 'ai.audio.synthesize',
      summary: 'Synthesize text into a playable audio file',
      tags: ['ai', 'audio'],
    })
      .input(z.object({
        text: z.string().trim().min(1).max(5000),
        model,
        voice: z.string().trim().min(1).max(128).optional(),
        format: z.enum(['wav', 'mp3']).optional(),
      }).strict())
      .output(z.file().min(1).mime(['audio/wav', 'audio/mpeg'])),
  },
  images: {
    generate: route({
      method: 'POST',
      path: '/ai/images/generations',
      operationId: 'ai.images.generate',
      summary: 'Generate an image with optional reference images',
      tags: ['ai', 'images'],
    })
      .input(z.object({
        prompt: z.string().trim().min(1).max(5000),
        model,
        width: imageDimension,
        height: imageDimension,
        referenceImages: z.array(image.max(MAX_REFERENCE_IMAGE_BYTES)).max(4).optional(),
      }).strict()
        .refine(input => (input.width === undefined) === (input.height === undefined))
        .refine(input => (input.referenceImages ?? []).reduce((size, file) => size + file.size, 0) <= MAX_REFERENCE_IMAGE_BYTES))
      .output(image),
  },
}

/**
 * AI 可选 HTTP 路由树。
 * @example
 * ```ts
 * import { type AiExtensionContract, apiContract } from '@h-ai/api-contract'
 *
 * const extensions: AiExtensionContract = apiContract.extensions.ai
 * void extensions
 * ```
 */
export type AiExtensionContract = typeof aiExtensionContract
