import { setImmediate } from 'node:timers/promises'
import { core } from '@h-ai/core'
import { crypto, HaiCryptoError } from '@h-ai/crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'

beforeEach(async () => {
  expect((await crypto.init()).success).toBe(true)
})

afterEach(async () => {
  await crypto.close()
})

it('reads existing hashes and writes hashes understood by the synchronous API', async () => {
  const password = 'password-测试-😀'
  const stored = crypto.password.hash(password)
  if (!stored.success)
    throw new Error(stored.error.message)
  expect(await crypto.password.verifyAsync(password, stored.data)).toEqual({ success: true, data: true })
  expect(await crypto.password.verifyAsync('different', stored.data)).toEqual({ success: true, data: false })
  const generated = await crypto.password.hashAsync(password, { iterations: 123, saltLength: 8 })
  if (!generated.success)
    throw new Error(generated.error.message)
  expect(generated.data).toMatch(/^\$hai\$123\$[A-Za-z0-9]{8}\$[a-f\d]{64}$/)
  expect(crypto.password.verify(password, generated.data)).toEqual({ success: true, data: true })
  expect(await core.i18n.runWithLocale('en-US', () => crypto.password.hashAsync(''))).toMatchObject({
    success: false,
    error: { code: HaiCryptoError.INVALID_INPUT.code, message: 'Password cannot be empty' },
  })
})

it('yields the main event loop, rejects overload and settles queued work on close', async () => {
  const operations = crypto.password
  let completed = false
  const first = operations.hashAsync('example', { iterations: 250_000 }).then((result) => {
    completed = true
    return result
  })
  await setImmediate()
  expect(completed).toBe(false)

  const queued = Array.from({ length: 40 }, () => operations.hashAsync('example', { iterations: 250_000 }))
  await Promise.all([
    crypto.close(),
    crypto.close(),
  ])
  const results = await Promise.all([first, ...queued])
  expect(results.every(result => !result.success)).toBe(true)
  expect(results).toEqual(expect.arrayContaining([
    expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: HaiCryptoError.PASSWORD_BUSY.code }),
    }),
    expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: HaiCryptoError.NOT_INITIALIZED.code }),
    }),
  ]))
  expect(await operations.hashAsync('example')).toMatchObject({
    success: false,
    error: { code: HaiCryptoError.NOT_INITIALIZED.code },
  })
  expect(await crypto.password.hashAsync('example')).toMatchObject({
    success: false,
    error: { code: HaiCryptoError.NOT_INITIALIZED.code },
  })
  expect((await crypto.init()).success).toBe(true)
  expect((await crypto.password.hashAsync('example', { iterations: 1 })).success).toBe(true)
})
