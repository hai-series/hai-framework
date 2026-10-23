/** 发布子入口仅保留实际可用的 AudioClient，旧 HTTP/SSE 绑定不可达。 */
import * as client from '@h-ai/ai/client'
import { describe, expect, it } from 'vitest'

// @ts-expect-error Removed legacy typed HTTP client.
export type NoAIClient = import('@h-ai/ai/client').AIClient
// @ts-expect-error Removed legacy adapter for nonexistent post/stream methods.
export type NoAdapter = import('@h-ai/ai/client').AIApiAdapter
// @ts-expect-error Removed legacy A2A client.
export type NoA2AClient = import('@h-ai/ai/client').A2AClientOperations
// @ts-expect-error Removed redundant HTTP client factory.
export type NoFactory = typeof import('@h-ai/ai/client').createAIClient
// @ts-expect-error Removed redundant A2A client factory.
export type NoA2AFactory = typeof import('@h-ai/ai/client').createA2AClient
// @ts-expect-error Removed incomplete SSE parser.
export type NoSSEParser = typeof import('@h-ai/ai/client').parseSSE
// @ts-expect-error Removed redundant stream accumulator.
export type NoAccumulator = typeof import('@h-ai/ai/client').collectStreamContent
// @ts-expect-error Removed unused placeholder factory.
export type NoPlaceholder = typeof import('@h-ai/ai/client').createUnconfiguredAudioClient

describe('published client exports', () => {
  it('exports only the standalone audio factory', () => {
    expect(Object.keys(client)).toEqual(['createAudioClient'])
    const operations = client.createAudioClient({ url: 'wss://audio.example.com/api/v1/ai/audio', getTicket: () => 'test-only-ticket' })
    expect(Object.keys(operations).sort()).toEqual(['synthesize', 'synthesizeStream', 'transcribe', 'transcribeStream'])
  })
})
