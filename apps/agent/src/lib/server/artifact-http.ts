import type { ArtifactDocument, ArtifactSummary } from '@h-ai/ui'
import type { AgentResource } from '#lib/workspace.js'
import { core } from '@h-ai/core'
import { artifactStore } from './artifacts.js'
import { WorkspaceError } from './data.js'

const textKinds = new Set(['markdown', 'html', 'table', 'chart'])

export function artifactSummary(ref: AgentResource, path: string): ArtifactSummary {
  const version = ref.version ?? 1
  return {
    id: ref.id,
    title: ref.title,
    kind: ref.artifactKind ?? 'file',
    version,
    mediaType: ref.mediaType,
    updatedAt: ref.updatedAt ?? ref.createdAt,
    editable: !!ref.artifactKind && textKinds.has(ref.artifactKind),
    downloadUrl: `${path}?${new URLSearchParams({
      media: ref.id,
      version: String(version),
      attachment: '1',
    })}`,
  }
}

export async function artifactDocument(user: string, id: string, path: string, version?: number): Promise<ArtifactDocument> {
  const ref = await artifactStore.describe(user, id, version)
  const summary = artifactSummary(ref, path)
  if (ref.artifactKind && textKinds.has(ref.artifactKind)) {
    const { bytes } = await artifactStore.read(user, id, ref.version)
    return {
      ...summary,
      content: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    }
  }
  return { ...summary, mediaUrl: `${path}?${new URLSearchParams({
    media: id,
    version: String(summary.version),
  })}` }
}

function byteRange(header: string | null, size: number) {
  if (!header)
    return undefined
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header)
  if (!match || (!match[1] && !match[2]) || !size)
    throw new WorkspaceError(416, 'invalid-range')
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]))
  const end = match[1] && match[2]
    ? Math.min(Number(match[2]), size - 1)
    : size - 1
  if (![start, end].every(Number.isSafeInteger) || start < 0 || start > end || start >= size || (!match[1] && Number(match[2]) === 0))
    throw new WorkspaceError(416, 'invalid-range')
  return { rangeStart: start, rangeEnd: end }
}

export async function artifactMedia(user: string, id: string, request: Request, version?: number, attachment = false) {
  const ref = await artifactStore.describe(user, id, version)
  const size = ref.size ?? 0
  const tag = `"${id}:${ref.version}"`
  const headers = new Headers({
    'Content-Type': ref.mediaType ?? 'application/octet-stream',
    'Content-Disposition': `${attachment ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(ref.title)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    'ETag': tag,
    'Content-Security-Policy': 'default-src \'none\'; sandbox',
  })
  // 可执行文本始终下载，HTML 预览由组件在隔离 frame 中载入 JSON 正文。
  if (!['image', 'audio', 'video'].includes(ref.artifactKind ?? 'file'))
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(ref.title)}`)
  const ifRange = request.headers.get('if-range')
  let range
  try {
    range = byteRange(!ifRange || ifRange === tag
      ? request.headers.get('range')
      : null, size)
  }
  catch (error) {
    if (error instanceof WorkspaceError && error.status === 416) {
      return new Response(null, {
        status: 416,
        headers: {
          ...Object.fromEntries(headers),
          'Content-Range': `bytes */${size}`,
        },
      })
    }
    throw error
  }
  headers.set('Content-Length', String(range
    ? range.rangeEnd - range.rangeStart + 1
    : size))
  if (range)
    headers.set('Content-Range', `bytes ${range.rangeStart}-${range.rangeEnd}/${size}`)
  if (request.method === 'HEAD') {
    return new Response(null, {
      status: range ? 206 : 200,
      headers,
    })
  }
  const { chunks } = await artifactStore.stream(user, id, ref.version, { ...range, signal: request.signal })
  const iterator = chunks[Symbol.asyncIterator]()
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next()
        if (next.done)
          controller.close()
        else
          controller.enqueue(next.value)
      }
      catch (error) {
        core.logger.warn('Artifact response stream failed', { module: 'agent' })
        controller.error(error)
        await iterator.return?.()
      }
    },
    async cancel() { await iterator.return?.() },
  })
  return new Response(body, {
    status: range ? 206 : 200,
    headers,
  })
}
