import type { IamLoginInput } from '../src/index.js'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { IamLoginInputSchema } from '../src/index.js'

describe('password login input contract', () => {
  it('接收鉴别字段、可选原主体和单用挑战，不接受未实现的会话偏好', () => {
    expect(Object.keys(IamLoginInputSchema.shape).sort()).toEqual(['captcha', 'expectedUserId', 'identifier', 'password'])
    expect(IamLoginInputSchema.parse({ identifier: 'alice', password: 'ExamplePassword123', rememberMe: true }))
      .toEqual({ identifier: 'alice', password: 'ExamplePassword123' })
    expectTypeOf<Extract<'rememberMe', keyof IamLoginInput>>().toEqualTypeOf<never>()
    expect(IamLoginInputSchema.parse({ identifier: 'alice', password: 'ExamplePassword123', captcha: 'opaque-proof' })).toMatchObject({ captcha: 'opaque-proof' })
    expect(IamLoginInputSchema.safeParse({ identifier: 'alice', password: 'ExamplePassword123', captcha: 'x'.repeat(4097) }).success).toBe(false)
  })

  it('保留原主体限定，拒绝空值及过长的主体标识', () => {
    const credentials = { identifier: 'alice', password: 'ExamplePassword123' }
    expect(IamLoginInputSchema.parse({ ...credentials, expectedUserId: 'original-user' }))
      .toEqual({ ...credentials, expectedUserId: 'original-user' })
    expect(IamLoginInputSchema.safeParse({ ...credentials, expectedUserId: '' }).success).toBe(false)
    expect(IamLoginInputSchema.safeParse({ ...credentials, expectedUserId: 'x'.repeat(201) }).success).toBe(false)
    expectTypeOf<NonNullable<IamLoginInput['expectedUserId']>>().toEqualTypeOf<string>()
  })
})
