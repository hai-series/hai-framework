/** 保持 SSE 上游连接打开，并用标准 WebSocket 客户端核对 Nginx 的 101 升级。 */
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import process from 'node:process'

const production = process.argv[2] === 'production'
const frontOrigin = 'http://127.0.0.1:8081'
const firstEvent = 'data: {"jsonrpc":"2.0","id":"orders","result":"working"}\n\n'
const finalEvent = 'data: {"jsonrpc":"2.0","id":"orders","result":"completed"}\n\n'
const audioTicket = 'gateway-log-regression'
const complete = Promise.withResolvers()
const behavior = new Map([
  [
    '/somepath/status',
    { status: 200, body: 'backend healthy' },
  ],
  [
    '/somepath/ready',
    { status: 200, body: 'ready' },
  ],
  [
    '/somepath/reference',
    { status: 401, body: 'authenticated docs required' },
  ],
  [
    '/somepath/schema.json',
    { status: 200, body: '{"openapi":"3.1.0"}' },
  ],
  [
    '/somepath/_hai/scalar.js',
    { status: 200, body: 'globalThis.scalarBackend = true;' },
  ],
  [
    '/somepath/.well-known/agent-card.json',
    { status: 200, body: '{"name":"Orders Assistant"}' },
  ],
])
const server = createServer((request, response) => {
  if (request.url === '/somepath/partners/orders') {
    if (request.method !== 'POST' || request.headers['x-agent-key'] !== 'orders-fixture') {
      response.writeHead(401).end('A2A authentication required')
      return
    }
    request.resume()
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.write(firstEvent)
    void complete.promise.then(() => response.end(finalEvent))
    return
  }
  const route = behavior.get(request.url)
  if (route) {
    response.writeHead(route.status).end(route.body)
    return
  }
  response.writeHead(request.url?.startsWith('/somepath/api/v1/')
    ? 401
    : 404).end()
})
const sockets = new Set()
server.on('connection', (socket) => {
  sockets.add(socket)
  socket.once('close', () => sockets.delete(socket))
})
server.on('upgrade', (request, socket) => {
  const key = request.headers['sec-websocket-key']
  const url = new URL(request.url, 'http://localhost')
  if (url.pathname !== '/voice' || url.searchParams.get('ticket') !== audioTicket || request.headers.upgrade !== 'websocket'
    || request.headers.connection?.toLowerCase() !== 'upgrade' || typeof key !== 'string') {
    socket.destroy()
    return
  }
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n'))
  const text = Buffer.from('voice-ready')
  const frame = Buffer.concat([
    Buffer.from([0x81, text.length]),
    text,
  ])
  socket.end(Buffer.concat([
    frame,
    Buffer.from([0x88, 0x02, 0x03, 0xE8]),
  ]))
})

function read(url, init) {
  return fetch(frontOrigin + url, {
    ...init,
    signal: AbortSignal.timeout(5_000),
  })
}

async function readFrame(reader) {
  const decoder = new TextDecoder()
  let frame = ''
  while (!frame.endsWith('\n\n')) {
    const { done, value } = await reader.read()
    assert.equal(done, false)
    frame += decoder.decode(value, { stream: true })
  }
  return frame
}

function connectAudio() {
  const client = new WebSocket(`ws://127.0.0.1:8080/voice?ticket=${audioTicket}`)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.close()
      reject(new Error('Timed out waiting for an upgraded audio frame'))
    }, 5_000)
    client.addEventListener('message', (message) => {
      clearTimeout(timeout)
      resolve(message.data)
    }, { once: true })
    client.addEventListener('error', () => {
      clearTimeout(timeout)
      reject(new Error('Audio WebSocket handshake failed'))
    }, { once: true })
  })
}

server.listen(3000, '127.0.0.1')
await once(server, 'listening')
try {
  assert.equal(await (await read('/somepath/status')).text(), 'backend healthy')
  assert.equal(await (await read('/somepath/ready')).text(), 'ready')
  assert.equal((await read('/somepath/api/v1/private')).status, 401)
  assert.equal((await read('/api/v1/private')).status, 404)
  assert.equal((await read('/health')).status, 404)
  assert.equal((await read('/_hai/scalar.js')).status, 404)
  assert.match(await (await read('/somepath/runtime-config.js')).text(), /location\.origin\+"\/somepath\/api\/v1"/)

  const docs = await read('/somepath/reference')
  const spec = await (await read('/somepath/schema.json')).text()
  const scalar = await (await read('/somepath/_hai/scalar.js')).text()
  if (production) {
    assert.match(await docs.text(), /frontend fallback/)
    assert.doesNotMatch(spec, /"openapi"/)
    assert.doesNotMatch(scalar, /scalarBackend/)
  }
  else {
    assert.equal(docs.status, 401)
    assert.doesNotMatch(await docs.text(), /frontend fallback/)
    assert.match(spec, /"openapi":"3.1.0"/)
    assert.match(scalar, /scalarBackend/)
  }

  assert.deepEqual(await (await read('/somepath/.well-known/agent-card.json')).json(), { name: 'Orders Assistant' })
  assert.equal((await read('/somepath/partners/orders', { method: 'POST', body: '{}' })).status, 401)
  const stream = await read('/somepath/partners/orders', {
    method: 'POST',
    headers: { 'X-Agent-Key': 'orders-fixture' },
    body: '{}',
  })
  assert.equal(stream.headers.get('Content-Type'), 'text/event-stream')
  const reader = stream.body.getReader()
  assert.equal(await readFrame(reader), firstEvent)
  // 收到首帧后才允许上游结束，否则会暴露代理缓冲。
  complete.resolve()
  assert.equal(await readFrame(reader), finalEvent)
  assert.equal((await reader.read()).done, true)
  assert.equal(await connectAudio(), 'voice-ready')
  process.stdout.write('A2A first frame and audio WebSocket upgrade verified\n')
}
finally {
  complete.resolve()
  for (const socket of sockets)
    socket.destroy()
  await new Promise(resolve => server.close(resolve))
}
