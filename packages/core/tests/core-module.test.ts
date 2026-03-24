/**
 * =============================================================================
 * @h-ai/core - 模块初始化工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { core, HaiCommonError } from '../src/index.js'

describe('core.module', () => {
  const ERROR_CODE = 9001
  const ERROR_MESSAGE = 'Module not initialized'

  function createKit() {
    return core.module.createNotInitializedKit<{ code: number, message: string }>(
      ERROR_CODE,
      () => ERROR_MESSAGE,
    )
  }

  it('error 应该返回包含 code 和 message 的错误对象', () => {
    const kit = createKit()
    const error = kit.error()
    expect(error.code).toBe(ERROR_CODE)
    expect(error.message).toBe(ERROR_MESSAGE)
  })

  it('result 应该返回 success=false 的 Result', () => {
    const kit = createKit()
    const result = kit.result<string>()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ERROR_CODE)
      expect(result.error.message).toBe(ERROR_MESSAGE)
    }
  })

  it('proxy 应该拦截所有属性访问并返回异步失败操作', async () => {
    const kit = createKit()
    interface FakeOps {
      doSomething: () => Promise<{ success: boolean, error?: { code: number } }>
      doAnother: () => Promise<{ success: boolean, error?: { code: number } }>
    }
    const ops = kit.proxy<FakeOps>()

    const result1 = await ops.doSomething()
    expect(result1.success).toBe(false)
    if (!result1.success) {
      expect(result1.error?.code).toBe(ERROR_CODE)
    }

    const result2 = await ops.doAnother()
    expect(result2.success).toBe(false)
  })

  it('proxy("sync") 应该拦截所有属性访问并返回同步失败操作', () => {
    const kit = createKit()
    interface FakeSyncOps {
      hash: () => { success: boolean, error?: { code: number } }
      verify: () => { success: boolean, error?: { code: number } }
    }
    const ops = kit.proxy<FakeSyncOps>('sync')

    const result1 = ops.hash()
    expect(result1.success).toBe(false)
    if (!result1.success) {
      expect(result1.error?.code).toBe(ERROR_CODE)
    }

    const result2 = ops.verify()
    expect(result2.success).toBe(false)
  })

  it('messageFn 应该延迟求值（每次调用都执行）', () => {
    let callCount = 0
    const kit = core.module.createNotInitializedKit<{ code: number, message: string }>(
      1,
      () => {
        callCount += 1
        return `call ${callCount}`
      },
    )

    const e1 = kit.error()
    const e2 = kit.error()
    expect(e1.message).toBe('call 1')
    expect(e2.message).toBe('call 2')
    expect(callCount).toBe(2)
  })

  it('应该支持 HaiErrorDef 作为未初始化错误定义', async () => {
    const kit = core.module.createNotInitializedKit(
      HaiCommonError.NOT_INITIALIZED,
      () => 'hai module not initialized',
    )

    const error = kit.error()
    expect(error.code).toBe(HaiCommonError.NOT_INITIALIZED.code)
    expect(error.httpStatus).toBe(HaiCommonError.NOT_INITIALIZED.httpStatus)
    expect(error.system).toBe(HaiCommonError.NOT_INITIALIZED.system)
    expect(error.module).toBe(HaiCommonError.NOT_INITIALIZED.module)
    expect(error.message).toBe('hai module not initialized')

    const result = kit.result<string>()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiCommonError.NOT_INITIALIZED.code)
      expect(result.error.message).toBe('hai module not initialized')
    }

    interface FakeOps {
      doSomething: () => Promise<{ success: boolean, error?: { code: string | number } }>
    }

    const ops = kit.proxy<FakeOps>()
    const proxyResult = await ops.doSomething()
    expect(proxyResult.success).toBe(false)
    if (!proxyResult.success) {
      expect(proxyResult.error?.code).toBe(HaiCommonError.NOT_INITIALIZED.code)
    }
  })
})
