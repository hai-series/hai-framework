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

  it('console: init 后应记录配置并处于已初始化状态', async () => {
    const result = await reach.init({ type: 'console' })
    expect(result.success).toBe(true)
    expect(reach.isInitialized).toBe(true)
    expect(reach.config?.type).toBe('console')
  })

  it('close 后应恢复未初始化状态', async () => {
    await reach.init({ type: 'console' })
    await reach.close()

    expect(reach.isInitialized).toBe(false)
    expect(reach.config).toBeNull()
  })

  it('重复 init 应自动关闭前一次连接', async () => {
    await reach.init({ type: 'console' })
    expect(reach.isInitialized).toBe(true)

    const secondInit = await reach.init({ type: 'console' })
    expect(secondInit.success).toBe(true)
    expect(reach.isInitialized).toBe(true)
  })

  it('无效配置应返回 CONFIG_ERROR', async () => {
    const result = await reach.init({ type: 'invalid' } as never)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.CONFIG_ERROR)
    }
  })

  it('close 多次调用应安全', async () => {
    await reach.init({ type: 'console' })
    await reach.close()
    await reach.close()
    await reach.close()
    expect(reach.isInitialized).toBe(false)
    expect(reach.config).toBeNull()
  })
})
