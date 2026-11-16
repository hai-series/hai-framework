import type { BuiltinArtifactAccess } from '../src/index.js'
import { err, ok } from '@h-ai/core'
import { tools } from '@h-ai/tools'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ai, HaiAIError } from '../src/index.js'

const context = {
  scope: { tenantId: 'team', userId: 'alice' },
  sessionId: 'task-1',
}
function artifacts(): BuiltinArtifactAccess {
  return {
    read: vi.fn(async (_context, { id }) => ok({
      id,
      name: 'draft.md',
      mediaType: 'text/markdown',
      data: new TextEncoder().encode('First paragraph.\nSecond paragraph.'),
      version: 2,
    })),
    publish: vi.fn(async (_context, input) => ok({
      id: 'artifact-1',
      title: input.name,
      mediaType: input.mediaType,
      kind: input.kind,
      version: 1,
    })),
  }
}
afterEach(() => vi.restoreAllMocks())

describe('ai.tools.createBuiltinTools', () => {
  it('图片生成保存授权产物并只返回引用', async () => {
    const files = artifacts()
    const generate = vi.spyOn(ai.image, 'generate').mockResolvedValue(ok({
      images: [
        {
          data: new Uint8Array([1, 2, 3]),
          mimeType: 'image/png',
        },
      ],
    }))
    const registry = tools.createRegistry()
    expect(registry.registerMany(ai.tools.createBuiltinTools({ context, files }).tools).success).toBe(true)
    const result = await registry.execute('image_generate', { prompt: 'A mountain' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        artifacts: [
          {
            id: 'artifact-1',
            title: 'generated-1.png',
            kind: 'image',
            mediaType: 'image/png',
            version: 1,
          },
        ],
      })
    }
    expect(generate).toHaveBeenCalledOnce()
    expect(files.publish).toHaveBeenCalledOnce()
  })

  it('模型业务失败完整透传，不发布产物或嵌套成功', async () => {
    const files = artifacts()
    const failure = err(HaiAIError.IMAGE_TIMEOUT, 'Timed out')
    vi.spyOn(ai.image, 'generate').mockResolvedValue(failure)
    const registry = tools.createRegistry()
    expect(registry.registerMany(ai.tools.createBuiltinTools({ context, files }).tools).success).toBe(true)
    const result = await registry.execute('image_generate', { prompt: 'A mountain' })
    expect(result).toEqual(failure)
    expect(files.publish).not.toHaveBeenCalled()
  })

  it('选区改写保留其他内容并返回版本化提议，不自动保存', async () => {
    const files = artifacts()
    vi.spyOn(ai.llm, 'chat').mockResolvedValue(ok({
      id: 'reply',
      object: 'chat.completion',
      created: 0,
      model: 'test',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          logprobs: null,
          message: { role: 'assistant', content: 'Rewritten paragraph.', refusal: null },
        },
      ],
    }))
    const registry = tools.createRegistry()
    expect(registry.registerMany(ai.tools.createBuiltinTools({ context, files }).tools).success).toBe(true)
    const result = await registry.execute('document_rewrite', {
      id: 'document-1',
      content: 'First paragraph.\nSecond paragraph.',
      selectedText: 'Second paragraph.',
      instruction: 'Make this clearer',
      baseVersion: 2,
    })
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data).toMatchObject({ content: 'First paragraph.\nRewritten paragraph.', baseVersion: 2 })
    expect(files.publish).not.toHaveBeenCalled()
  })

  it('音频转写读取已授权文件，并保存可引用文字', async () => {
    const files = artifacts()
    files.read = vi.fn(async () => ok({
      id: 'audio',
      name: 'recording.wav',
      mediaType: 'audio/wav',
      data: new Uint8Array([1, 2]),
    }))
    const transcribe = vi.spyOn(ai.audio, 'transcribe').mockResolvedValue(ok({ text: 'A transcript.', language: 'en', durationMs: 1000 }))
    const registry = tools.createRegistry()
    expect(registry.registerMany(ai.tools.createBuiltinTools({ context, files }).tools).success).toBe(true)
    const result = await registry.execute('audio_transcribe', { fileId: 'audio' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({
        text: 'A transcript.',
        artifacts: [
          { title: 'transcript.md', kind: 'markdown' },
        ],
      })
    }
    expect(transcribe).toHaveBeenCalledOnce()
  })

  it('过期文档版本和含糊选区在模型执行前被拒绝', async () => {
    const files = artifacts()
    const chat = vi.spyOn(ai.llm, 'chat')
    const registry = tools.createRegistry()
    expect(registry.registerMany(ai.tools.createBuiltinTools({ context, files }).tools).success).toBe(true)
    const stale = await registry.execute('document_rewrite', { id: 'doc', instruction: 'Rewrite', baseVersion: 1 })
    expect(stale.success).toBe(false)
    if (!stale.success)
      expect(stale.error.code).toBe(HaiAIError.RESOURCE_CONFLICT.code)
    const ambiguous = await registry.execute('document_rewrite', {
      id: 'doc',
      content: 'same same',
      selectedText: 'same',
      instruction: 'Rewrite',
      baseVersion: 2,
    })
    expect(ambiguous.success).toBe(false)
    expect(chat).not.toHaveBeenCalled()
  })
})
