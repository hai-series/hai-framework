/** 使用真实 Node 子进程验证终止信号不等于退出确认，受控故障只替换 kill 回执。 */
import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createChromaProvider } from '../src/providers/vecdb-provider-chroma.js'

const control = vi.hoisted(() => ({ mode: 'normal', failHeartbeat: false, children: [] as { child: ChildProcess, kill: ChildProcess['kill'] }[] }))
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return { ...actual, spawn: () => {
    const child = actual.spawn(control.mode === 'spawn-error' ? `${process.execPath}.missing-chroma-executable` : process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
    const kill = child.kill.bind(child)
    control.children.push({ child, kill })
    child.kill = (signal) => {
      const mode = control.mode
      control.mode = 'normal'
      if (mode === 'false')
        return false
      if (mode === 'throw')
        throw new Error('Controlled signal rejection')
      if (mode === 'delayed') {
        setTimeout(kill, 60, signal)
        return true
      }
      return kill(signal)
    }
    return child
  } }
})
vi.mock('chromadb', () => ({ ChromaClient: class {
  async heartbeat() {
    if (control.failHeartbeat)
      throw new Error('Controlled readiness failure')
    return 1
  }

  async countCollections() { return 0 }
} }))
const config = { type: 'chroma', path: './test-data/controlled-child', host: 'localhost', port: 8000, serverCommand: 'controlled-child', startupTimeout: 30 } as const
beforeEach(() => {
  control.mode = 'normal'
  control.failHeartbeat = false
})
afterEach(async () => {
  for (const { child, kill } of control.children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      kill('SIGKILL')
      await exited
    }
  }
})

describe('chroma embedded child ownership', () => {
  it.each(['false', 'throw'])('kill %s 时关闭失败且保留同一活进程供重试', async (mode) => {
    const provider = createChromaProvider()
    expect((await provider.connect(config)).success).toBe(true)
    const child = control.children.at(-1)!.child
    control.mode = mode
    expect((await provider.close()).success).toBe(false)
    expect(child.pid).toBeTypeOf('number')
    expect(() => process.kill(child.pid!, 0)).not.toThrow()
    expect(provider.isConnected()).toBe(false)
    expect((await provider.close()).success).toBe(true)
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  })
  it('实际 spawn 失败不能借用公开 heartbeat 冒充内嵌服务器已启动', async () => {
    const provider = createChromaProvider()
    control.mode = 'spawn-error'
    const result = await provider.connect(config)
    expect(result.success).toBe(false)
    expect(provider.isConnected()).toBe(false)
    expect((await provider.close()).success).toBe(true)
  })
  it('kill=true仍等待实际exit后才能报告关闭成功', async () => {
    const provider = createChromaProvider()
    expect((await provider.connect(config)).success).toBe(true)
    const child = control.children.at(-1)!.child
    control.mode = 'delayed'
    const started = Date.now()
    expect((await provider.close()).success).toBe(true)
    expect(Date.now() - started).toBeGreaterThanOrEqual(40)
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  })
  it('初始化失败且kill失败时不丢失候选进程，close可回收', async () => {
    const provider = createChromaProvider()
    control.failHeartbeat = true
    control.mode = 'false'
    const initialized = await provider.connect(config)
    expect(initialized.success).toBe(false)
    if (!initialized.success)
      expect(initialized.error.ext?.cleanupPending).toBe(true)
    const child = control.children.at(-1)!.child
    expect(() => process.kill(child.pid!, 0)).not.toThrow()
    expect((await provider.close()).success).toBe(true)
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  })
})
