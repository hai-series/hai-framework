import { describe, expect, it } from 'vitest'
import { VecdbConfigSchema } from '../src/index.js'

describe('vecdbConfigSchema', () => {
  it('应支持操作日志配置并填充默认等级和长度', () => {
    const result = VecdbConfigSchema.parse({
      type: 'lancedb',
      path: './data/vecdb',
      operationLog: { write: true },
    })

    expect(result.operationLog?.read).toBe(false)
    expect(result.operationLog?.write).toBe(true)
    expect(result.operationLog?.level).toBe('debug')
    expect(result.operationLog?.maxLength).toBe(1000)
  })

  it('操作日志等级仅支持 info/debug/trace', () => {
    expect(() => VecdbConfigSchema.parse({
      type: 'lancedb',
      path: './data/vecdb',
      operationLog: { read: true, level: 'warn' },
    })).toThrow()
  })
})
