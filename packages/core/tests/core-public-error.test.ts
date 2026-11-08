import { describe, expect, it } from 'vitest'
import { core } from '../src/index.js'

describe('public errors and diagnostics', () => {
  it.each([
    undefined,
    0,
    200,
    399,
    400.5,
    600,
    Number.NaN,
  ])('缺失或非法状态 %s 不公开内部消息', (httpStatus) => {
    const safe = core.error.toPublic({
      code: 'unclassified',
      message: 'SELECT private_value',
      httpStatus,
      cause: new Error('private backend'),
    }, 'unknown-status')
    expect(safe.httpStatus).toBe(500)
    expect(safe.traceId).toBe('unknown-status')
    expect(safe.cause).toBeUndefined()
    expect(JSON.stringify(safe)).not.toContain('private')
    expect(JSON.stringify(safe)).not.toContain('SELECT')
  })

  it.each([400, 401, 403, 404, 409, 422, 429])('明确业务状态 %s 保留安全本地化提示', (httpStatus) => {
    expect(core.error.toPublic({ code: 'business', message: '请检查输入', httpStatus }, 'business-error')).toMatchObject({ httpStatus, message: '请检查输入 (traceId: business-error)' })
  })
  it('内部细节只留日志，公共提示本地化且包含相同 traceId', () => {
    core.i18n.setGlobalLocale('zh-CN')
    const cause = Object.assign(new Error('Duplicate verificationCode=654321'), { code: '23505', password: 'private-password' })
    const records: unknown[] = []
    const stop = core.logger.observe((record) => {
      records.push(record)
    })
    try {
      core.context.run({ requestId: 'request-detail' }, () => {
        core.logger.error('Database operation failed', { error: cause })
        const safe = core.error.toPublic({
          code: 'db:failed',
          message: cause.message,
          httpStatus: 500,
          cause,
          ext: { query: 'internal' },
        })
        expect(safe).toMatchObject({ message: '内部错误 (traceId: request-detail)', traceId: 'request-detail' })
        expect(safe).not.toHaveProperty('cause')
        expect(safe).not.toHaveProperty('ext')
        expect(core.error.formatMessage(safe)).toBe(safe.message)
      })
    }
    finally { stop() }
    const output = JSON.stringify(records)
    expect(output).toContain('23505')
    expect(output).toContain('Duplicate')
    expect(output).toContain('request-detail')
    expect(output).not.toContain('654321')
    expect(output).not.toContain('private-password')
    expect(cause.message).toContain('654321')
  })

  it('只保留安全字段校验，不能把原值和内部扩展传给用户', () => {
    const error = core.error.toPublic({
      code: 'input',
      message: 'Invalid input',
      httpStatus: 422,
      cause: [
        { field: 'email', message: 'Required', value: 'private' },
      ],
      ext: { password: 'private' },
    }, 'req-input')
    expect(error.cause).toEqual([
      { field: 'email', message: 'Required' },
    ])
    expect(JSON.stringify(error)).not.toContain('private')
  })
})
