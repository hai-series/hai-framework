import { describe, expect, it } from 'vitest'

import { arePasswordsEqual, normalizePassword } from '../src/lib/components/scenes/iam/password-utils.js'

describe('password-utils', () => {
  it('normalizes compatible characters', () => {
    const fullWidth = 'ＡＢＣ１２３'
    const normalized = normalizePassword(fullWidth)

    expect(normalized).toBe('ABC123')
  })

  it('compares passwords after normalization', () => {
    const left = 'Ｐａｓｓｗｏｒｄ１２３'
    const right = 'Password123'

    expect(arePasswordsEqual(left, right)).toBe(true)
  })
})
