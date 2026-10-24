import type { Socket } from 'node:net'
import type { DbTestEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import type { StorageTestEnv } from '../../storage/tests/helpers/storage-test-suite.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import { core } from '@h-ai/core'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mysqlEnv, postgresEnv, sqliteMemoryEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { s3Env } from '../../storage/tests/helpers/storage-test-suite.js'
import { readFeedbackBundle } from '../src/bundle/index.js'
import { feedback, HaiFeedbackError } from '../src/index.js'

/** 本机 SMTP 协议接收器，实际使用 Nodemailer/TCP，禁止向真实管理员地址投递。 */
function smtpFixture() {
  const messages: string[] = []
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    socket.write('220 feedback-fixture ESMTP\r\n')
    let pending = ''
    let collecting = false
    let message = ''
    socket.on('data', (bytes) => {
      pending += bytes.toString('utf8')
      while (pending.includes('\r\n')) {
        const end = pending.indexOf('\r\n')
        const line = pending.slice(0, end)
        pending = pending.slice(end + 2)
        if (collecting) {
          if (line === '.') {
            messages.push(message)
            message = ''
            collecting = false
            socket.write('250 queued\r\n')
          }
          else if (message.length < 65536) {
            message += `${line}\r\n`
          }
          continue
        }
        if (/^(?:EHLO|HELO)/i.test(line)) {
          socket.write('250-feedback-fixture\r\n250 8BITMIME\r\n')
        }
        else if (/^DATA/i.test(line)) {
          collecting = true
          socket.write('354 end with dot\r\n')
        }
        else if (/^QUIT/i.test(line)) {
          socket.end('221 bye\r\n')
        }
        else {
          socket.write('250 OK\r\n')
        }
      }
    })
  })
  return {
    messages,
    async start() {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
      })
      const address = server.address()
      if (!address || typeof address === 'string')
        throw new Error('SMTP listener not available')
      return address.port
    },
    async close() {
      for (const socket of sockets) socket.destroy()
      if (server.listening)
        await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}

/** 读取 TCP 接收器实际收到的单一 HTML MIME 正文，处理 Nodemailer 的传输编码与折行。 */
function receivedHtml(message: string): string {
  const boundary = message.indexOf('\r\n\r\n')
  if (boundary < 0)
    throw new Error('SMTP fixture did not receive a complete MIME message')
  const headers = message.slice(0, boundary).replace(/\r\n[\t ]+/g, ' ')
  if (!/^Content-Type:\s*text\/html\b/im.test(headers))
    throw new Error('SMTP fixture expected the HTML part sent by Reach')
  const body = message.slice(boundary + 4)
  const encoding = /^Content-Transfer-Encoding:\s*([^\r\n]+)/im.exec(headers)?.[1]?.trim().toLowerCase() ?? '7bit'
  if (encoding === 'base64')
    return Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8')
  if (encoding === 'quoted-printable') {
    const decoded = body.replace(/=\r?\n/g, '').replace(/=([\dA-F]{2})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    return Buffer.from(decoded, 'latin1').toString('utf8')
  }
  if (encoding === '7bit' || encoding === '8bit')
    return body
  throw new Error('SMTP fixture received an unsupported transfer encoding')
}

describe.sequential('真实数据库 / S3 / SMTP 反馈闭环', () => {
  const smtp = smtpFixture()
  let s3: StorageTestEnv | undefined
  let port: number
  beforeAll(async () => {
    port = await smtp.start()
    s3 = await s3Env('rustfs')
  }, 180000)
  afterAll(async () => {
    await feedback.close()
    await reach.close()
    await storage.close()
    await reldb.close()
    try {
      await s3?.cleanup?.()
    }
    finally {
      await smtp.close()
    }
  }, 60000)

  it.each([
    { locale: 'zh-CN', submittedLabel: '反馈时间（UTC）', materialLabel: '材料状态', completeLabel: '完整', failedLabel: '采集失败' },
    { locale: 'en-US', submittedLabel: 'Submitted at (UTC)', materialLabel: 'Material status', completeLabel: 'Complete', failedLabel: 'Collection failed' },
    { locale: 'ja-JP', submittedLabel: '報告日時（UTC）', materialLabel: '資料の状態', completeLabel: '完全', failedLabel: '収集失敗' },
  ].flatMap(locale => (['complete', 'failed'] as const).map(status => ({ ...locale, status }))))('真实SMTP正文包含反馈时间及发送时材料状态 ($locale/$status)', async ({ locale, submittedLabel, materialLabel, completeLabel, failedLabel, status }) => {
    const previousLocale = core.i18n.getGlobalLocale()
    let db: DbTestEnv | undefined
    try {
      core.i18n.setGlobalLocale(locale)
      db = sqliteMemoryEnv()
      expect((await reldb.init(db.config)).success).toBe(true)
      expect((await storage.init(s3!.config)).success).toBe(true)
      expect((await reach.init({ providers: [{ name: 'email', type: 'smtp', host: '127.0.0.1', port, secure: false, from: 'feedback@example.test' }] })).success).toBe(true)
      const appId = `mail-content-${locale}-${status}`
      expect((await feedback.init({ appId, recipients: ['administrator@example.test'], adminUrl: 'http://localhost/admin/feedback', workerIntervalMs: 0, maxAttempts: 1, maxEvidenceCount: status === 'failed' ? 1 : 2000 })).success).toBe(true)
      const actor = { scopeId: 'mail-content-scope', userId: 'mail-content-user', permissions: ['feedback:*'] }
      const logger = core.logger.create({ name: 'mail-content-fixture', level: 'error', format: 'json' })
      core.context.run({ scopeId: actor.scopeId, userId: actor.userId, requestId: `mail-${status}` }, () => logger.error('Correlated server evidence for the SMTP fixture'))
      const report = await feedback.submit({ appId, submissionId: `mail-${status}`, description: 'SMTP content fixture' }, actor)
      expect(report.success).toBe(true)
      if (!report.success)
        return
      expect((await feedback.completeCollection({ id: report.data.id }, actor)).success).toBe(true)
      // 先真实执行采集；失败场景由证据配额耗尽触发，不直接伪造 collection_status。
      expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET next_run_at = ? WHERE report_id = ? AND kind = \'notify\'', [Date.now() + 60000, report.data.id])).success).toBe(true)
      const previousMailCount = smtp.messages.length
      expect((await feedback.runJobs()).success).toBe(true)
      expect(smtp.messages.length).toBe(previousMailCount)
      const collected = await feedback.get(report.data.id, actor)
      expect(collected.success).toBe(true)
      if (collected.success) {
        expect(collected.data.report.collectionStatus).toBe(status)
        const collectionJob = collected.data.jobs.find(job => job.type === 'collect')
        expect(collectionJob?.status).toBe(status === 'failed' ? 'failed' : 'succeeded')
        if (status === 'failed')
          expect(collectionJob?.lastError).toBe(HaiFeedbackError.LIMIT_EXCEEDED.code)
      }
      expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET next_run_at = 0 WHERE report_id = ? AND kind = \'notify\'', [report.data.id])).success).toBe(true)
      expect((await feedback.runJobs()).success).toBe(true)
      expect(smtp.messages.length).toBe(previousMailCount + 1)
      const html = receivedHtml(smtp.messages.at(-1)!)
      expect(html).toContain(`${submittedLabel}: ${new Date(report.data.createdAt).toISOString()}`)
      expect(html).toContain(`${materialLabel}: ${status === 'complete' ? completeLabel : failedLabel}`)
      expect(html).toContain(report.data.number)
      expect(html).toContain('SMTP content fixture')
      expect(html).toContain(`http://localhost/admin/feedback?feedback=${report.data.id}`)
      const notified = await feedback.get(report.data.id, actor)
      expect(notified.success).toBe(true)
      if (notified.success) {
        expect(notified.data.report.collectionStatus).toBe(status)
        expect(notified.data.report.notificationStatus).toBe('sent')
      }
    }
    finally {
      await feedback.close()
      await reach.close()
      await storage.close()
      await reldb.close()
      await db?.release?.()
      core.i18n.setGlobalLocale(previousLocale)
    }
  }, 180000)

  for (const [label, setup] of [['sqlite', sqliteMemoryEnv], ['postgresql', postgresEnv], ['mysql', mysqlEnv]] as const) {
    it(`${label}: 保存长说明、上传私有截图、SMTP通知、处理与校验离线包`, async () => {
      let db: DbTestEnv | undefined
      try {
        db = await setup()
        expect((await reldb.init(db.config)).success).toBe(true)
        expect((await storage.init(s3!.config)).success).toBe(true)
        expect((await reach.init({ providers: [{ name: 'email', type: 'smtp', host: '127.0.0.1', port, secure: false, from: 'feedback@example.test' }] })).success).toBe(true)
        const config = { appId: `providers-${label}`, recipients: ['administrator@example.test'], adminUrl: 'http://localhost/admin/feedback', workerIntervalMs: 0 }
        const initialized = await feedback.init(config)
        expect(initialized.success, JSON.stringify(initialized)).toBe(true)
        const actor = { scopeId: `tenant-${label}`, userId: 'user-1', permissions: ['feedback:*'] }
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/x9sAAAAASUVORK5CYII=', 'base64')
        const submitted = await feedback.submit({ submissionId: 'provider-loop', appId: config.appId, description: 'A diagnostic description longer than VARCHAR(255). '.repeat(40), attachments: [{ id: 'screen', name: 'screen.png', contentType: 'image/png', size: png.length, checksum: createHash('sha256').update(png).digest('hex') }] }, actor)
        expect(submitted.success, JSON.stringify(submitted)).toBe(true)
        if (!submitted.success)
          return
        const uploaded = await feedback.uploadAttachment({ id: submitted.data.id, attachmentId: 'screen', dataBase64: png.toString('base64') }, actor)
        expect(uploaded.success, JSON.stringify(uploaded)).toBe(true)
        expect((await feedback.completeCollection({ id: submitted.data.id }, actor)).success).toBe(true)
        const previousMailCount = smtp.messages.length
        expect((await feedback.runJobs()).success).toBe(true)
        const detail = await feedback.get(submitted.data.id, actor)
        expect(detail.success, JSON.stringify(detail)).toBe(true)
        if (detail.success) {
          expect(detail.data.report.notificationStatus).toBe('sent')
          expect(detail.data.report.description!.length).toBeGreaterThan(255)
          expect(detail.data.attachments[0]?.status).toBe('available')
        }
        expect(smtp.messages.length).toBe(previousMailCount + 1)
        expect(smtp.messages.at(-1)).toContain('administrator@example.test')
        expect((await feedback.list({ page: 1, pageSize: 1, search: 'diagnostic' }, actor)).success).toBe(true)
        expect((await feedback.setStatus({ id: submitted.data.id, status: 'handled', expectedVersion: 1 }, actor)).success).toBe(true)
        const exported = await feedback.export({ id: submitted.data.id }, actor)
        expect(exported.success, JSON.stringify(exported)).toBe(true)
        if (!exported.success)
          return
        expect((await feedback.runJobs()).success).toBe(true)
        const zip = await feedback.getExport({ id: submitted.data.id, jobId: exported.data.id }, actor)
        expect(zip.success, JSON.stringify(zip)).toBe(true)
        if (zip.success)
          expect((await readFeedbackBundle(Buffer.from(zip.data.dataBase64, 'base64'))).success).toBe(true)
      }
      finally {
        await feedback.close()
        await reach.close()
        await storage.close()
        await reldb.close()
        await db?.release?.()
      }
    }, 180000)
  }
})
