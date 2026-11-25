import { z } from 'zod'
import { haiResultSchema } from '../../common/result-schemas.js'
import { route } from '../../common/route.js'

const MAX_AUDIO_BYTES = 8 * 1024 * 1024
const model = z.string().trim().min(1).max(128).optional()
const audioOperation = z.object({
  operation: z.enum(['transcribe', 'synthesize']),
  model,
}).strict()

/**
 * 语音能力查询、连接票据、转写和合成的 HTTP 端点。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const operation = apiContract.extensions.ai.audio.getCapabilities
 * void operation
 * ```
 */
export const aiAudioContract = {
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
}
