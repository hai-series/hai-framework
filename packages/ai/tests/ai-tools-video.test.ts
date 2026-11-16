import type { ToolArtifact } from '@h-ai/tools/server'
import type { BuiltinArtifactAccess, BuiltinToolOptions } from '../src/index.js'
import { ok } from '@h-ai/core'
import { tools } from '@h-ai/tools'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ai } from '../src/index.js'

function png() {
  const bytes = new Uint8Array(33)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  bytes.set(strToU8('IHDR'), 12)
  view.setUint32(16, 1280)
  view.setUint32(20, 720)
  return bytes
}
function wav(seconds: number) {
  const bytes = new Uint8Array(44 + seconds * 16000)
  const view = new DataView(bytes.buffer)
  bytes.set(strToU8('RIFF'), 0)
  view.setUint32(4, bytes.length - 8, true)
  bytes.set(strToU8('WAVEfmt '), 8)
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 16000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  bytes.set(strToU8('data'), 36)
  view.setUint32(40, bytes.length - 44, true)
  return bytes
}
afterEach(() => vi.restoreAllMocks())

describe('website_video 固定工作流', () => {
  it('采集、结构化脚本、真实WAV时长、字幕工程与渲染按阶段组合，保留可重做产物', async () => {
    const capture = {
      sourceUrl: 'https://example.com/',
      title: 'Example',
      description: 'Example service',
      text: 'A useful service for teams.',
      colors: ['#a32b40'],
      screenshots: ['screenshots/hero.png'],
      materials: [],
    }
    const stored = new Map<string, ToolArtifact>([
      [
        'capture',
        {
          id: 'capture',
          name: 'capture.zip',
          mediaType: 'application/zip',
          data: zipSync({
            'capture.json': strToU8(JSON.stringify(capture)),
            'screenshots/hero.png': png(),
          }),
        },
      ],
    ])
    const readIds: string[] = []
    const files: BuiltinArtifactAccess = {
      read: async (_context, input) => {
        readIds.push(input.id)
        const found = stored.get(input.id)
        if (!found)
          throw new Error('Unknown test artifact')
        return ok(found)
      },
      publish: async (_context, input) => {
        const id = `artifact-${stored.size}`
        stored.set(id, {
          id,
          name: input.name,
          mediaType: input.mediaType,
          data: input.data,
          kind: input.kind,
          version: 1,
        })
        return ok({
          id,
          title: input.name,
          kind: input.kind,
          mediaType: input.mediaType,
          version: 1,
        })
      },
    }
    const planner = vi.spyOn(ai.llm, 'generateObject').mockResolvedValue(ok({
      title: 'Example',
      scenes: [
        {
          title: 'Meet Example',
          body: 'A useful service',
          narration: 'Meet Example.',
          audioId: 'forged-audio',
          audioText: 'Meet Example.',
        },
        { title: 'Built for teams', body: 'Explore the service', narration: 'Explore the service.' },
      ],
    }))
    const synthesize = vi.spyOn(ai.audio, 'synthesize').mockResolvedValue(ok({
      data: wav(2),
      format: 'wav',
      durationMs: 2000,
    }))
    const capabilities = vi.spyOn(ai.audio, 'getCapabilities').mockReturnValue(ok({
      synthesize: {
        supported: true,
        incrementalTextInput: false,
        streamingAudioOutput: true,
        targetDuration: false,
      },
    }))
    const stages: string[] = []
    let renderedHtml = ''
    const executeJob: NonNullable<BuiltinToolOptions['executeJob']> = async (request) => {
      stages.push(request.name)
      if (request.name === 'web_capture') {
        return ok({
          artifacts: [
            {
              id: 'capture',
              title: 'capture.zip',
              kind: 'file',
              mediaType: 'application/zip',
              version: 1,
            },
          ],
        })
      }
      const input = request.input as { fileId: string }
      const project = stored.get(input.fileId)
      expect(project?.name).toBe('video-project.zip')
      const contents = unzipSync(project!.data)
      const html = strFromU8(contents['index.html'])
      renderedHtml = html
      expect(html).toContain('data-composition-id')
      expect(html).toContain('assets/voice-1.wav')
      expect(strFromU8(contents['subtitles.srt'])).toContain('Explore the service.')
      expect(contents['DESIGN.md']).toBeDefined()
      return ok({
        artifacts: [
          {
            id: 'movie',
            title: 'video.mp4',
            kind: 'video',
            mediaType: 'video/mp4',
            version: 1,
          },
        ],
      })
    }
    const registry = tools.createRegistry()
    expect(registry.registerMany(ai.tools.createBuiltinTools({
      context: {
        scope: { tenantId: 'team', userId: 'alice' },
      },
      files,
      executeJob,
    }).tools).success).toBe(true)
    const result = await registry.execute('website_video', { url: 'https://example.com/', durationSeconds: 10 })
    expect(result.success).toBe(true)
    // HF 对 data-start 内的 CSS 使用局部时钟；全局延迟会让后续镜头直到结尾仍透明。
    expect(renderedHtml).toMatch(/id="scene-1"[^>]+data-start="[1-9]/)
    expect(renderedHtml).not.toContain('--scene-start')
    expect(readIds).not.toContain('forged-audio')
    expect(planner).toHaveBeenCalledWith(expect.objectContaining({ responseFormat: 'json_object' }))
    if (result.success)
      expect(result.data).toMatchObject({ durationSeconds: 10, sourceUrl: capture.sourceUrl })
    expect(stages).toEqual(['web_capture', 'video_render'])
    expect(synthesize).toHaveBeenCalledTimes(2)
    expect(synthesize.mock.calls.every(([request]) => request.targetDurationMs === undefined)).toBe(true)
    const names = [
      ...stored.values(),
    ].map(file => file.name)
    expect(names).toEqual(expect.arrayContaining([
      'SCRIPT.md',
      'STORYBOARD.json',
      'DESIGN.md',
      'subtitles.srt',
      'video-cover.png',
      'video-project.zip',
    ]))
    if (!result.success)
      throw new Error(result.error.message)
    const workflow = z.object({
      captureId: z.string(),
      storyboardId: z.string(),
      audioIds: z.array(z.string()),
    }).parse(result.data)
    const replayed = await registry.execute('website_video', { url: 'https://example.com/', durationSeconds: 10, ...workflow })
    expect(replayed.success).toBe(true)
    expect(stages).toEqual(['web_capture', 'video_render', 'video_render'])
    expect(synthesize).toHaveBeenCalledTimes(2)
    const storyboard = stored.get(workflow.storyboardId)!
    const originalText = strFromU8(storyboard.data)
    stored.set(storyboard.id, {
      ...storyboard,
      data: strToU8(originalText.replace('"narration": "Meet Example."', '"narration": "Discover Example."')),
    })
    const revised = await registry.execute('website_video', { url: 'https://example.com/', durationSeconds: 10, ...workflow })
    expect(revised.success).toBe(true)
    expect(synthesize).toHaveBeenCalledTimes(3)
    expect(synthesize.mock.calls[2]?.[0]).toMatchObject({ text: 'Discover Example.' })
    if (revised.success) {
      const revisedAudio = z.object({
        audioIds: z.array(z.string()),
      }).parse(revised.data).audioIds
      expect(revisedAudio[0]).not.toBe(workflow.audioIds[0])
      expect(revisedAudio[1]).toBe(workflow.audioIds[1])
    }
    const streamed = wav(2)
    capabilities.mockReturnValue(ok({
      synthesize: {
        supported: true,
        incrementalTextInput: false,
        streamingAudioOutput: false,
        targetDuration: true,
      },
    }))
    new DataView(streamed.buffer).setUint32(4, 0xFFFFFFFF, true)
    new DataView(streamed.buffer).setUint32(40, 0xFFFFFFFF, true)
    synthesize.mockResolvedValue(ok({ data: streamed, format: 'wav' }))
    const streamedResult = await registry.execute('website_video', { url: 'https://example.com/', durationSeconds: 10, captureId: workflow.captureId })
    expect(streamedResult.success).toBe(true)
    expect(synthesize.mock.calls.at(-1)?.[0].targetDurationMs).toBeGreaterThan(0)
  })

  it('拒绝ZIP链接和过大的声明，尚未解压或调用模型及渲染器', async () => {
    const metadata = {
      sourceUrl: 'https://example.com/',
      title: 'Example',
      text: 'Example',
      colors: ['#a32b40'],
      screenshots: ['screenshots/hero.png'],
    }
    const base = zipSync({
      'capture.json': strToU8(JSON.stringify(metadata)),
      'screenshots/hero.png': png(),
    })
    const findDirectory = (bytes: Uint8Array) => {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      for (let offset = 0; offset + 46 <= bytes.length; offset++) {
        if (view.getUint32(offset, true) === 0x02014B50)
          return offset
      }
      throw new Error('Expected a ZIP central directory')
    }
    const link = base.slice()
    new DataView(link.buffer).setUint32(findDirectory(link) + 38, 0xA1FF0000, true)
    const oversized = base.slice()
    new DataView(oversized.buffer).setUint32(findDirectory(oversized) + 24, 100 * 1024 * 1024, true)
    const truncatedDeclaration = base.slice()
    new DataView(truncatedDeclaration.buffer).setUint32(findDirectory(truncatedDeclaration) + 24, 1, true)
    new DataView(truncatedDeclaration.buffer).setUint32(22, 1, true)
    const hugeImage = png()
    new DataView(hugeImage.buffer).setUint32(16, 65535)
    const imageBomb = zipSync({
      'capture.json': strToU8(JSON.stringify(metadata)),
      'screenshots/hero.png': hugeImage,
    })
    const traversal = zipSync({
      '../capture.json': strToU8(JSON.stringify(metadata)),
    })
    const generateObject = vi.spyOn(ai.llm, 'generateObject')
    const executeJob = vi.fn<NonNullable<BuiltinToolOptions['executeJob']>>()
    for (const data of [
      link,
      oversized,
      truncatedDeclaration,
      imageBomb,
      traversal,
    ]) {
      const files: BuiltinArtifactAccess = {
        read: async () => ok({
          id: 'capture',
          name: 'capture.zip',
          mediaType: 'application/zip',
          data,
        }),
        publish: async () => { throw new Error('Unsafe input must not publish') },
      }
      const registry = tools.createRegistry()
      expect(registry.registerMany(ai.tools.createBuiltinTools({
        context: {
          scope: { tenantId: 'team', userId: 'alice' },
        },
        files,
        executeJob,
      }).tools).success).toBe(true)
      const result = await registry.execute('website_video', { url: 'https://example.com/', captureId: 'capture' })
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.code).toBe('hai:ai:101')
    }
    expect(generateObject).not.toHaveBeenCalled()
    expect(executeJob).not.toHaveBeenCalled()
  })
})
