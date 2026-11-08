/** JS 任务只在独立线程执行；主线程负责期限和终止。此线程不是安全沙箱。 */
import { Script } from 'node:vm'
import { parentPort, workerData } from 'node:worker_threads'

// 保持线程存活，使永不完成的 Promise 也由主线程统一超时终止。
parentPort.on('message', () => {})

async function run() {
  try {
    const candidate = new Script(`(${workerData.code})`).runInNewContext({})
    if (typeof candidate !== 'function')
      throw new TypeError('JS task code must evaluate to a function')
    const result = await candidate(workerData.context)
    parentPort.postMessage({ success: true, data: result })
  }
  catch (error) {
    parentPort.postMessage({
      success: false,
      message: error instanceof Error
        ? error.message
        : String(error),
    })
  }
}

void run()
