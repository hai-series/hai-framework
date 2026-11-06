/** 真实 Nginx 共用网络内的完整加密链路；后端在独立 worker 中运行。 */
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { createServer } from 'node:http'
import process from 'node:process'
import { Readable } from 'node:stream'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { authenticateTransportRequest, createInMemoryKeyStore, crypto, readTransportBody, resolveTransportBodyLimits, TRANSPORT_BODY_LIMITS } from '@h-ai/crypto'
import { createTransportWorkbook } from '../../../serv/tests/helpers/serv-transport-workbook.js'

const maxPlaintextBytes = Number(process.env.HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES)
const workbook = createTransportWorkbook(4 * 1024 * 1024)
const result = '合法响应'.repeat(100_000)

async function serveTransportBackend(): Promise<void> {
  const port = parentPort
  const requestCounts: unknown = workerData
  assert.ok(port)
  assert.ok(requestCounts instanceof Int32Array && requestCounts.buffer instanceof SharedArrayBuffer)
  const pair = crypto.asymmetric.generateKeyPair()
  if (!pair.success)
    throw new Error(pair.error.message)
  const created = crypto.transport.createServer({ keyStore: createInMemoryKeyStore(), serverKeyRing: { activeKeyId: 'v1', keys: { v1: pair.data } }, maxPlaintextBytes })
  if (!created.success)
    throw new Error(created.error.message)
  const manager = created.data
  const backend = createServer(async (incoming, outgoing) => {
    let stage = 'request'
    try {
      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(', ') : value)
      }
      const request = new Request(`http://localhost${incoming.url}`, { method: incoming.method, headers, body: incoming.method === 'GET' ? undefined : Readable.toWeb(incoming) as ReadableStream<Uint8Array>, duplex: 'half' } as RequestInit)
      if (incoming.url?.endsWith('/_hai/key-exchange')) {
        stage = 'key-exchange'
        const input = JSON.parse(await readTransportBody(request.body, { maxBytes: TRANSPORT_BODY_LIMITS.keyExchangeBytes })) as { clientPublicKey: string }
        const clientId = await manager.registerClientKey(input.clientPublicKey)
        outgoing.setHeader('Content-Type', 'application/json')
        outgoing.end(JSON.stringify({ clientId, serverKeyId: manager.getServerKeyId(), serverPublicKey: manager.getServerPublicKey(), maxPlaintextBytes }))
        return
      }
      Atomics.add(requestCounts, 0, 1)
      stage = 'authenticate'
      const verified = await authenticateTransportRequest(manager, request)
      if (!verified.success) {
        process.stderr.write(`Transport capacity authentication rejected: ${verified.error.code}\n`)
        throw new Error(verified.error.message)
      }
      stage = 'validate-body'
      const input = JSON.parse(verified.data.plaintext) as { file?: string, payload?: string }
      if (input.file)
        assert.equal(Buffer.from(input.file, 'base64').equals(workbook), true)
      else
        assert.ok([12 * 1048576 - 14, 24 * 1048576 - 14].includes(input.payload?.length ?? 0))
      stage = 'encrypt-response'
      const encrypted = await manager.encryptResponse(verified.data.context, JSON.stringify({ result }), 200)
      if (!encrypted.success) {
        process.stderr.write(`Transport capacity response encryption failed: ${encrypted.error.code}\n`)
        throw new Error(encrypted.error.message)
      }
      outgoing.setHeader('X-Encrypted', 'true')
      outgoing.setHeader('Content-Type', 'application/json')
      outgoing.end(JSON.stringify(encrypted.data))
    }
    catch (cause) {
      // 仅记录夹具阶段和错误类型，不输出请求、密钥或响应内容。
      process.stderr.write(`Transport capacity backend failed: stage=${stage} kind=${cause instanceof Error ? cause.name : typeof cause}\n`)
      outgoing.statusCode = 500
      outgoing.end('Proxy fixture backend failed')
    }
  })
  try {
    const listening = once(backend, 'listening')
    backend.listen(3000, '127.0.0.1')
    await listening
    const stopping = once(port, 'message')
    port.postMessage('ready')
    const [command] = await stopping
    assert.equal(command, 'close')
  }
  finally {
    if (backend.listening) {
      const closed = once(backend, 'close')
      backend.close()
      backend.closeAllConnections()
      await closed
    }
    port.close()
    await manager.close()
  }
}

async function verifyTransportCapacity(): Promise<void> {
  // 大请求的同步客户端加密不能阻塞后端处理代理的连接和空闲计时器。
  const requestCounts = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT))
  const backend = new Worker(new URL(import.meta.url), { workerData: requestCounts })
  const finished = once(backend, 'exit')
  try {
    const [ready] = await Promise.race([once(backend, 'message'), finished])
    assert.equal(ready, 'ready')
    const client = crypto.transport.createClient({
      keyExchangeUrl: 'http://127.0.0.1:18080/api/v1/_hai/key-exchange',
      fetch: async (input, init) => {
        const response = await fetch(input, init)
        if (!response.ok)
          process.stderr.write(`Transport capacity proxy response: status=${response.status} encrypted=${response.headers.get('X-Encrypted') === 'true'}\n`)
        return response
      },
    })
    try {
      const response = await client.encryptedFetch('http://127.0.0.1:18080/api/v1/import', { method: 'POST', body: JSON.stringify({ name: 'capacity.xlsx', file: workbook.toString('base64') }) })
      assert.deepEqual(await response.json(), { result })
      let expectedRequests = 1
      for (const bytes of [12 * 1048576, 24 * 1048576]) {
        if (bytes > maxPlaintextBytes)
          continue
        const body = JSON.stringify({ payload: 'x'.repeat(bytes - 14) })
        assert.equal(Buffer.byteLength(body), bytes)
        process.stdout.write(`TRANSPORT_CAPACITY_BODY_START:${bytes}\n`)
        const ordinary = await client.encryptedFetch('http://127.0.0.1:18080/api/v1/import', { method: 'POST', body })
        assert.deepEqual(await ordinary.json(), { result })
        process.stdout.write(`TRANSPORT_CAPACITY_BODY_PASS:${bytes}\n`)
        expectedRequests++
      }
      const rejected = await fetch('http://127.0.0.1:18080/api/v1/import', { method: 'POST', body: Buffer.alloc(resolveTransportBodyLimits(maxPlaintextBytes).encryptedPayloadBytes + 1) })
      assert.equal(rejected.status, 413)
      assert.match(await rejected.text(), /nginx/)
      assert.equal(Atomics.load(requestCounts, 0), expectedRequests)
      process.stdout.write('TRANSPORT_CAPACITY_PASS\n')
    }
    finally {
      client.destroy()
    }
  }
  finally {
    backend.postMessage('close')
    const [code] = await finished
    assert.equal(code, 0)
  }
}

const initialized = await crypto.init()
assert.equal(initialized.success, true)
try {
  if (isMainThread)
    await verifyTransportCapacity()
  else
    await serveTransportBackend()
}
finally {
  await crypto.close()
}
