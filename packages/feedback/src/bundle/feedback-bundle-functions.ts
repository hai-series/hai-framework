import type { HaiResult } from '@h-ai/core'
import type { FeedbackBundle, FeedbackBundleEvidence, FeedbackBundleEvidencePage, FeedbackBundleFile, FeedbackBundleInput, FeedbackBundleManifest, FeedbackBundleQuery, FeedbackBundleReadOptions } from './feedback-bundle-types.js'
import { core, err, HaiCommonError, ok } from '@h-ai/core'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { feedbackViewerFiles } from './feedback-bundle-viewer.js'

const bundleM = core.i18n.createMessageGetter({
  'zh-CN': { invalid: '问题包格式、容量或完整性校验失败', title: '问题反馈', facts: '采集事实', missing: '缺失材料', user: '用户描述', empty: '未填写', evidence: '证据', attachments: '附件' },
  'en-US': { invalid: 'The feedback bundle failed format, size or integrity validation', title: 'Feedback report', facts: 'Collected facts', missing: 'Missing evidence', user: 'User description', empty: 'Not provided', evidence: 'Evidence', attachments: 'Attachments' },
  'ja-JP': { invalid: '問題パッケージの形式、容量または整合性の検証に失敗しました', title: '問題フィードバック', facts: '収集した事実', missing: '不足している資料', user: 'ユーザーの説明', empty: '未入力', evidence: '証拠', attachments: '添付ファイル' },
})

const MAX_FILES = 1024
const MAX_BYTES = 64 * 1024 * 1024
const MAX_FILE_BYTES = 16 * 1024 * 1024
const SHA256 = /^[a-f0-9]{64}$/
const SAFE_ID = /^[\w-]{1,128}$/

/** JSON 仅做数据边界，禁止保留原型和可执行值。 */
function jsonObject(value: unknown): Record<string, unknown> {
  const parsed: unknown = JSON.parse(JSON.stringify(value))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Expected object')
  return parsed as Record<string, unknown>
}

function safePath(value: string): boolean {
  return /^[a-z0-9][\w./-]*$/i.test(value) && !value.endsWith('/')
    && !value.split('/').some(segment => !segment || segment === '.' || segment === '..')
}

async function checksum(bytes: Uint8Array): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

function objectFromFile(files: Readonly<Record<string, Uint8Array>>, path: string): Record<string, unknown> {
  const bytes = files[path]
  if (!bytes)
    throw new Error('Missing file')
  const parsed: unknown = JSON.parse(strFromU8(bytes))
  return jsonObject(parsed)
}

function evidenceFrom(value: unknown): FeedbackBundleEvidence {
  const record = jsonObject(value)
  if (typeof record.source !== 'string' || typeof record.kind !== 'string' || typeof record.timestamp !== 'number' || !Number.isFinite(record.timestamp))
    throw new Error('Invalid evidence')
  for (const key of ['id', 'requestId', 'errorId', 'missingReason']) {
    if (record[key] !== undefined && typeof record[key] !== 'string')
      throw new Error('Invalid evidence field')
  }
  if (record.sequence !== undefined && (typeof record.sequence !== 'number' || !Number.isSafeInteger(record.sequence) || record.sequence < 0))
    throw new Error('Invalid evidence sequence')
  return {
    source: record.source,
    kind: record.kind,
    timestamp: record.timestamp,
    ...(typeof record.id === 'string' ? { id: record.id } : {}),
    ...(typeof record.sequence === 'number' ? { sequence: record.sequence } : {}),
    ...(typeof record.requestId === 'string' ? { requestId: record.requestId } : {}),
    ...(typeof record.errorId === 'string' ? { errorId: record.errorId } : {}),
    ...(typeof record.missingReason === 'string' ? { missingReason: record.missingReason } : {}),
    ...(record.data !== undefined ? { data: record.data } : {}),
  }
}

function limitsFor(options: FeedbackBundleReadOptions = {}) {
  const limits = { maxFiles: options.maxFiles ?? MAX_FILES, maxBytes: options.maxBytes ?? MAX_BYTES, maxFileBytes: options.maxFileBytes ?? MAX_FILE_BYTES }
  if (Object.values(limits).some(value => !Number.isSafeInteger(value) || value <= 0))
    throw new Error('Invalid limits')
  return limits
}

/** 先检查 ZIP 中央目录，避免解压后才发现重复路径、符号链接或压缩炸弹。 */
function preflight(bytes: Uint8Array, limits: ReturnType<typeof limitsFor>): void {
  if (bytes.byteLength > limits.maxBytes || bytes.byteLength < 22)
    throw new Error('Invalid archive size')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054B50 && offset + 22 + view.getUint16(offset + 20, true) === bytes.length) {
      end = offset
      break
    }
  }
  if (end < 0 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0)
    throw new Error('Invalid archive directory')
  const count = view.getUint16(end + 10, true)
  const size = view.getUint32(end + 12, true)
  let offset = view.getUint32(end + 16, true)
  if (count === 0 || count > limits.maxFiles || count !== view.getUint16(end + 8, true) || offset + size !== end)
    throw new Error('Invalid archive directory size')
  let total = 0
  const names = new Set<string>()
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014B50)
      throw new Error('Invalid archive entry')
    const nameLength = view.getUint16(offset + 28, true)
    const next = offset + 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
    if (next > end)
      throw new Error('Invalid archive entry length')
    const name = strFromU8(bytes.subarray(offset + 46, offset + 46 + nameLength))
    const originalSize = view.getUint32(offset + 24, true)
    const method = view.getUint16(offset + 10, true)
    const mode = (view.getUint32(offset + 38, true) >>> 16) & 0xF000
    if (!safePath(name) || names.has(name.toLowerCase()) || originalSize > limits.maxFileBytes
      || (view.getUint16(offset + 8, true) & 1) || ![0, 8].includes(method) || (mode !== 0 && mode !== 0x8000)) {
      throw new Error('Unsafe archive entry')
    }
    total += originalSize
    if (total > limits.maxBytes)
      throw new Error('Archive expansion limit')
    names.add(name.toLowerCase())
    offset = next
  }
  if (offset !== end)
    throw new Error('Unexpected archive entry')
}

function parseManifest(value: Record<string, unknown>): FeedbackBundleManifest {
  if (value.format !== 'hai-feedback' || value.version !== 1 || typeof value.reportId !== 'string'
    || typeof value.evidenceRevision !== 'number' || !Number.isSafeInteger(value.evidenceRevision) || value.evidenceRevision < 0
    || typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt) || !Array.isArray(value.files)
    || !Array.isArray(value.missing) || value.missing.some(item => typeof item !== 'string')) {
    throw new Error('Unsupported manifest')
  }
  const files: FeedbackBundleFile[] = value.files.map((item) => {
    const file = jsonObject(item)
    if (typeof file.path !== 'string' || !safePath(file.path) || file.path === 'manifest.json'
      || typeof file.size !== 'number' || !Number.isSafeInteger(file.size) || file.size < 0
      || typeof file.sha256 !== 'string' || !SHA256.test(file.sha256)
      || !['report', 'evidence', 'history', 'attachment', 'summary', 'viewer'].includes(String(file.kind))) {
      throw new Error('Invalid manifest file')
    }
    return {
      path: file.path,
      size: file.size,
      sha256: file.sha256,
      kind: file.kind as FeedbackBundleFile['kind'],
      ...(typeof file.attachmentId === 'string' ? { attachmentId: file.attachmentId } : {}),
      ...(typeof file.name === 'string' ? { name: file.name } : {}),
      ...(typeof file.contentType === 'string' ? { contentType: file.contentType } : {}),
    }
  })
  if (new Set(files.map(file => file.path)).size !== files.length)
    throw new Error('Duplicate manifest file')
  return { format: 'hai-feedback', version: 1, reportId: value.reportId, evidenceRevision: value.evidenceRevision, createdAt: value.createdAt, missing: value.missing as string[], files }
}

/**
 * 生成含摘要、证据索引、附件与静态查看器的 ZIP；调用前应完成授权与脱敏。
 * @example
 * ```ts
 * import { createFeedbackBundle } from '@h-ai/feedback/bundle'
 * const result = await createFeedbackBundle({ report: { id: 'fb_1' }, evidence: [] })
 * if (result.success) { const bytes: Uint8Array = result.data }
 * ```
 */
export async function createFeedbackBundle<TReport extends { id: string }>(input: FeedbackBundleInput<TReport>): Promise<HaiResult<Uint8Array>> {
  try {
    if (input.createdAt !== undefined && (!Number.isSafeInteger(input.createdAt) || input.createdAt < 0))
      throw new Error('Invalid bundle creation time')
    const report = jsonObject(input.report)
    if (typeof report.id !== 'string' || !SAFE_ID.test(report.id))
      throw new Error('Invalid report')
    if (['appVersion', 'buildId', 'commit'].some(key => report[key] !== undefined && (typeof report[key] !== 'string' || report[key].length > 128)))
      throw new Error('Invalid build metadata')
    if (report.evidenceRevision !== undefined && (typeof report.evidenceRevision !== 'number' || !Number.isSafeInteger(report.evidenceRevision) || report.evidenceRevision < 0))
      throw new Error('Invalid evidence revision')
    const evidence = input.evidence.map(evidenceFrom)
    const history = (input.history ?? []).map(jsonObject)
    const missing = [...(input.missing ?? [])]
    if (missing.some(item => typeof item !== 'string'))
      throw new Error('Invalid missing evidence')
    const files: Record<string, Uint8Array> = {
      'report.json': strToU8(JSON.stringify(report)),
      'timeline.ndjson': strToU8(evidence.map(record => JSON.stringify(record)).join('\n')),
      'evidence/records.json': strToU8(JSON.stringify(evidence)),
      'evidence/history.json': strToU8(JSON.stringify(history)),
      ...feedbackViewerFiles(),
    }
    const manifestFiles: FeedbackBundleFile[] = []
    const ids = new Set<string>()
    for (const attachment of input.attachments ?? []) {
      if (typeof attachment.id !== 'string' || attachment.id.length < 1 || attachment.id.length > 128 || ids.has(attachment.id) || attachment.bytes.byteLength > MAX_FILE_BYTES)
        throw new Error('Invalid attachment')
      ids.add(attachment.id)
      const suffix = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/webm': 'webm', 'video/mp4': 'mp4', 'text/plain': 'txt', 'application/json': 'json', 'application/pdf': 'pdf' } as Record<string, string>)[attachment.contentType] ?? 'bin'
      // 原始标识仅保存在清单，使用区分大小写且保留字符串编码的摘要构造安全路径。
      const path = `attachments/${await checksum(strToU8(JSON.stringify(attachment.id)))}.${suffix}`
      const hash = await checksum(attachment.bytes)
      if (attachment.checksum && attachment.checksum !== hash)
        throw new Error('Attachment checksum mismatch')
      files[path] = new Uint8Array(attachment.bytes)
      manifestFiles.push({ path, size: attachment.bytes.byteLength, sha256: hash, kind: 'attachment', attachmentId: attachment.id, name: attachment.name, contentType: attachment.contentType })
    }
    const manifest: FeedbackBundleManifest = { format: 'hai-feedback', version: 1, reportId: report.id, evidenceRevision: typeof report.evidenceRevision === 'number' ? report.evidenceRevision : 0, createdAt: input.createdAt ?? Date.now(), missing, files: manifestFiles }
    const temporary: FeedbackBundle = { report: { ...report, id: report.id }, evidence, history, manifest, files }
    files['summary.md'] = strToU8(summarizeFeedbackBundle(temporary))
    for (const [path, bytes] of Object.entries(files)) {
      if (manifestFiles.some(file => file.path === path))
        continue
      const kind = path === 'report.json' ? 'report' : path === 'summary.md' ? 'summary' : path.startsWith('viewer/') ? 'viewer' : path.endsWith('history.json') ? 'history' : 'evidence'
      manifest.files.push({ path, size: bytes.byteLength, sha256: await checksum(bytes), kind })
    }
    files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))
    const total = Object.values(files).reduce((sum, file) => sum + file.byteLength, 0)
    if (Object.keys(files).length > MAX_FILES || total > Math.min(input.maxBytes ?? MAX_BYTES, MAX_BYTES) || Object.values(files).some(file => file.byteLength > MAX_FILE_BYTES))
      throw new Error('Bundle limits exceeded')
    return ok(zipSync(files, { level: 1, mtime: new Date(1980, 0, 1) }))
  }
  catch {
    return err(HaiCommonError.VALIDATION_ERROR, bundleM('invalid'))
  }
}

/**
 * 校验 ZIP 路径、容量、协议与所有文件的 SHA-256 后读取；不执行包内代码。
 * @example
 * ```ts
 * import { createFeedbackBundle, readFeedbackBundle } from '@h-ai/feedback/bundle'
 * const created = await createFeedbackBundle({ report: { id: 'fb_1' }, evidence: [] })
 * if (created.success) {
 *   const parsed = await readFeedbackBundle(created.data, { maxBytes: 32 * 1024 * 1024 })
 *   if (parsed.success) { const reportId: string = parsed.data.report.id }
 * }
 * ```
 */
export async function readFeedbackBundle(bytes: Uint8Array, options?: FeedbackBundleReadOptions): Promise<HaiResult<FeedbackBundle>> {
  try {
    const limits = limitsFor(options)
    preflight(bytes, limits)
    const files = unzipSync(bytes)
    const manifest = parseManifest(objectFromFile(files, 'manifest.json'))
    if (Object.keys(files).length !== manifest.files.length + 1)
      throw new Error('Unexpected bundle file')
    let total = 0
    for (const file of manifest.files) {
      const content = files[file.path]
      if (!content || content.byteLength !== file.size || content.byteLength > limits.maxFileBytes || await checksum(content) !== file.sha256)
        throw new Error('File integrity failed')
      total += content.byteLength
    }
    if (total > limits.maxBytes)
      throw new Error('Bundle expansion limit')
    const report = objectFromFile(files, 'report.json')
    if (['appVersion', 'buildId', 'commit'].some(key => report[key] !== undefined && (typeof report[key] !== 'string' || report[key].length > 128)))
      throw new Error('Invalid build metadata')
    if (typeof report.id !== 'string' || report.id !== manifest.reportId)
      throw new Error('Report mismatch')
    const records: unknown = JSON.parse(strFromU8(files['evidence/records.json'] ?? new Uint8Array()))
    const history: unknown = JSON.parse(strFromU8(files['evidence/history.json'] ?? new Uint8Array()))
    if (!Array.isArray(records) || !Array.isArray(history))
      throw new Error('Invalid evidence collection')
    return ok({ manifest, report: { ...report, id: report.id }, evidence: records.map(evidenceFrom), history: history.map(jsonObject), files })
  }
  catch {
    return err(HaiCommonError.VALIDATION_ERROR, bundleM('invalid'))
  }
}

/**
 * 生成人工与 AI 可读摘要，明确用户描述与采集事实。
 * @example
 * ```ts
 * import { createFeedbackBundle, readFeedbackBundle, summarizeFeedbackBundle } from '@h-ai/feedback/bundle'
 * const created = await createFeedbackBundle({ report: { id: 'fb_1' }, evidence: [] })
 * if (created.success) {
 *   const parsed = await readFeedbackBundle(created.data)
 *   if (parsed.success) { const markdown: string = summarizeFeedbackBundle(parsed.data) }
 * }
 * ```
 */
export function summarizeFeedbackBundle(bundle: FeedbackBundle): string {
  const report = bundle.report
  const safeText = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value).replaceAll('\r', '').replaceAll('\n', ' ') : ''
  return [
    `# ${bundleM('title')} ${safeText(report.number ?? report.id)}`,
    '',
    `## ${bundleM('user')}`,
    '',
    safeText(report.description) || bundleM('empty'),
    '',
    `## ${bundleM('facts')}`,
    '',
    `- ID: ${safeText(report.id)}`,
    `- App: ${safeText(report.appId)} ${safeText(report.appVersion)}`,
    `- Build: ${safeText(report.buildId)} ${safeText(report.commit)}`,
    `- Revision: ${bundle.manifest.evidenceRevision}`,
    `- ${bundleM('evidence')}: ${bundle.evidence.length}`,
    `- ${bundleM('attachments')}: ${bundle.manifest.files.filter(file => file.kind === 'attachment').length}`,
    '',
    `## ${bundleM('missing')}`,
    '',
    ...bundle.manifest.missing.map(reason => `- ${safeText(reason)}`),
    '',
  ].join('\n')
}

/**
 * 通过时间、请求、错误与类型筛选离线证据；错误按锚点来源和请求取前后各 100 条，分页最大 100 条。
 * @example
 * ```ts
 * import { createFeedbackBundle, queryFeedbackBundle, readFeedbackBundle } from '@h-ai/feedback/bundle'
 * const created = await createFeedbackBundle({ report: { id: 'fb_1' }, evidence: [] })
 * if (created.success) {
 *   const parsed = await readFeedbackBundle(created.data)
 *   if (parsed.success) { const page = queryFeedbackBundle(parsed.data, { requestId: 'req_1', page: 1, pageSize: 20 }) }
 * }
 * ```
 */
export function queryFeedbackBundle(bundle: FeedbackBundle, query: FeedbackBundleQuery = {}): FeedbackBundleEvidencePage {
  const page = Number.isSafeInteger(query.page) && (query.page ?? 0) > 0 ? query.page! : 1
  const pageSize = Number.isSafeInteger(query.pageSize) && (query.pageSize ?? 0) > 0 ? Math.min(100, query.pageSize!) : 20
  let candidates = bundle.evidence
  if (query.errorId) {
    const anchor = candidates.find(item => item.kind === 'error' && item.errorId === query.errorId)
    if (!anchor)
      return { items: [], total: 0, page, pageSize }
    const anchorSequence = anchor.sequence ?? anchor.timestamp
    const context = candidates.filter(item => item.source === anchor.source && item.requestId === anchor.requestId && ['log', 'error'].includes(item.kind))
    const before = context.filter(item => (item.sequence ?? item.timestamp) <= anchorSequence).sort((left, right) => (right.sequence ?? right.timestamp) - (left.sequence ?? left.timestamp)).slice(0, 101)
    const after = context.filter(item => (item.sequence ?? item.timestamp) > anchorSequence).sort((left, right) => (left.sequence ?? left.timestamp) - (right.sequence ?? right.timestamp)).slice(0, 100)
    const window = new Set([...before, ...after])
    candidates = candidates.filter(item => window.has(item))
  }
  const records = candidates.filter(item => (!query.kind || item.kind === query.kind)
    && (!query.requestId || item.requestId === query.requestId)
    && (query.from === undefined || item.timestamp >= query.from) && (query.to === undefined || item.timestamp <= query.to))
    .sort((left, right) => left.timestamp - right.timestamp || left.source.localeCompare(right.source) || (left.sequence ?? 0) - (right.sequence ?? 0))
  return { items: records.slice((page - 1) * pageSize, page * pageSize), total: records.length, page, pageSize }
}

/**
 * 获取内置可信离线查看器；本地服务必须使用此资源而不是执行导入包中的脚本。
 * @example
 * ```ts
 * import { getFeedbackBundleViewerFiles } from '@h-ai/feedback/bundle'
 * const html: Uint8Array | undefined = getFeedbackBundleViewerFiles()['viewer/index.html']
 * ```
 */
export function getFeedbackBundleViewerFiles(): Readonly<Record<string, Uint8Array>> {
  return feedbackViewerFiles()
}
