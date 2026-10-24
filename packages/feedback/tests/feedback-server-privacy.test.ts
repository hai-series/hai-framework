import { Buffer } from 'node:buffer'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { core } from '@h-ai/core'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFeedbackBundle } from '../src/bundle/index.js'
import { feedback } from '../src/index.js'

const actor = { scopeId: 'privacy-scope', userId: 'privacy-owner', permissions: ['feedback:*'] }
const config = { appId: 'server-privacy', recipients: ['admin@example.test'], adminUrl: 'http://localhost/admin/feedback', workerIntervalMs: 0 }
let directory: string | undefined
let previousLevel = core.logger.getLevel()

beforeEach(async () => {
  previousLevel = core.logger.getLevel()
  core.logger.setLevel('fatal')
  // 在创建本轮 logger 前接管输出，哨兵只验证采集结果，不写测试终端。
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  directory = await mkdtemp(join(tmpdir(), 'hai-feedback-server-privacy-'))
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
  expect((await reach.init({ providers: [{ name: 'email', type: 'console' }] })).success).toBe(true)
  expect((await feedback.init(config)).success).toBe(true)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await feedback.close()
  await reach.close()
  await storage.close()
  await reldb.close()
  if (directory)
    await rm(directory, { recursive: true, force: true })
  directory = undefined
  core.logger.setLevel(previousLevel)
})

describe('服务端自由文本隐私边界', () => {
  it('真实logger的JSON凭据、token、session和Basic在DB、API及ZIP中均不保留哨兵', async () => {
    const basic = Buffer.from('fixture:PRIVACY_BASIC_SENTINEL').toString('base64')
    const messages = [
      '{"password":"PRIVACY_JSON_SENTINEL"}',
      'token=PRIVACY_TOKEN_SENTINEL',
      'session: PRIVACY_SESSION_SENTINEL',
      '{"id_token":"PRIVACY_ID_TOKEN_SENTINEL"}',
      `Authorization: Basic ${basic}`,
      JSON.stringify({ password: 'escaped " PRIVACY_ESCAPED_SENTINEL' }),
      '\'session\':\'PRIVACY_SINGLE_QUOTED_SENTINEL\'',
      'sessionId=PRIVACY_SESSION_ID_SENTINEL',
      'Bearer PRIVACY_BEARER_SENTINEL',
      '{"token":"PRIVACY_MULTIPLE_ONE","session":"PRIVACY_MULTIPLE_TWO"}',
      JSON.stringify({ body: JSON.stringify({ password: 'escaped-key-sentinel', token: 'nested-token-sentinel' }) }),
      JSON.stringify({ body: JSON.stringify({ password: 'prefix " PRIVACY_NESTED_QUOTE_SENTINEL and PRIVACY_NESTED_TAIL_SENTINEL' }) }),
    ]
    const sentinels = ['PRIVACY_JSON_SENTINEL', 'PRIVACY_TOKEN_SENTINEL', 'PRIVACY_SESSION_SENTINEL', 'PRIVACY_ID_TOKEN_SENTINEL', basic, 'PRIVACY_ESCAPED_SENTINEL', 'PRIVACY_SINGLE_QUOTED_SENTINEL', 'PRIVACY_SESSION_ID_SENTINEL', 'PRIVACY_BEARER_SENTINEL', 'PRIVACY_MULTIPLE_ONE', 'PRIVACY_MULTIPLE_TWO', 'PRIVACY_STRUCTURED_SENTINEL', 'PRIVACY_URL_SENTINEL', 'escaped-key-sentinel', 'nested-token-sentinel', 'PRIVACY_NESTED_QUOTE_SENTINEL', 'PRIVACY_NESTED_TAIL_SENTINEL']
    const logger = core.logger.create({ name: 'server-privacy', level: 'error', format: 'json' })
    core.context.run({ scopeId: actor.scopeId, userId: actor.userId, requestId: 'privacy-request' }, () => {
      for (const message of messages)
        logger.error(`Diagnostic state ${message}`, { profile: { password: 'PRIVACY_STRUCTURED_SENTINEL' }, url: 'https://example.test/path?token=PRIVACY_URL_SENTINEL&visible=ok', diagnostic: 'KEEP_VISIBLE_FACT' })
    })
    const report = await feedback.submit({ appId: config.appId, submissionId: 'private-logger-text' }, actor)
    expect(report.success).toBe(true)
    if (!report.success)
      return
    expect((await feedback.completeCollection({ id: report.data.id }, actor)).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    const database = await reldb.sql.query<{ payload: unknown }>('SELECT payload FROM hai_feedback_evidence WHERE report_id = ?', [report.data.id])
    expect(database.success).toBe(true)
    const api = await feedback.getEvidence({ id: report.data.id, requestId: 'privacy-request', pageSize: 100 }, actor)
    expect(api.success).toBe(true)
    if (!database.success || !api.success)
      return
    expect(api.data.items.filter(item => item.kind === 'error')).toHaveLength(messages.length)
    const exported = await feedback.export({ id: report.data.id }, actor)
    expect(exported.success).toBe(true)
    if (!exported.success)
      return
    expect((await feedback.runJobs()).success).toBe(true)
    const archive = await feedback.getExport({ id: report.data.id, jobId: exported.data.id }, actor)
    expect(archive.success).toBe(true)
    if (!archive.success)
      return
    const bundle = await readFeedbackBundle(Buffer.from(archive.data.dataBase64, 'base64'))
    expect(bundle.success).toBe(true)
    if (!bundle.success)
      return
    const zipContents = Object.fromEntries(Object.entries(bundle.data.files).map(([name, bytes]) => [name, new TextDecoder().decode(bytes)]))
    for (const result of [database.data, api.data, zipContents]) {
      const serialized = JSON.stringify(result)
      for (const sentinel of sentinels)
        expect(serialized).not.toContain(sentinel)
      expect(serialized).toContain('[REDACTED]')
      expect(serialized).toContain('KEEP_VISIBLE_FACT')
      expect(serialized).toContain('visible=ok')
    }
  })
})
