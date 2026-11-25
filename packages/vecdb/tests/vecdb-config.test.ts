import { describe, expect, it } from 'vitest'
import { VecdbConfigSchema } from '../src/index.js'

describe('vecdbConfigSchema', () => {
  it.each([
    'ftp://localhost:8000',
    'http://user:secret@localhost:8000',
    'http://localhost:8000/proxy',
    'http://localhost:8000?token=secret',
    'http://localhost:8000#secret',
    'not-a-url',
  ])('chroma 拒绝 SDK 无法完整表达的端点 %s', (url) => {
    expect(VecdbConfigSchema.safeParse({ type: 'chroma', url }).success).toBe(false)
  })

  it.each(['secret\r\nX-Injected: yes', 'white space', '令牌'])('chroma 拒绝非法 HTTP 凭据字符', (apiKey) => {
    expect(VecdbConfigSchema.safeParse({ type: 'chroma', url: 'http://localhost:8000', apiKey }).success).toBe(false)
  })

  it.each(['http://localhost', 'https://chroma.example.test/', 'http://[::1]:8000'])('chroma 接受 HTTP(S) 根端点 %s', (url) => {
    expect(VecdbConfigSchema.safeParse({ type: 'chroma', url, apiKey: '' }).success).toBe(true)
  })

  it('应支持操作日志配置并填充默认开关和长度', () => {
    const result = VecdbConfigSchema.parse({
      type: 'lancedb',
      path: './data/vecdb',
      operationLog: { write: true },
    })

    expect(result.operationLog?.read).toBe(false)
    expect(result.operationLog?.write).toBe(true)
    expect(result.operationLog?.maxLength).toBe(1000)
  })

  it.each(['info', 'trace', 'warn'])('兼容旧操作日志等级 %s 并从解析结果移除', (level) => {
    const result = VecdbConfigSchema.parse({
      type: 'lancedb',
      path: './data/vecdb',
      operationLog: { read: true, level },
    })
    expect(result.operationLog).toEqual({ read: true, write: false, maxLength: 1000 })
  })
})
