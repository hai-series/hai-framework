/**
 * =============================================================================
 * @h-ai/reach - 未初始化行为测试
 * =============================================================================
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { reach, ReachErrorCode } from '../src/index.js'

describe.sequential('reach (not initialized)', () => {
  beforeEach(async () => {
    await reach.close()
  })

  it('send 操作应返回 NOT_INITIALIZED', async () => {
    const result = await reach.send({
      channel: 'email',
      to: 'test@example.com',
      body: 'test',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.NOT_INITIALIZED)
    }
  })
})
