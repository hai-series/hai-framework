import type { HaiResult } from '@h-ai/core'
import type { RunnerConfig, RunnerConfigInput } from './runner-config.js'
import type { RunnerStore } from './runner-store.js'
import type { RunnerFunctions, RunnerOwner } from './runner-types.js'
import { randomUUID } from 'node:crypto'
import { core } from '@h-ai/core'
import { RunnerConfigSchema } from './runner-config.js'
import { createRunnerExecution, invalidRunnerInput } from './runner-execution.js'
import { runnerM } from './runner-i18n.js'
import { readRunnerProcess } from './runner-process.js'
import { makeStore, readyStore } from './runner-store.js'
import { HaiRunnerError } from './runner-types.js'

/**
 * 创建独立 runner，可在同一进程分别承接不同节点角色或用于隔离测试。
 * @example
 * ```ts
 * import { reldb } from '@h-ai/reldb'
 * import { runner as frameworkRunner } from '@h-ai/runner'
 * const database = await reldb.init({ type: 'sqlite', database: ':memory:' })
 * if (!database.success) throw new Error(database.error.message)
 * const runner = frameworkRunner.create()
 * const initialized = await runner.init({ nodeId: 'tools' })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * await runner.close()
 * await reldb.close()
 * ```
 */
export function createRunner(): RunnerFunctions {
  let config: RunnerConfig | undefined
  let store: RunnerStore | undefined
  let owner: RunnerOwner | undefined
  let initializing = false
  let closing: Promise<HaiResult<void>> | undefined
  let closingRequested = false
  const execution = createRunnerExecution({
    get config() { return config },
    get store() { return store },
    get owner() { return owner },
    get closingRequested() { return closingRequested },
  })

  async function init(input: RunnerConfigInput): Promise<HaiResult<void>> {
    if (initializing || config || closing)
      return core.err(HaiRunnerError.ALREADY_INITIALIZED, runnerM('runner_alreadyInitialized'))
    const parsed = RunnerConfigSchema.safeParse(input)
    if (!parsed.success)
      return invalidRunnerInput()
    initializing = true
    try {
      const ready = await readyStore()
      if (!ready.success)
        return ready
      owner = {
        nodeId: parsed.data.nodeId,
        generation: randomUUID(),
      }
      config = parsed.data
      store = makeStore(config, owner, config.executor
        ? await readRunnerProcess()
        : undefined)
      execution.start(config)
      return core.ok(undefined)
    }
    finally {
      initializing = false
    }
  }

  function close(): Promise<HaiResult<void>> {
    if (closing)
      return closing
    if (initializing)
      return Promise.resolve(core.err(HaiRunnerError.ALREADY_INITIALIZED, runnerM('runner_alreadyInitialized')))
    if (!config)
      return Promise.resolve(core.ok(undefined))
    closingRequested = true
    closing = execution.close(() => {
      config = undefined
      owner = undefined
      store = undefined
      closingRequested = false
    }).finally(() => { closing = undefined })
    return closing
  }

  return {
    init,
    close,
    get isExecutor() {
      return config?.executor === true && !closingRequested
    },
    ...execution.operations,
  }
}

/**
 * 共享执行入口；应用负责初始化数据库、启动并在关闭前等待结果。
 * @example
 * ```ts
 * import { runner } from '@h-ai/runner'
 * const status = await runner.get({ tenantId: 'team', userId: 'alice' }, '0'.repeat(64))
 * if (!status.success) throw new Error(status.error.message)
 * ```
 */
export const runner: RunnerFunctions & { create: typeof createRunner } = Object.assign(createRunner(), { create: createRunner })
