/** 真实引擎验证两个 Compose 标签命名空间；查询脚本只读，不挂载宿主 socket。 */
import type { TestContext } from 'vitest'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createComposeContainerLookupScript } from '../src/container/deploy-compose-identity.js'

const image = 'docker.io/library/node:24.22.1-bookworm-slim'
const runId = randomUUID().replaceAll('-', '')
const shell = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/bash.exe' : '/bin/sh'
let runtime: 'podman' | 'docker'
let root: string | undefined
let script: string
let sequence = 0

interface CommandResult { code: number, stdout: string, stderr: string }

function command(binary: string, args: string[], signal?: AbortSignal, timeout = 20_000): Promise<CommandResult> {
  return new Promise((resolveResult) => {
    execFile(binary, args, {
      encoding: 'utf8',
      timeout,
      signal,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, PATH: `${dirname(shell)}${delimiter}${process.env.PATH ?? ''}`, MSYS_NO_PATHCONV: '1', MSYS2_ARG_CONV_EXCL: '*' },
    }, (error, stdout, stderr) => resolveResult({ code: error ? typeof error.code === 'number' ? error.code : 1 : 0, stdout, stderr }))
  })
}

function lookup(project: string, service = 'db', selector = '-q', signal?: AbortSignal): Promise<CommandResult> {
  return command(shell, [script, runtime, project, service, selector], signal)
}

/** 引擎 ps 可返回短 ID；用真实 inspect 还原身份后与 create 的完整回执比较。 */
async function resolvedIds(result: CommandResult, signal: AbortSignal): Promise<string[]> {
  const ids = result.stdout.trim().split('\n').filter(Boolean)
  const inspected = await command(runtime, ['inspect', '--format', '{{.Id}}', ...ids], signal)
  expect(inspected.code, inspected.stderr).toBe(0)
  return inspected.stdout.trim().split('\n')
}

function labels(namespace: 'com.docker.compose' | 'io.podman.compose', project: string, service = 'db'): Record<string, string> {
  return { [`${namespace}.project`]: project, [`${namespace}.service`]: service }
}

/** 只登记 create 成功回执的完整 ID；成功、断言失败和取消都按这些 ID 回收。 */
async function withContainers(context: TestContext, body: (create: (metadata: Record<string, string>, running?: boolean) => Promise<string>) => Promise<void>): Promise<void> {
  const owned: string[] = []
  const create = async (metadata: Record<string, string>, running = true): Promise<string> => {
    context.signal.throwIfAborted()
    const args = ['create', '--pull', 'never', '--network', 'none', '--name', `hai-compose-identity-${runId}-${sequence++}`, '--label', `hai.test.compose-identity-owner=${runId}`]
    for (const [key, value] of Object.entries(metadata))
      args.push('--label', `${key}=${value}`)
    args.push(image, 'node', '-e', 'setInterval(() => {}, 1000)')
    const created = await command(runtime, args, context.signal)
    expect(created.code, created.stderr).toBe(0)
    const id = created.stdout.trim()
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new Error('Container creation did not return a trustworthy owned ID')
    owned.push(id)
    if (running) {
      const started = await command(runtime, ['start', id], context.signal)
      expect(started.code, started.stderr).toBe(0)
    }
    return id
  }
  let failure: unknown
  try {
    await body(create)
  }
  catch (error) {
    failure = error
  }
  const cleanupFailures: Error[] = []
  for (const id of owned.reverse()) {
    const removed = await command(runtime, ['rm', '-f', id])
    const remaining = await command(runtime, ['ps', '-aq', '--filter', `id=${id}`])
    if (removed.code !== 0 || remaining.code !== 0 || remaining.stdout.trim())
      cleanupFailures.push(new Error(`Owned Compose identity fixture cleanup was not confirmed: ${id}`))
  }
  if (cleanupFailures.length)
    throw new AggregateError(failure ? [failure, ...cleanupFailures] : cleanupFailures, 'Compose identity fixture cleanup failed')
  if (failure)
    throw failure
}

describe.skipIf(process.env.HAI_DEPLOY_E2E !== '1')('compose identity lookup on a real container engine', () => {
  beforeAll(async () => {
    let selected: 'podman' | 'docker' | undefined
    for (const candidate of ['podman', 'docker'] as const) {
      if ((await command(candidate, ['version'], undefined, 10_000)).code === 0) {
        selected = candidate
        break
      }
    }
    if (!selected)
      throw new Error('Compose identity gate requires a reachable Podman or Docker engine')
    runtime = selected
    const tools = await command(shell, ['-c', 'command -v awk'])
    expect(tools.code, tools.stderr).toBe(0)
    // 使用同一 SDK 门禁的固定公开缓存镜像；不构建镜像、不清理公共缓存。
    const cached = await command(runtime, ['image', 'inspect', image])
    expect(cached.code, `Prepare the fixed SDK fixture image before this gate: ${cached.stderr}`).toBe(0)
    root = mkdtempSync(join(tmpdir(), 'hai-compose-identity-'))
    script = join(root, 'lookup.sh').replaceAll('\\', '/')
    writeFileSync(script, `#!/bin/sh\n${createComposeContainerLookupScript()}\ncompose_container_ids "$@"\n`)
    const syntax = await command(shell, ['-n', script])
    expect(syntax.code, syntax.stderr).toBe(0)
  }, 40_000)

  afterAll(() => {
    if (root) {
      if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('hai-compose-identity-'))
        throw new Error('Unexpected Compose identity fixture cleanup directory')
      rmSync(root, { recursive: true, force: true })
    }
  })

  for (const namespace of ['com.docker.compose', 'io.podman.compose'] as const) {
    it(`recognizes ${namespace} labels and excludes a foreign project`, async (context) => {
      await withContainers(context, async (create) => {
        const project = `hai-identity-${runId}-${sequence++}`
        const expected = await create(labels(namespace, project))
        await create(labels(namespace, `${project}-foreign`))
        const found = await lookup(project, 'db', '-q', context.signal)
        expect(found.code, found.stderr).toBe(0)
        expect(await resolvedIds(found, context.signal)).toEqual([expected])
      })
    }, 60_000)
  }

  it('deduplicates one container that declares both matching namespaces', async (context) => {
    await withContainers(context, async (create) => {
      const project = `hai-identity-${runId}-${sequence++}`
      const expected = await create({ ...labels('com.docker.compose', project), ...labels('io.podman.compose', project) })
      const found = await lookup(project, 'db', '-q', context.signal)
      expect(found.code, found.stderr).toBe(0)
      expect(await resolvedIds(found, context.signal)).toEqual([expected])
    })
  }, 60_000)

  it('keeps running-only and all-container selection distinct', async (context) => {
    await withContainers(context, async (create) => {
      const project = `hai-identity-${runId}-${sequence++}`
      const running = await create(labels('io.podman.compose', project))
      const stopped = await create(labels('com.docker.compose', project), false)
      const active = await lookup(project, 'db', '-q', context.signal)
      expect(active.code, active.stderr).toBe(0)
      expect(await resolvedIds(active, context.signal)).toEqual([running])
      const all = await lookup(project, 'db', '-aq', context.signal)
      expect(all.code, all.stderr).toBe(0)
      expect((await resolvedIds(all, context.signal)).sort()).toEqual([running, stopped].sort())
    })
  }, 60_000)

  for (const conflict of ['foreign-project', 'partial-namespace'] as const) {
    it(`refuses ${conflict} labels without emitting IDs or changing containers`, async (context) => {
      await withContainers(context, async (create) => {
        const project = `hai-identity-${runId}-${sequence++}`
        const docker = conflict === 'foreign-project' ? labels('com.docker.compose', `${project}-foreign`) : { 'com.docker.compose.project': project }
        const id = await create({ ...docker, ...labels('io.podman.compose', project) })
        const found = await lookup(project, 'db', '-q', context.signal)
        expect(found.code).not.toBe(0)
        expect(found.stdout).toBe('')
        expect(found.stderr).toContain('labels do not confirm')
        const unchanged = await command(runtime, ['inspect', '--format', '{{.State.Running}}', id], context.signal)
        expect(unchanged.code, unchanged.stderr).toBe(0)
        expect(unchanged.stdout.trim()).toBe('true')
      })
    }, 60_000)
  }

  it('returns an empty successful lookup for no matching service and refuses unsupported selectors', async (context) => {
    const project = `hai-identity-${runId}-${sequence++}`
    const none = await lookup(project, 'db', '-q', context.signal)
    expect(none.code, none.stderr).toBe(0)
    expect(none.stdout).toBe('')
    const invalid = await lookup(project, 'db', '--all', context.signal)
    expect(invalid.code).not.toBe(0)
    expect(invalid.stdout).toBe('')
  })
})
