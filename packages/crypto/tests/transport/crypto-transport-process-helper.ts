import type { CacheConfigInput } from '@h-ai/cache'
import type { ChildProcess } from 'node:child_process'
import { GenericContainer, Wait } from 'testcontainers'

export interface WorkerReply {
  id: number
  success: boolean
  clientId?: string
  publicKey?: string
  claimed?: boolean
  handled?: number
  code?: string
}
let requestId = 0

/** 测试仅使用自身容器，调用方在 finally 停止 worker、cache 和容器。 */
export async function startTransportRedis() {
  const container = await new GenericContainer('docker.io/library/redis:7.4.11-alpine')
    .withCommand([
      'redis-server',
      '--maxmemory',
      '64mb',
      '--maxmemory-policy',
      'noeviction',
      '--appendonly',
      'yes',
    ])
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .start()
  const config: CacheConfigInput = {
    type: 'redis',
    host: container.getHost(),
    port: container.getMappedPort(6379),
    keyPrefix: `transport-test:${globalThis.crypto.randomUUID()}:`,
  }
  return { container, config }
}

export async function sendWorker(worker: ChildProcess, message: Record<string, unknown>): Promise<WorkerReply> {
  const id = ++requestId
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>
    function cleanup() {
      clearTimeout(timeout)
      worker.off('message', onMessage)
      worker.off('exit', onExit)
      worker.off('error', onError)
    }
    function onExit() {
      cleanup()
      reject(new Error('Transport worker exited before replying'))
    }
    function onError(error: Error) {
      cleanup()
      reject(error)
    }
    function onMessage(reply: WorkerReply) {
      if (reply.id === id) {
        cleanup()
        resolve(reply)
      }
    }
    timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Transport worker response timed out'))
    }, 15_000)
    worker.on('message', onMessage)
    worker.once('exit', onExit)
    worker.once('error', onError)
    worker.send({ ...message, id })
  })
}

export async function stopWorker(worker: ChildProcess): Promise<void> {
  if (worker.exitCode !== null || worker.signalCode !== null)
    return
  await new Promise<void>((resolve) => {
    const soft = setTimeout(() => worker.kill('SIGTERM'), 1000)
    const hard = setTimeout(() => worker.kill('SIGKILL'), 3000)
    worker.once('exit', () => {
      clearTimeout(soft)
      clearTimeout(hard)
      resolve()
    })
    if (worker.connected)
      worker.send({ type: 'close' })
    else worker.kill('SIGTERM')
  })
}
