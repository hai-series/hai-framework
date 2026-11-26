import { expect, it } from 'vitest'
import { core, HttpCorsConfigSchema } from '../src/index.js'

it('默认关闭 CORS，并拒绝携带凭据的通配来源', () => {
  expect(HttpCorsConfigSchema.parse(undefined)).toBe(false)
  expect(HttpCorsConfigSchema.safeParse({ origin: '*', credentials: true }).success).toBe(false)
  expect(HttpCorsConfigSchema.safeParse({
    origin: ['https://portal.example.com', '*'],
  }).success).toBe(false)
  expect(() => core.access.createCors({ credentials: true })).toThrow(TypeError)
  expect(() => core.access.createCors({ origin: '*.example.com' })).toThrow(TypeError)
})

it('完整配置来源与浏览器规范化后的默认端口同源', () => {
  const check = core.access.createCors({ origin: 'https://Portal.Example.Com:443', credentials: true })
  const result = check(new Request('https://orders.example.com', {
    headers: { Origin: 'https://portal.example.com' },
  }))
  expect(result?.headers.get('access-control-allow-origin')).toBe('https://portal.example.com')
  expect(HttpCorsConfigSchema.safeParse({ origin: 'https:portal.example.com' }).success).toBe(false)
  expect(HttpCorsConfigSchema.safeParse({ origin: 'https://portal.example.com/secret' }).success).toBe(false)
})

it('只把真实预检短路，并按完整路径段限制来源策略', () => {
  const check = core.access.createCors({
    origin: 'https://portal.example.com',
    paths: ['/external'],
    credentials: true,
    exposedHeaders: ['Retry-After'],
  })
  const url = 'https://orders.example.com/external/reports'
  const plainOptions = check(new Request(url, { method: 'OPTIONS' }))
  expect(plainOptions?.preflight).toBe(false)
  expect(plainOptions?.headers.get('vary')).toBe('Origin, Access-Control-Request-Method')
  expect(plainOptions?.headers.get('access-control-allow-origin')).toBeNull()
  expect(check(new Request('https://orders.example.com/external-internal/reports'))).toBeUndefined()

  const preflight = check(new Request(url, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://portal.example.com',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Authorization, X-Trace-Id',
    },
  }))
  expect(preflight?.preflight).toBe(true)
  expect(preflight?.headers.get('access-control-allow-origin')).toBe('https://portal.example.com')
  expect(preflight?.headers.get('access-control-allow-credentials')).toBe('true')
  expect(preflight?.headers.get('access-control-expose-headers')).toBe('X-Request-Id, X-Trace-Id, Retry-After')
  expect(preflight?.headers.get('access-control-allow-headers')).toBe('Authorization, X-Trace-Id')
  expect(preflight?.headers.get('vary')).toBe('Origin, Access-Control-Request-Method, Access-Control-Request-Headers')
})

it('保留禁止响应的状态及正文，合并 Vary，并移除未经允许的跨域响应头', async () => {
  const url = 'https://orders.example.com/external/reports'
  const check = core.access.createCors({
    origin: 'https://portal.example.com',
    allowedHeaders: ['Authorization'],
  })
  const request = new Request(url, {
    headers: { Origin: 'capacitor://localhost' },
  })
  const decision = check(request)
  if (!decision)
    throw new Error('Expected a CORS decision')
  const response = core.access.applyCorsHeaders(new Response('Forbidden', {
    status: 403,
    headers: { 'Vary': 'Accept, origin', 'Access-Control-Allow-Origin': '*' },
  }), decision.headers)
  expect(response.status).toBe(403)
  expect(await response.text()).toBe('Forbidden')
  expect(response.headers.get('vary')).toBe('Accept, Origin')
  expect(response.headers.get('access-control-allow-origin')).toBeNull()

  const explicitNative = core.access.createCors({
    origin: 'https://portal.example.com',
    nativeOrigins: 'capacitor://localhost',
  })(request)
  expect(explicitNative?.headers.get('access-control-allow-origin')).toBe('capacitor://localhost')
})

it('代理只读响应加上 CORS 后仍流式传递原始正文', async () => {
  const source = await fetch('data:text/plain,ready')
  const result = core.access.applyCorsHeaders(source, new Headers({ Vary: 'Origin' }))
  expect(result.headers.get('vary')).toBe('Origin')
  expect(result.headers.get('content-type')).toBe('text/plain')
  expect(await result.text()).toBe('ready')
})
