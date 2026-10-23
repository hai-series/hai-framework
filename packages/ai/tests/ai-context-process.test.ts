/** 无进程内锁的真实双 Node，验证暂停、接管、崩溃恢复和跨节点幂等提交。 */
import type { Buffer } from 'node:buffer'
import type { ChatMessage } from '../src/llm/ai-llm-types.js'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

interface Reply {
  id?: number
  phase?: string
  failed?: string
  pausedFor?: number
  result?: { success: boolean, data?: { turnId: string } }
  messages?: { success: boolean, data: ChatMessage[] }
}

async function start(directory: string, name: string) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/context-node.mjs', import.meta.url))], {
    env: { ...process.env, NODE_ENV: 'test', CONTEXT_NODE_INPUT: JSON.stringify({ database: join(directory, 'shared.db'), vectors: join(directory, name) }) },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  let serial = 0
  let stderr = ''
  const messages: Reply[] = []
  child.stdout!.resume()
  child.stderr!.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-8192)
  })
  child.on('message', value => messages.push(value as Reply))
  async function wait(predicate: (message: Reply) => boolean): Promise<Reply> {
    const deadline = Date.now() + 75_000
    while (Date.now() < deadline) {
      const index = messages.findIndex(predicate)
      if (index >= 0)
        return messages.splice(index, 1)[0]!
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(stderr || 'Context node exited')
      await delay(20)
    }
    throw new Error(`Context node timed out: ${stderr}`)
  }
  await wait(message => message.phase === 'ready')
  return {
    child,
    wait,
    send(input: object) {
      const id = ++serial
      child.send({ ...input, id })
      return id
    },
    async request(input: object) {
      const id = this.send(input)
      const result = await wait(message => message.id === id)
      expect(result.failed).toBeUndefined()
      return result
    },
    async close() {
      if (child.exitCode !== null || child.signalCode !== null)
        return
      child.send({ action: 'close' })
      await new Promise<void>((done) => {
        const timer = setTimeout(() => child.kill(), 5000)
        child.once('exit', () => {
          clearTimeout(timer)
          done()
        })
      })
    },
  }
}

/** 只清理本测试创建的临时目录。 */
async function removeOwned(directory: string): Promise<void> {
  const target = resolve(directory)
  if (dirname(target) !== resolve(tmpdir()) || !target.startsWith(join(resolve(tmpdir()), 'hai-context-process-')))
    throw new Error('Unexpected Context test cleanup path')
  await rm(target, { recursive: true, force: true })
}

it('旧节点事件循环暂停45秒后最终提交失败，pending在节点崩溃后由B恢复且只提交一次', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hai-context-process-'))
  const nodes: Awaited<ReturnType<typeof start>>[] = []
  const scope = { objectId: 'user', sessionId: 'shared' }
  try {
    const a = await start(directory, 'vectors-a')
    nodes.push(a)
    const b = await start(directory, 'vectors-b')
    nodes.push(b)
    const id = a.send({ action: 'chat', scope, text: 'old-question', reply: 'old-reply', pause: true })
    await a.wait(message => message.phase === 'paused')
    // 真实时间跨过30秒租约；不修改存储值、不暂停别的进程或伪造存储端时钟。
    await delay(31_000)
    expect((await b.request({ action: 'chat', scope, text: 'new-question', reply: 'new-reply' })).result?.success).toBe(true)
    const old = await a.wait(message => message.id === id)
    expect(old.pausedFor).toBeGreaterThanOrEqual(44_000)
    expect(old.result?.success).toBe(false)
    const pending = await a.request({ action: 'chat', scope, manual: true, text: 'manual-question', reply: 'actual-reply' })
    expect(pending.result?.success).toBe(true)
    const turnId = pending.result?.data?.turnId
    expect(turnId).toEqual(expect.any(String))
    a.child.kill()
    await new Promise<void>(done => a.child.once('exit', () => done()))
    const committed = await b.request({ action: 'commit', scope, turnId })
    expect(committed.result?.success).toBe(true)
    expect((await b.request({ action: 'commit', scope, turnId })).result?.success).toBe(true)
    const snapshot = await b.request({ action: 'read', scope })
    expect(snapshot.messages?.data.map(message => message.content)).toEqual(['old-question', 'new-question', 'new-reply', 'manual-question', 'actual-reply'])
  }
  finally {
    await Promise.all(nodes.map(node => node.close()))
    await removeOwned(directory)
  }
}, 120_000)
