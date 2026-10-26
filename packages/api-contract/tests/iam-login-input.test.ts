import type { IamLoginInput } from '../src/index.js'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { IamLoginInputSchema } from '../src/index.js'

describe('password login input contract', () => {
  it('接收标识符、密码和可选单用挑战，不接受未实现的会话偏好', () => {
    expect(Object.keys(IamLoginInputSchema.shape)).toEqual(['captcha', 'identifier', 'password'])
    expect(IamLoginInputSchema.parse({ identifier: 'alice', password: 'ExamplePassword123', rememberMe: true }))
      .toEqual({ identifier: 'alice', password: 'ExamplePassword123' })
    expectTypeOf<Extract<'rememberMe', keyof IamLoginInput>>().toEqualTypeOf<never>()
    expect(IamLoginInputSchema.parse({ identifier: 'alice', password: 'ExamplePassword123', captcha: 'opaque-proof' })).toMatchObject({ captcha: 'opaque-proof' })
    expect(IamLoginInputSchema.safeParse({ identifier: 'alice', password: 'ExamplePassword123', captcha: 'x'.repeat(4097) }).success).toBe(false)
  })
})
