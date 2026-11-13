import process from 'node:process'
import { reldb } from '@h-ai/reldb'
import { createRunner } from '@h-ai/runner'

function value(result) {
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

async function main() {
  const node = createRunner()
  const { database, nodeId } = JSON.parse(process.env.HAI_TEST_RUNNER_OWNER)
  value(await reldb.init(database))
  value(await node.init({ nodeId, maxControlRunning: 1 }))
  value(node.register('owner.v1', async (_input, context) => {
    value(await context.emit({ entered: true }))
    // 父子任务等待测试停止本进程。失租本身不能证明回调退出。
    await new Promise(() => {})
  }))
  process.send({ ready: true })
  process.on('message', () => {})
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
