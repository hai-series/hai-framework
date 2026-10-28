/** 应用声明真实模块顺序；并发、失败回滚与关闭重试由 core 处理。 */
import { core } from '@h-ai/core'

const runtime = core.module.createRuntime([
  { name: 'configuration', start: () => { core.init({ configDir: './config' }) }, close: () => {} },
  { name: 'bootstrap', start: () => { core.logger.info('Application initialized') }, close: () => {} },
])

/** 启动失败只报告模块、错误码和配置路径，私密值不进入错误上下文。 */
export async function initApp(): Promise<void> {
  const result = await runtime.start()
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
}

/** 清理失败时保留依赖和清理义务，可再次调用。 */
export async function closeApp(): Promise<void> {
  const result = await runtime.close()
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
}
