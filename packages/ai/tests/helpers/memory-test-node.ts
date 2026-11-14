import type { ReldbConfigInput } from '@h-ai/reldb'
import type { ChildProcess } from 'node:child_process'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'

let nextRequestId = 0
const fixture = fileURLToPath(new URL('../fixtures/memory-recovery-node.mjs', import.meta.url))

interface Reply<T> {
  id: number
  output?: T
  error?: string
}

export function call<T = unknown>(child: ChildProcess, method: string, input?: unknown): Promise<T> {
  const id = ++nextRequestId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail(new Error(`Memory fixture timed out: ${method}`)), 20_000)
    const exited = () => fail(new Error(`Memory fixture stopped: ${method}`))
    function release() {
      clearTimeout(timer)
      child.off('message', receive)
      child.off('exit', exited)
    }
    function fail(error: Error) {
      release()
      reject(error)
    }
    function receive(message: Reply<T>) {
      if (message.id !== id)
        return
      if (message.error) {
        fail(new Error(message.error))
        return
      }
      release()
      resolve(message.output as T)
    }
    child.on('message', receive)
    child.once('exit', exited)
    child.send({ id, method, input }, (error) => {
      if (error)
        fail(error)
    })
  })
}

export async function startNode(children: ChildProcess[], database: ReldbConfigInput, url: string, node: string, options: number | { maxEntriesPerObject?: number, vectorNamespace?: string } = 1) {
  const memory = typeof options === 'number'
    ? { maxEntriesPerObject: options }
    : options
  const child = forkNode(children)
  await call(child, 'init', {
    database,
    url,
    node,
    ...memory,
  })
  return child
}

export function forkNode(children: ChildProcess[]) {
  const child = fork(fixture, [], {
    execArgv: [],
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  })
  children.push(child)
  return child
}

export async function stop(child: ChildProcess, abrupt = false) {
  if (child.exitCode !== null || child.signalCode !== null)
    return
  const exited = once(child, 'exit')
  try {
    if (abrupt) {
      expect(child.kill('SIGKILL')).toBe(true)
    }
    else if (child.connected) {
      await call(child, 'close')
      child.disconnect()
    }
  }
  finally {
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000)
    try {
      await exited
    }
    finally {
      clearTimeout(timer)
    }
  }
}
