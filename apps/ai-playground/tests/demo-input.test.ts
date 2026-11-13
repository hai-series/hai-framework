import { describe, expect, it } from 'vitest'
import { DemoInputSchema } from '../src/lib/demo-input.js'
import { issueBrowserScope, scopeProfile } from '../src/lib/server/browser-scope.js'
import { readDemoJson } from '../src/lib/server/demo-json.js'

describe('aI Playground demo request boundaries', () => {
  it('accepts bounded input for a known operation and rejects arbitrary execution options', () => {
    expect(DemoInputSchema.safeParse({ id: 'token', input: '  hello  ' })).toMatchObject({
      success: true,
      data: { id: 'token', input: 'hello' },
    })
    expect(DemoInputSchema.safeParse({ id: 'custom', input: 'hello' }).success).toBe(false)
    expect(DemoInputSchema.safeParse({
      id: 'token',
      input: 'x'.repeat(4001),
    }).success).toBe(false)
    expect(DemoInputSchema.safeParse({ id: 'acp', input: 'hello', endpoint: 'https://example.invalid' }).success).toBe(false)
  })

  it('derives stable, isolated browser owners even when callers choose the same profile label', () => {
    const first = issueBrowserScope()
    const second = issueBrowserScope()
    expect(scopeProfile(first, 'default')).toMatch(/^[a-f0-9]{64}$/)
    expect(scopeProfile(first, 'default')).toBe(scopeProfile(first, 'default'))
    expect(scopeProfile(first, 'default')).not.toBe(scopeProfile(second, 'default'))
    expect(scopeProfile(first, 'default')).not.toBe(scopeProfile(first, 'secondary'))
  })

  it('limits the actual byte stream even when Content-Length is unavailable', async () => {
    const valid = new Request('http://localhost/api/demos', {
      method: 'POST',
      body: JSON.stringify({ id: 'token', input: '你好' }),
    })
    await expect(readDemoJson(valid)).resolves.toEqual({ id: 'token', input: '你好' })
    const oversized = new Request('http://localhost/api/demos', {
      method: 'POST',
      body: JSON.stringify({
        id: 'token',
        input: '超'.repeat(6000),
      }),
    })
    expect(oversized.headers.get('Content-Length')).toBeNull()
    await expect(readDemoJson(oversized)).resolves.toBeUndefined()
  })
})
