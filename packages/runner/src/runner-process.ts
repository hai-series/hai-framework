import { createHash } from 'node:crypto'
import { readFile, readlink } from 'node:fs/promises'
import process from 'node:process'
import { z } from 'zod'

/**
 * 执行节点进程的核验凭据，仅限同一 Linux 宿主、启动代次和 PID 命名空间。
 * @example 模块内部上下文
 * ```ts
 * function ownerPid(identity: RunnerProcessIdentity) { return identity.pid }
 * ```
 */
export interface RunnerProcessIdentity {
  pid: number
  hostKey: string
  started: string
}

const processIdentity = z.strictObject({
  pid: z.number().int().positive().max(2 ** 31 - 1),
  hostKey: z.string().regex(/^[a-f\d]{64}$/u),
  started: z.string().regex(/^\d+$/u).max(20),
})

async function hostKey() {
  const [machine, boot, namespace] = await Promise.all([
    readFile('/etc/machine-id', 'utf8'),
    readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
    readlink('/proc/self/ns/pid'),
  ])
  if (!/^[a-f\d]{32}$/u.test(machine.trim()) || !/^[a-f\d-]{36}$/u.test(boot.trim())
    || !/^pid:\[\d+\]$/u.test(namespace)) {
    throw new Error('Runner host identity unavailable')
  }
  return createHash('sha256').update(JSON.stringify([
    machine.trim(),
    boot.trim(),
    namespace,
  ])).digest('hex')
}

async function startTime(pid: number) {
  const raw = await readFile(`/proc/${pid}/stat`, 'utf8')
  // comm 可以包含空格和右括号，字段 22 在最后一个右括号之后解析。
  const index = raw.lastIndexOf(') ')
  const field = index < 0
    ? undefined
    : raw.slice(index + 2).split(/\s+/u)[19]
  if (!field || !/^\d+$/u.test(field))
    throw new Error('Runner process identity unavailable')
  return field
}

/**
 * 尝试为本执行代次登记宿主进程证明。不可读取时保留人工排查边界。
 * @example 模块内部上下文
 * ```ts
 * const identity = await readRunnerProcess()
 * ```
 */
export async function readRunnerProcess(): Promise<RunnerProcessIdentity | undefined> {
  if (process.platform !== 'linux')
    return undefined
  try {
    const [host, started] = await Promise.all([
      hostKey(),
      startTime(process.pid),
    ])
    return { pid: process.pid, hostKey: host, started }
  }
  catch {
    return undefined
  }
}

/**
 * 仅在同一可见的进程表上判断旧进程已退出或 PID 已被不同进程使用。
 * @example 模块内部上下文
 * ```ts
 * async function stopped(identity: RunnerProcessIdentity) { return confirmRunnerProcessReleased(identity) }
 * ```
 */
export async function confirmRunnerProcessReleased(identity: unknown): Promise<boolean> {
  const record = processIdentity.safeParse(identity)
  if (!record.success || process.platform !== 'linux')
    return false
  const { pid, hostKey: previous, started } = record.data
  try {
    if (previous !== await hostKey())
      return false
    try {
      return await startTime(pid) !== started
    }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
        return false
      // hidepid 等策略可能让 /proc 表现为不存在。只有内核也返回 ESRCH 才接受。
      try {
        process.kill(pid, 0)
        return false
      }
      catch (cause) {
        return cause instanceof Error && 'code' in cause && cause.code === 'ESRCH'
      }
    }
  }
  catch {
    return false
  }
}
