import type { FeedbackBundle } from '@h-ai/feedback/bundle'
import type { GlobalOptions } from '../cli-types.js'
import { randomBytes } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { getFeedbackBundleViewerFiles, queryFeedbackBundle, readFeedbackBundle, summarizeFeedbackBundle } from '@h-ai/feedback/bundle'
import { cliM } from '../cli-i18n.js'
import { writeCliMessage } from '../cli-utils.js'

/**
 * 本地离线分析选项，不包含任何生产连接或凭据。
 * @example
 * ```ts
 * import type { FeedbackCommandOptions } from './cli-feedback.js'
 * const options: FeedbackCommandOptions = { page: 1, pageSize: 20, requestId: 'request-1' }
 * ```
 */
export interface FeedbackCommandOptions extends GlobalOptions {
  page?: number
  pageSize?: number
  kind?: string
  requestId?: string
  errorId?: string
  from?: number
  to?: number
  port?: number
}

/**
 * 本机查看器句柄，宿主负责在取消或退出时关闭。
 * @example
 * ```ts
 * import type { FeedbackViewer } from './cli-feedback.js'
 * async function closeViewer(viewer: FeedbackViewer) { await viewer.close() }
 * ```
 */
export interface FeedbackViewer {
  url: string
  close: () => Promise<void>
}

/**
 * 启动只监听 loopback 的离线查看器，使用内置代码和已校验数据。
 * @throws Error - 端口或本机监听失败。
 * @example
 * ```ts
 * import { createFeedbackBundle, readFeedbackBundle } from '@h-ai/feedback/bundle'
 * import { startFeedbackViewer } from './cli-feedback.js'
 * const created = await createFeedbackBundle({ report: { id: 'report-1' }, evidence: [] })
 * if (created.success) {
 *   const parsed = await readFeedbackBundle(created.data)
 *   if (parsed.success) {
 *     const viewer = await startFeedbackViewer(parsed.data)
 *     try { await fetch(viewer.url) } finally { await viewer.close() }
 *   }
 * }
 * ```
 */
export async function startFeedbackViewer(bundle: FeedbackBundle, options: { port?: number } = {}): Promise<FeedbackViewer> {
  const port = options.port ?? 0
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535)
    throw new Error(cliM('cli_feedback_invalidOptions'))
  const prefix = `/${randomBytes(18).toString('hex')}/`
  const trustedViewer = getFeedbackBundleViewerFiles()
  const server = createServer((request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    response.setHeader('Content-Security-Policy', 'default-src \'none\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' blob: data:; connect-src \'self\'; frame-src \'self\' about: blob:; font-src \'self\' data:; base-uri \'none\'; form-action \'none\'; frame-ancestors \'none\'')
    const address = server.address()
    const host = address && typeof address === 'object' ? `127.0.0.1:${address.port}` : ''
    if (request.headers.host !== host || request.method !== 'GET' || !request.url?.startsWith(prefix)) {
      response.writeHead(404).end()
      return
    }
    const requested = request.url.slice(prefix.length).split('?')[0]
    if (!requested) {
      response.writeHead(302, { Location: `${prefix}viewer/index.html` }).end()
      return
    }
    // 包内同名 JS 即使重算 checksum 也不能替换框架内置查看器。
    const bytes = requested.startsWith('viewer/') ? trustedViewer[requested] : bundle.files[requested]
    if (!bytes || requested.includes('%') || requested.includes('..') || requested.includes('\\')) {
      response.writeHead(404).end()
      return
    }
    const viewerTypes: Record<string, string> = { 'viewer/index.html': 'text/html; charset=utf-8', 'viewer/app.js': 'text/javascript; charset=utf-8', 'viewer/replay.js': 'text/javascript; charset=utf-8', 'viewer/style.css': 'text/css; charset=utf-8' }
    const attachment = bundle.manifest.files.find(file => file.path === requested && file.kind === 'attachment')
    const imageType = attachment && ['image/png', 'image/jpeg', 'image/webp'].includes(attachment.contentType ?? '') ? attachment.contentType : undefined
    const contentType = viewerTypes[requested] ?? imageType ?? (requested.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8')
    response.setHeader('Content-Type', contentType)
    if (requested.startsWith('attachments/') && !imageType)
      response.setHeader('Content-Disposition', 'attachment')
    response.writeHead(200).end(bytes)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address !== 'object')
    throw new Error(cliM('cli_feedback_invalidOptions'))
  return {
    url: `http://127.0.0.1:${address.port}${prefix}viewer/index.html`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
      server.closeAllConnections()
    }),
  }
}

/**
 * 离线读取问题包，输出摘要、manifest 或证据分页，或启动本机查看器。
 * @throws Error - 参数、文件或包校验失败。
 * @example
 * ```ts
 * import { feedbackCommand } from './cli-feedback.js'
 * await feedbackCommand('summary', './feedback-FB-1.zip', { page: 1 })
 * ```
 */
export async function feedbackCommand(action: string, bundlePath: string, options: FeedbackCommandOptions = {}): Promise<void> {
  if (!['inspect', 'summary', 'evidence', 'view'].includes(action))
    throw new Error(cliM('cli_feedback_invalidAction'))
  const filePath = path.resolve(options.cwd ?? process.cwd(), bundlePath)
  const metadata = await stat(filePath)
  if (!metadata.isFile() || metadata.size > 64 * 1024 * 1024)
    throw new Error(cliM('cli_feedback_invalidBundle'))
  const result = await readFeedbackBundle(await readFile(filePath))
  if (!result.success)
    throw new Error(result.error.message)
  const bundle = result.data
  if (action === 'summary') {
    writeCliMessage(summarizeFeedbackBundle(bundle))
    return
  }
  if (action === 'inspect') {
    writeCliMessage(JSON.stringify(bundle.manifest, null, 2))
    return
  }
  if (action === 'evidence') {
    for (const value of [options.page, options.pageSize]) {
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 1))
        throw new Error(cliM('cli_feedback_invalidOptions'))
    }
    for (const value of [options.from, options.to]) {
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
        throw new Error(cliM('cli_feedback_invalidOptions'))
    }
    if (options.from !== undefined && options.to !== undefined && options.from > options.to)
      throw new Error(cliM('cli_feedback_invalidOptions'))
    writeCliMessage(JSON.stringify(queryFeedbackBundle(bundle, options), null, 2))
    return
  }
  const viewer = await startFeedbackViewer(bundle, options)
  writeCliMessage(cliM('cli_feedback_viewerStarted', { params: { url: viewer.url } }))
  await new Promise<void>((resolve, reject) => {
    const stop = () => {
      process.off('SIGINT', stop)
      process.off('SIGTERM', stop)
      viewer.close().then(resolve, reject)
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
}
