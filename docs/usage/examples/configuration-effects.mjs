/** 在隔离文件中演示配置覆盖和 HTTP 边界；不读取工程凭据，不监听端口。 */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { apiContract } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { datapipe } from '@h-ai/datapipe'
import { IamConfigSchema } from '@h-ai/iam'
import { serv } from '@h-ai/serv'

const directory = await mkdtemp(path.join(tmpdir(), 'hai-config-guide-'))
assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
assert.ok(path.basename(directory).startsWith('hai-config-guide-'))
const parentKey = 'HAI_GUIDE_SESSION'
const leafKey = 'HAI_GUIDE_SESSION_MAXAGE'
const original = new Map([parentKey, leafKey].map(key => [key, process.env[key]]))
const evidence = {}
function data(result) {
  assert.ok(result.success, result.success ? undefined : result.error.code)
  return result.data
}
try {
  delete process.env[parentKey]
  delete process.env[leafKey]
  const file = path.join(directory, 'guide.yml')
  await writeFile(file, 'session:\n  maxAge: 86400\n')
  const base = data(core.config.load('guide', file, IamConfigSchema))
  process.env[leafKey] = '1800'
  const leaf = data(core.config.load('guide', file, IamConfigSchema))
  process.env[parentKey] = '{"maxAge":3600}'
  const parent = data(core.config.load('guide', file, IamConfigSchema))
  assert.deepEqual([base.session.maxAge, leaf.session.maxAge, parent.session.maxAge], [86400, 1800, 3600])
  evidence.configuration = { yamlSeconds: base.session.maxAge, leafOverrideSeconds: leaf.session.maxAge, parentAndLeafSeconds: parent.session.maxAge }

  const noOverlap = data(datapipe.chunk('abcdefghij', { mode: 'character', maxSize: 4 }))
  const overlap = data(datapipe.chunk('abcdefghij', { mode: 'character', maxSize: 4, overlap: 1 }))
  evidence.chunk = { input: 'abcdefghij', maxSize: 4, defaultOverlap: noOverlap.map(item => item.content), overlap1: overlap.map(item => item.content) }
  assert.deepEqual(evidence.chunk.defaultOverlap, ['abcd', 'efgh', 'ij'])
  assert.deepEqual(evidence.chunk.overlap1, ['abcd', 'defg', 'ghij'])

  const contract = apiContract.create({})
  const procedures = serv.implement(contract).context().build()
  const app = serv.createApp({ contract, procedures })
  const health = await app.request('/health', { headers: { 'x-request-id': 'guide-health-1' } })
  const docs = await app.request('/docs')
  const forged = serv.parseRequestContext({ request: new Request('https://service.example.invalid/', { headers: { 'x-forwarded-for': '192.0.2.99' } }), remoteAddress: '192.0.2.10' })
  assert.equal(health.status, 200)
  assert.equal(docs.status, 404)
  assert.equal(forged.ip, '192.0.2.10')
  evidence.http = { healthStatus: health.status, healthRequestId: health.headers.get('x-request-id'), docsDefaultStatus: docs.status, forgedForwardedFor: '192.0.2.99', actualClientIp: forged.ip }

  evidence.publicError = core.error.toPublic({ code: 'example:unavailable', message: 'Private database diagnostic', httpStatus: 500 }, 'guide-error-1')
  assert.equal(evidence.publicError.traceId, 'guide-error-1')
  assert.ok(!JSON.stringify(evidence.publicError).includes('Private database diagnostic'))
}
finally {
  for (const [key, value] of original) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await rm(directory, { recursive: true, force: true })
}
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
