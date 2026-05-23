import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHandleFetch } from '../src/kit-auth.js'

let downstreamFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  downstreamFetch = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }))
  vi.stubGlobal('window', {
    location: { origin: 'http://localhost' },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function createEvent() {
  return { url: new URL('http://localhost/admin') }
}

describe('createHandleFetch', () => {
  it('同源请求自动附加 Authorization 头', async () => {
    const handleFetch = createHandleFetch({
      tokenStore: {
        get: () => 'access_token_123',
        set: vi.fn(),
        clear: vi.fn(),
      },
    })

    await handleFetch({
      event: createEvent() as never,
      request: new Request('http://localhost/api/users'),
      fetch: downstreamFetch,
    })

    const forwardedRequest = downstreamFetch.mock.calls[0]![0] as Request
    expect(forwardedRequest.headers.get('Authorization')).toBe('Bearer access_token_123')
  })

  it('跨域请求保持原样透传', async () => {
    const handleFetch = createHandleFetch({
      tokenStore: {
        get: () => 'access_token_456',
        set: vi.fn(),
        clear: vi.fn(),
      },
    })
    const request = new Request('https://api.example.com/users')

    await handleFetch({
      event: createEvent() as never,
      request,
      fetch: downstreamFetch,
    })

    expect(downstreamFetch).toHaveBeenCalledWith(request)
  })

  it('无 token 时同源请求不附加 Authorization 头', async () => {
    const handleFetch = createHandleFetch()

    await handleFetch({
      event: createEvent() as never,
      request: new Request('http://localhost/api/users'),
      fetch: downstreamFetch,
    })

    const forwardedRequest = downstreamFetch.mock.calls[0]![0] as Request
    expect(forwardedRequest.headers.has('Authorization')).toBe(false)
  })
})
