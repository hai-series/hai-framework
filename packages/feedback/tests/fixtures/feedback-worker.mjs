// 独立 Node 进程只读取本轮测试配置；所有结果经 IPC 返回，不打印连接凭据。
import process from 'node:process'

let feedback
let reach
let storage
let reldb
let stage = 'configuration'

async function close() {
  await feedback?.close()
  await reach?.close()
  await storage?.close()
  await reldb?.close()
}

function requireSuccess(result) {
  if (!result.success)
    throw new Error(String(result.error.code), { cause: result.error })
}

function errorCodes(error) {
  const codes = []
  let current = error
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    const code = current.code
    if (typeof code === 'string' && /^(?:hai:[\w-]+:\d{3}|ER_[A-Z_]+)$/.test(code))
      codes.push(code)
    current = current.cause
  }
  return [...new Set(codes)]
}

async function main() {
  try {
    const configuration = JSON.parse(process.env.HAI_FEEDBACK_PROCESS_FIXTURE ?? '{}')
    stage = 'load-modules'
    const { core } = await import('@h-ai/core')
    core.logger.configure({ level: 'fatal', format: 'json' })
    ;({ feedback } = await import('@h-ai/feedback'))
    ;({ reach } = await import('@h-ai/reach'))
    ;({ storage } = await import('@h-ai/storage'))
    ;({ reldb } = await import('@h-ai/reldb'))
    stage = 'reldb-init'
    requireSuccess(await reldb.init(configuration.database))
    stage = 'storage-init'
    requireSuccess(await storage.init(configuration.storage))
    stage = 'reach-init'
    requireSuccess(await reach.init(configuration.reach))
    stage = 'feedback-init'
    requireSuccess(await feedback.init(configuration.feedback))
    stage = 'barrier'
    const start = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker start timed out')), 30000)
      process.once('message', (message) => {
        clearTimeout(timer)
        if (message?.action === 'run')
          resolve()
        else reject(new Error('Invalid worker instruction'))
      })
    })
    process.send?.({ phase: 'ready', pid: process.pid })
    await start
    stage = 'run-jobs'
    const result = await feedback.runJobs()
    requireSuccess(result)
    process.send?.({ phase: 'finished', pid: process.pid, processed: result.data.processed })
  }
  catch (error) {
  // 初始化错误与操作错误仅发送稳定代码，不复制 SDK 异常或配置。
    const code = error instanceof Error && /^hai:[\w-]+:\d{3}$/.test(error.message) ? error.message : 'fixture:worker-failed'
    process.send?.({ phase: 'failed', stage, code, causes: errorCodes(error) })
    process.exitCode = 1
  }
  finally {
    try {
      await close()
    }
    catch {
      process.exitCode = 1
    }
    if (process.connected)
      process.disconnect()
  }
}

void main()
