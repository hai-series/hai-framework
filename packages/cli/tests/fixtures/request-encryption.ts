/** 复制到真实 Fullstack 工程，验证独立策略中的传输开关，不由单元测试收集。 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { expect, test } from '@playwright/test'

test('generated Fullstack serves scoped plaintext endpoints and keeps other endpoints encrypted', async ({ request }, testInfo) => {
  const origin = process.env.SERVICE_BASE_URL
  if (!origin)
    throw new Error('SERVICE_BASE_URL is required for this generated-project gate')
  const plain = await request.get(`${origin}/api/v1/policy-plain`)
  expect(plain.status()).toBe(200)
  expect(plain.headers()['x-encrypted']).toBeUndefined()
  const plainBody = await plain.json()
  expect(plainBody).toEqual({ kind: 'plain-external' })
  const denied = await request.get(`${origin}/api/v1/policy-denied`, { headers: { 'x-request-id': 'fullstack-plain-denied' } })
  const deniedBody = await denied.json()
  expect(denied.status()).toBe(403)
  expect(deniedBody).toMatchObject({ success: false, error: { code: 'hai:common:104', traceId: 'fullstack-plain-denied' } })
  const required = await request.get(`${origin}/api/v1/policy-required`)
  expect(required.status()).toBe(400)
  const mismatch = await request.get(`${origin}/api/v1/policy-plain`, { headers: { 'x-encrypted': 'true', 'x-request-id': 'fullstack-mode-mismatch' } })
  expect(mismatch.status()).toBe(400)
  const mismatchBody = await mismatch.json()
  expect(mismatchBody).toMatchObject({ success: false, error: { traceId: 'fullstack-mode-mismatch' } })
  const directory = process.env.HAI_AUTH_EVIDENCE_DIR || testInfo.outputDir
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'request-encryption-serv.json'), JSON.stringify({
    checkedAt: new Date().toISOString(),
    host: 'generated Fullstack / Serv',
    plain: { status: plain.status(), body: plainBody, encrypted: false },
    denied: { status: denied.status(), body: deniedBody },
    requiredWithoutProtocol: { status: required.status() },
    encryptedEnvelopeOnPlainEndpoint: { status: mismatch.status(), body: mismatchBody },
  }, null, 2))
})
