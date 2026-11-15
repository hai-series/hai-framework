import { on } from 'node:events'
import process from 'node:process'
import { reldb } from '@h-ai/reldb'
import { createRunner } from '@h-ai/runner'

async function main() {
  const { database, nodeId } = JSON.parse(process.env.HAI_TEST_RUNNER_SCHEMA)
  const node = createRunner()
  const connected = await reldb.init(database)
  if (!connected.success)
    throw new Error(connected.error.message)
  try {
    const messages = on(process, 'message', {
      close: ['disconnect'],
    })
    process.send({ ready: true })
    for await (const [message] of messages) {
      if (message === 'close')
        break
      const result = await node.init({ nodeId, executor: false })
      process.send({ success: result.success })
    }
  }
  finally {
    await node.close()
    await reldb.close()
    if (process.connected)
      process.disconnect()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
  if (process.connected)
    process.disconnect()
})
