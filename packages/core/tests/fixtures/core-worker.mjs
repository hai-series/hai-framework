import { parentPort, threadId, workerData } from 'node:worker_threads'

let order = 0
parentPort.on('message', ({ value, crash }) => {
  if (crash)
    throw new Error('Fixture thread stopped')
  parentPort.postMessage({
    value,
    order: ++order,
    threadId,
    label: workerData?.label,
  })
})
