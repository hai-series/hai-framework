/** 真实 Nginx 共用网络内的完整加密链路；仅创建本进程的 HTTP 服务与内存 registry。 */
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import process from 'node:process'
import { Readable } from 'node:stream'
import { authenticateTransportRequest, createInMemoryKeyStore, crypto, readTransportBody, resolveTransportBodyLimits, TRANSPORT_BODY_LIMITS } from '@h-ai/crypto'
import { createTransportWorkbook } from '../../../serv/tests/helpers/serv-transport-workbook.js'

const initialized = await crypto.init()
assert.equal(initialized.success, true)
const pair = crypto.asymmetric.generateKeyPair()
if (!pair.success)
  throw new Error(pair.error.message)
const maxPlaintextBytes = Number(process.env.HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES)
const created = crypto.transport.createServer({ keyStore: createInMemoryKeyStore(), serverKeyRing: { activeKeyId: 'v1', keys: { v1: pair.data } }, maxPlaintextBytes })
if (!created.success)
  throw new Error(created.error.message)
const manager = created.data
const workbook = createTransportWorkbook(4 * 1024 * 1024)
const result = '合法响应'.repeat(100_000)
let businessRequests = 0
const backend = createServer(async (incoming, outgoing) => {
  try {
    const headers = new Headers()
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value !== undefined)
        headers.set(name, Array.isArray(value) ? value.join(', ') : value)
    }
    const request = new Request(`http://localhost${incoming.url}`, { method: incoming.method, headers, body: incoming.method === 'GET' ? undefined : Readable.toWeb(incoming) as ReadableStream<Uint8Array>, duplex: 'half' } as RequestInit)
    if (incoming.url?.endsWith('/_hai/key-exchange')) {
      const input = JSON.parse(await readTransportBody(request.body, { maxBytes: TRANSPORT_BODY_LIMITS.keyExchangeBytes })) as { clientPublicKey: string }
      const clientId = await manager.registerClientKey(input.clientPublicKey)
      outgoing.setHeader('Content-Type', 'application/json')
      outgoing.end(JSON.stringify({ clientId, serverKeyId: manager.getServerKeyId(), serverPublicKey: manager.getServerPublicKey(), maxPlaintextBytes }))
      return
    }
    businessRequests++
    const verified = await authenticateTransportRequest(manager, request)
    if (!verified.success)
      throw new Error(verified.error.message)
    const input = JSON.parse(verified.data.plaintext) as { file?: string, payload?: string }
    if (input.file)
      assert.equal(Buffer.from(input.file, 'base64').equals(workbook), true)
    else
      assert.ok([12 * 1048576 - 14, 24 * 1048576 - 14].includes(input.payload?.length ?? 0))
    const encrypted = await manager.encryptResponse(verified.data.context, JSON.stringify({ result }), 200)
    if (!encrypted.success)
      throw new Error(encrypted.error.message)
    outgoing.setHeader('X-Encrypted', 'true')
    outgoing.setHeader('Content-Type', 'application/json')
    outgoing.end(JSON.stringify(encrypted.data))
  }
  catch {
    outgoing.statusCode = 500
    outgoing.end('Proxy fixture backend failed')
  }
})
const client = crypto.transport.createClient({ keyExchangeUrl: 'http://127.0.0.1:18080/api/v1/_hai/key-exchange' })
try {
  await new Promise<void>(resolve => backend.listen(3000, '127.0.0.1', resolve))
  const response = await client.encryptedFetch('http://127.0.0.1:18080/api/v1/import', { method: 'POST', body: JSON.stringify({ name: 'capacity.xlsx', file: workbook.toString('base64') }) })
  assert.deepEqual(await response.json(), { result })
  let expectedRequests = 1
  for (const bytes of [12 * 1048576, 24 * 1048576]) {
    if (bytes > maxPlaintextBytes)
      continue
    const body = JSON.stringify({ payload: 'x'.repeat(bytes - 14) })
    assert.equal(Buffer.byteLength(body), bytes)
    const ordinary = await client.encryptedFetch('http://127.0.0.1:18080/api/v1/import', { method: 'POST', body })
    assert.deepEqual(await ordinary.json(), { result })
    process.stdout.write(`TRANSPORT_CAPACITY_BODY_PASS:${bytes}\n`)
    expectedRequests++
  }
  const rejected = await fetch('http://127.0.0.1:18080/api/v1/import', { method: 'POST', body: Buffer.alloc(resolveTransportBodyLimits(maxPlaintextBytes).encryptedPayloadBytes + 1) })
  assert.equal(rejected.status, 413)
  assert.match(await rejected.text(), /nginx/)
  assert.equal(businessRequests, expectedRequests)
  process.stdout.write('TRANSPORT_CAPACITY_PASS\n')
}
finally {
  client.destroy()
  backend.closeAllConnections()
  await new Promise<void>(resolve => backend.close(() => resolve()))
  await manager.close()
  await crypto.close()
}
