import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '../src/routes/api/image/+server.js'

const mocks = vi.hoisted(() => ({
  generateImage: vi.fn(),
}))
vi.mock('../src/lib/server/ai-lab.js', () => ({ generateImage: mocks.generateImage }))

function event(files: File[]): Parameters<typeof POST>[0] {
  const form = new FormData()
  form.set('prompt', 'Fixture image')
  form.set('width', '512')
  form.set('height', '512')
  for (const file of files)
    form.append('referenceImages', file)
  const url = new URL('http://localhost/api/image')
  return {
    url,
    request: new Request(url, { method: 'POST', body: form }),
    locals: { locale: 'en-US' },
  } as Parameters<typeof POST>[0]
}

describe('image upload bounds', () => {
  beforeEach(() => {
    mocks.generateImage.mockReset().mockResolvedValue({
      success: true,
      data: { images: [] },
    })
  })

  it('rejects too many small reference images before calling the provider', async () => {
    const files = Array.from({ length: 5 }, () => new File(['png'], 'fixture.png', { type: 'image/png' }))
    expect((await POST(event(files))).status).toBe(400)
    expect(mocks.generateImage).not.toHaveBeenCalled()
  })

  it('reports an empty provider result without exposing provider diagnostics', async () => {
    const response = await POST(event([]))
    expect(response.status).toBe(500)
    expect(response.headers.get('X-Trace-Id')).toBeTruthy()
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'hai:common:500' },
    })
  })
})
