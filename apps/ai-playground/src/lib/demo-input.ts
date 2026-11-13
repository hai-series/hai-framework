import { z } from 'zod'

export const basicDemoIds = [
  'llm',
  'stream',
  'structured',
  'embedding',
  'rerank',
  'retrieval',
  'rag',
  'knowledge',
  'persona',
  'context',
  'token',
  'summary',
  'compress',
  'reasoning',
  'file',
] as const

export const integrationDemoIds = [
  'tools',
  'mcp',
  'mcp-remote',
  'mcp-job',
  'a2a',
  'acp',
  'audio-capabilities',
  'tts-stream',
] as const
export type IntegrationDemoId = typeof integrationDemoIds[number]
export type BasicDemoId = typeof basicDemoIds[number]
export type DemoId = BasicDemoId | IntegrationDemoId

export const DemoInputSchema = z.strictObject({
  id: z.enum([
    ...basicDemoIds,
    ...integrationDemoIds,
  ]),
  input: z.string().trim().min(1).max(4000),
})
