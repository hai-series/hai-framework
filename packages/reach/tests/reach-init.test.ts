/**
 * =============================================================================
 * @h-ai/reach - 初始化与状态测试
 * =============================================================================
 */

import { afterEach, describe, expect, it } from 'vitest'
import { reach, ReachErrorCode } from '../src/index.js'

describe.sequential('reach.init', () => {
  afterEach(async () => {
    await reach.close()
  })

  it('单个 console provider: init 后应处于已初始化状态', async () => {
    const result = await reach.init({ providers: [{ name: 'dev', type: 'console' }] })
    expect(result.success).toBe(true)
    expect(reach.isInitialized).toBe(true)
    expect(reach.config).not.toBeNull()
  })

  it('多个 provider: init 后应处于已初始化状态', async () => {
    const result = await reach.init({
      providers: [
        { name: 'email', type: 'console' },
        { name: 'sms', type: 'console' },
      ],
    })
    expect(result.success).toBe(true)
    expect(reach.isInitialized).toBe(true)
  })

  it('close 后应恢复未初始化状态', async () => {
    await reach.init({ providers: [{ name: 'dev', type: 'console' }] })
    await reach.close()

    expect(reach.isInitialized).toBe(false)
    expect(reach.config).toBeNull()
  })

  it('重复 init 应自动关闭前一次连接', async () => {
    await reach.init({ providers: [{ name: 'dev', type: 'console' }] })
    expect(reach.isInitialized).toBe(true)

    const secondInit = await reach.init({ providers: [{ name: 'dev2', type: 'console' }] })
    expect(secondInit.success).toBe(true)
    expect(reach.isInitialized).toBe(true)
  })

  it('无效配置应返回 CONFIG_ERROR', async () => {
    const result = await reach.init({ providers: [{ name: 'x', type: 'invalid' }] } as never)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.CONFIG_ERROR)
    }
  })

  it('close 多次调用应安全', async () => {
    await reach.init({ providers: [{ name: 'dev', type: 'console' }] })
    await reach.close()
    await reach.close()
    await reach.close()
    expect(reach.isInitialized).toBe(false)
    expect(reach.config).toBeNull()
  })
})
