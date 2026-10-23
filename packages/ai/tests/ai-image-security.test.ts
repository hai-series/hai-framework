/** 公共图片 API 的 SSRF 与资源限制；网络行为使用真实 TLS，DNS/路由显式控制。 */
import type { LookupAddress } from 'node:dns'
import type { ServerResponse } from 'node:http'
import type { LookupFunction, Socket } from 'node:net'
import type { ConnectionOptions } from 'node:tls'
import { Buffer } from 'node:buffer'
import { createPublicKey, createSign, generateKeyPairSync } from 'node:crypto'
import dns from 'node:dns'
import https from 'node:https'
import tls from 'node:tls'
import { gzipSync } from 'node:zlib'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ai, HaiAIError } from '../src/index.js'

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const originalLookup = Object.getOwnPropertyDescriptor(dns, 'lookup')!
const originalConnect = Object.getOwnPropertyDescriptor(tls, 'connect')!
const connect = tls.connect
const sockets = new Set<Socket>()
const received: Array<{ path: string, authorization?: string }> = []
const validatedAddresses: string[] = []
let lookupCalls = 0
let addresses: LookupAddress[] = []
let imageUrl: string
let port: number
let streamedBytes = 0
let apiResponse: (() => Response) | undefined
let rebind = false

/** 最小 DER 仅用于每次测试生成临时证书，避免硬编码私钥和 openssl 前置。 */
function der(tag: number, ...parts: Buffer[]): Buffer {
  const bytes = Buffer.concat(parts)
  const length = bytes.length < 128 ? Buffer.from([bytes.length]) : Buffer.from([0x82, bytes.length >> 8, bytes.length & 255])
  return Buffer.concat([Buffer.from([tag]), length, bytes])
}
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
const algorithm = Buffer.from('300d06092a864886f70d01010b0500', 'hex')
const name = der(0x30, der(0x31, der(0x30, Buffer.from('0603550403', 'hex'), der(0x0C, Buffer.from('*.image.test')))))
const tbs = der(0x30, Buffer.from('a003020102020101', 'hex'), algorithm, name, der(0x30, der(0x17, Buffer.from('200101000000Z')), der(0x17, Buffer.from('300101000000Z'))), name, createPublicKey(pair.privateKey).export({ type: 'spki', format: 'der' }))
const signer = createSign('RSA-SHA256')
signer.update(tbs)
const certificate = `-----BEGIN CERTIFICATE-----\n${der(0x30, tbs, algorithm, der(0x03, Buffer.from([0]), signer.sign(pair.privateKey))).toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----`

/** 写入不会自然结束的真实网络响应，连接关闭时停止计时器。 */
function endless(response: ServerResponse, chunk: Uint8Array) {
  const timer = setInterval(() => {
    streamedBytes += chunk.length
    response.write(chunk)
  }, 5)
  response.once('close', () => {
    clearInterval(timer)
  })
}

const server = https.createServer({ key: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), cert: certificate }, (request, response) => {
  received.push({ path: request.url ?? '', authorization: request.headers.authorization })
  if (request.url === '/redirect' || request.url === '/internal' || request.url === '/loop') {
    response.writeHead(302, { location: request.url === '/internal' ? 'https://127.0.0.1/secret' : request.url === '/loop' ? '/loop' : 'https://cdn.image.test/ok' }).end()
    return
  }
  if (request.url === '/error') {
    response.writeHead(503, { 'content-type': 'application/json' })
    endless(response, new Uint8Array(16 * 1024).fill(65))
    return
  }
  if (request.url === '/gzip') {
    response.writeHead(200, { 'content-type': 'image/png', 'content-encoding': 'gzip' })
    response.end(gzipSync(Buffer.concat([png, new Uint8Array(1024 * 1024)])))
    return
  }
  response.writeHead(200, { 'content-type': request.url === '/svg' ? 'image/svg+xml' : 'image/png' })
  if (request.url === '/wrong-magic') {
    response.end('<html>not an image</html>')
    return
  }
  response.write(png)
  if (request.url === '/large')
    endless(response, new Uint8Array(16).fill(65))
  else if (request.url !== '/stall')
    response.end()
})
server.on('connection', (socket) => {
  sockets.add(socket)
  socket.once('close', () => {
    sockets.delete(socket)
  })
})

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing TLS test address')
  port = address.port
})
beforeEach(() => {
  received.length = 0
  validatedAddresses.length = 0
  lookupCalls = 0
  streamedBytes = 0
  imageUrl = 'https://public.image.test/ok'
  addresses = [{ address: '8.8.8.8', family: 4 }]
  apiResponse = undefined
  rebind = false
  Object.defineProperty(dns, 'lookup', { ...originalLookup, value: (_hostname: string, _options: object, callback: (error: Error | null, addresses: LookupAddress[]) => void) => {
    lookupCalls++
    callback(null, addresses)
    if (rebind)
      addresses = [{ address: '127.0.0.1', family: 4 }]
  } })
  // Undici 的实际 TLS connect 只使用 options 形式。先运行生产 lookup 校验，再将已验证地址路由至隔离本地 fixture。
  // 只覆盖路由与测试 CA，不关闭 TLS 证书/主机名验证；不可将此路由方式用于生产。
  Object.defineProperty(tls, 'connect', { ...originalConnect, value: (options: ConnectionOptions) => {
    if (!options.host?.endsWith('.image.test') || !options.lookup)
      throw new Error('Unexpected TLS fixture target')
    const lookup: LookupFunction = (hostname, lookupOptions, callback) => options.lookup!(hostname, lookupOptions, (error, value, family) => {
      if (error)
        return callback(error, value, family)
      validatedAddresses.push(...(Array.isArray(value) ? value.map(item => item.address) : [value]))
      if (lookupOptions.all)
        callback(null, [{ address: '127.0.0.1', family: 4 }])
      else
        callback(null, '127.0.0.1', 4)
    })
    return connect({ ...options, port, ca: certificate, lookup })
  } })
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, options) => {
    if (String(input).startsWith('https://upstream.example/')) {
      return apiResponse?.() ?? new Response(JSON.stringify({ output: { choices: [{ message: { content: [{ image: imageUrl }] } }] } }), { headers: { 'content-type': 'application/json' } })
    }
    throw new Error(`Unexpected upstream request method: ${options?.method}`)
  }))
})
afterEach(async () => {
  try {
    await ai.close()
    await expect.poll(() => sockets.size).toBe(0)
  }
  finally {
    for (const socket of sockets)
      socket.destroy()
    Object.defineProperty(dns, 'lookup', originalLookup)
    Object.defineProperty(tls, 'connect', originalConnect)
    vi.unstubAllGlobals()
  }
})
afterAll(async () => {
  for (const socket of sockets)
    socket.destroy()
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
})

/** 通过公共生命周期传入资源限制，厂商响应和真实下载链路在此连接。 */
async function generate(options: { maxImageBytes?: number, maxImages?: number, timeout?: number, signal?: AbortSignal } = {}) {
  expect((await ai.init({
    image: { maxImageBytes: options.maxImageBytes, maxImages: options.maxImages, generateModel: 'qwen', models: [{ id: 'qwen', provider: 'qwen', model: 'qwen-image', apiKey: 'test-key', baseUrl: 'https://upstream.example', timeout: options.timeout ?? 1000 }] },
  })).success).toBe(true)
  return ai.image.generate({ prompt: 'test', signal: options.signal })
}

describe('ai.image download security', () => {
  it.each([
    'http://8.8.8.8/image',
    'file:///etc/passwd',
    'https://user:secret@8.8.8.8/a',
    'https://8.8.8.8:8443/a',
    'https://127.0.0.1/a',
    'https://2130706433/a',
    'https://0x7f000001/a',
    'https://169.254.169.254/a',
    'https://10.0.0.1/a',
    'https://172.16.0.1/a',
    'https://192.168.1.1/a',
    'https://100.100.100.200/a',
    'https://[::1]/a',
    'https://[::ffff:127.0.0.1]/a',
    'https://[fc00::1]/a',
    'https://[fe80::1]/a',
    'https://[2002:7f00:1::]/a',
    'https://[64:ff9b::7f00:1]/a',
    'https://[3ffe::1]/a',
    'https://[ff02::1]/a',
    'https://0/a',
    'https://198.18.0.1/a',
    'https://224.0.0.1/a',
  ])('拒绝不可信地址 %s，不连接目标', async (url) => {
    imageUrl = url
    expect(await generate()).toMatchObject({ success: false, error: { code: HaiAIError.IMAGE_DOWNLOAD_BLOCKED.code } })
    expect(received).toHaveLength(0)
    expect(lookupCalls).toBe(0)
  })

  it.each(['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fe80::1', '2001:db8::1'])('解析后地址 %s 或混合记录不允许建连', async (address) => {
    addresses.push({ address, family: address.includes(':') ? 6 : 4 })
    expect(await generate()).toMatchObject({ success: false, error: { code: HaiAIError.IMAGE_DOWNLOAD_BLOCKED.code } })
    expect(lookupCalls).toBe(1)
    expect(received).toHaveLength(0)
  })

  it('合法临时 URL 经受控真实 TLS 下载，固定已校验 DNS，不转发认证头', async () => {
    rebind = true
    const result = await generate()
    expect(result.success, result.success ? undefined : String(result.error.cause instanceof Error ? result.error.cause.cause : result.error.cause)).toBe(true)
    expect(result).toMatchObject({ success: true, data: { images: [{ data: png, mimeType: 'image/png' }] } })
    expect(lookupCalls).toBe(1)
    expect(validatedAddresses).toEqual(['8.8.8.8'])
    expect(received).toEqual([{ path: '/ok', authorization: undefined }])
  })

  it('合法公网 IPv6 DNS 候选可用，未把全体 IPv6 一律拒绝', async () => {
    addresses = [{ address: '2001:4860:4860::8888', family: 6 }]
    expect((await generate()).success).toBe(true)
    expect(validatedAddresses).toEqual(['2001:4860:4860::8888'])
  })

  it('重定向的新域名解析到私网时拒绝，不把前一跳的校验结果当作新目标许可', async () => {
    rebind = true
    imageUrl = 'https://public.image.test/redirect'
    expect(await generate()).toMatchObject({ success: false, error: { code: HaiAIError.IMAGE_DOWNLOAD_BLOCKED.code } })
    expect(lookupCalls).toBe(2)
    expect(received.map(item => item.path)).toEqual(['/redirect'])
  })

  it('每跳校验并允许公开重定向，内部重定向不产生第二次请求', async () => {
    imageUrl = 'https://public.image.test/redirect'
    expect((await generate()).success).toBe(true)
    expect(received.map(item => item.path)).toEqual(['/redirect', '/ok'])
    await ai.close()
    received.length = 0
    imageUrl = 'https://public.image.test/internal'
    expect(await generate()).toMatchObject({ success: false, error: { code: HaiAIError.IMAGE_DOWNLOAD_BLOCKED.code } })
    expect(received.map(item => item.path)).toEqual(['/internal'])
  })

  it('重定向次数有界，超限停止并释放连接', async () => {
    imageUrl = 'https://public.image.test/loop'
    expect(await generate()).toMatchObject({ success: false, error: { code: HaiAIError.IMAGE_PROTOCOL_ERROR.code } })
    expect(received).toHaveLength(4)
  })

  it('chunked 响应越限提前中止，未完整读入无限流并释放真实连接', async () => {
    imageUrl = 'https://public.image.test/large'
    expect(await generate({ maxImageBytes: 16 })).toMatchObject({ success: false, error: { code: HaiAIError.IMAGE_TOO_LARGE.code } })
    await expect.poll(() => sockets.size).toBe(0)
    expect(streamedBytes).toBeLessThan(1024)
  })

  it('压缩响应按实际解压后字节计数，不以很小的压缩包大小绕过限制', async () => {
    imageUrl = 'https://public.image.test/gzip'
    expect(await generate({ maxImageBytes: 4096 })).toMatchObject({ success: false, error: { code: HaiAIError.IMAGE_TOO_LARGE.code } })
  })

  it('总 deadline 覆盖流读取停滞，调用方取消单独返回取消错误', async () => {
    imageUrl = 'https://public.image.test/stall'
    expect(await generate({ timeout: 150 })).toMatchObject({ success: false, error: { code: HaiAIError.IMAGE_TIMEOUT.code } })
    await ai.close()
    const controller = new AbortController()
    const pending = generate({ signal: controller.signal })
    await expect.poll(() => received.length).toBe(2)
    controller.abort('caller cancelled')
    expect(await pending).toMatchObject({ success: false, error: { code: HaiAIError.IMAGE_CANCELLED.code } })
  })

  it.each(['/wrong-magic', '/svg'])('拒绝 MIME/魔数不符或主动内容 %s', async (pathname) => {
    imageUrl = `https://public.image.test${pathname}`
    expect(await generate()).toMatchObject({ success: false, error: { code: HaiAIError.IMAGE_PROTOCOL_ERROR.code } })
  })

  it('错误正文同样有界，保留 HTTP 错误且释放连接', async () => {
    imageUrl = 'https://public.image.test/error'
    expect(await generate()).toMatchObject({ success: false, error: { code: HaiAIError.IMAGE_UPSTREAM_ERROR.code } })
    expect(streamedBytes).toBeLessThan(256 * 1024)
  })

  it('厂商 JSON 正文超限取消 reader，不启动任何下载', async () => {
    const cancelled = vi.fn()
    apiResponse = () => new Response(new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(16 * 1024).fill(65))
      },
      cancel: cancelled,
    }), { headers: { 'content-type': 'application/json' } })
    expect(await generate({ maxImageBytes: 16 })).toMatchObject({ success: false, error: { code: HaiAIError.IMAGE_TOO_LARGE.code } })
    expect(cancelled).toHaveBeenCalledOnce()
    expect(received).toHaveLength(0)
  })

  it('超出图片数量限制的 URL 数组在下载前失败', async () => {
    apiResponse = () => new Response(JSON.stringify({ output: { choices: [{ message: { content: [{ image: imageUrl }, { image: imageUrl }] } }] } }), { headers: { 'content-type': 'application/json' } })
    expect(await generate({ maxImages: 1 })).toMatchObject({ success: false, error: { code: HaiAIError.IMAGE_TOO_LARGE.code } })
    expect(received).toHaveLength(0)
  })
})
