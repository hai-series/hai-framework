import type { IamLoginInput } from '../src/index.js'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { IamLoginInputSchema } from '../src/index.js'

describe('password login input contract', () => {
  it('仅公开标识符和密码，不接受未实现的会话偏好', () => {
    expect(Object.keys(IamLoginInputSchema.shape)).toEqual(['identifier', 'password'])
    expect(IamLoginInputSchema.parse({ identifier: 'alice', password: 'ExamplePassword123', rememberMe: true }))
      .toEqual({ identifier: 'alice', password: 'ExamplePassword123' })
    expectTypeOf<Extract<'rememberMe', keyof IamLoginInput>>().toEqualTypeOf<never>()
  })
})
