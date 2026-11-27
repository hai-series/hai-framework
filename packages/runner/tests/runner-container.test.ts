import type { RunnerProcess } from '../src/index.js'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { once } from 'node:events'
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HaiRunnerError, runner, RunnerConfigSchema } from '../src/index.js'

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
    rm: vi.fn(original.rm),
  }
})

const cli = promisify(execFile)
const configuredEngine = process.env.HAI_ACP_E2E_ENGINE ?? process.env.HAI_TEST_CONTAINER_ENGINE
const engine = configuredEngine === 'podman'
  ? 'podman'
  : 'docker'
const image = 'docker.io/nginxinc/nginx-unprivileged:1.29.8-alpine'
const scope = { tenantId: 'fixture', userId: 'tester' }
const artifactImage = process.env.HAI_TEST_RUNNER_ARTIFACT_IMAGE

async function read(stream: RunnerProcess['stdout']) {
  let result = ''
  for await (const chunk of stream) {
    result += String(chunk)
  }
  return result
}

describe('managed engine isolation', () => {
  beforeEach(async () => {
    expect(configuredEngine === undefined || configuredEngine === 'docker' || configuredEngine === 'podman').toBe(true)
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    const options = { timeout: 120_000, maxBuffer: 1024 * 1024 }
    try {
      await cli(engine, ['image', 'inspect', image], options)
    }
    catch {
      await cli(engine, ['pull', image], options)
    }
    const inspected = await cli(engine, [
      'image',
      'inspect',
      '--format',
      '{{.Id}}',
      image,
    ], options)
    const imageId = inspected.stdout.trim().replace(/^(?:sha256:)?/u, 'sha256:')
    expect((await runner.init({
      engine,
      nodeId: 'container-test',
      environments: [
        {
          id: 'sandbox',
          image: imageId,
          resources: {
            cpu: 0.5,
            memoryMiB: 64,
            pids: 20,
            scratchMiB: 64,
          },
        },
      ],
    })).success).toBe(true)
  }, 130_000)

  afterEach(async () => {
    try {
      expect((await runner.close()).success).toBe(true)
    }
    finally {
      await reldb.close()
    }
  })

  it('starts an unprivileged, resource-limited container with bounded scratch, then cancels the whole process tree', async () => {
    expect((await runner.register('verify', async (_input, context) => {
      const launched = await context.start({
        command: '/bin/sh',
        args: [
          '-ec',
          [
            'test "$(id -u)" = 1000',
            'test "$(cat /state/metadata)" = expected',
            'test "$(cat /input/fixture.txt)" = isolated',
            'if touch /input/forbidden 2>/dev/null; then exit 32; fi',
            'test "$RUNNER_FIXTURE_TOKEN" = fixture-only',
            'test ! -S /run/podman/podman.sock && test ! -S /var/run/docker.sock',
            'test "$(cat /sys/fs/cgroup/memory.max)" = 67108864',
            'test "$(cat /sys/fs/cgroup/pids.max)" = 20',
            'test "$(cat /sys/fs/cgroup/cpu.max)" = "50000 100000"',
            'test -z "$(ls -A /sys/class/net | grep -v "^lo$" || true)"',
            'if touch /etc/forbidden 2>/dev/null; then exit 31; fi',
            'printf success',
          ].join('\n'),
        ],
        env: { RUNNER_FIXTURE_TOKEN: 'fixture-only' },
        files: { metadata: 'expected' },
        inputs: { 'fixture.txt': 'aXNvbGF0ZWQ=' },
      })
      if (!launched.success)
        throw new Error(launched.error.message)
      const [stdout, stderr, result] = await Promise.all([
        read(launched.data.stdout),
        read(launched.data.stderr),
        launched.data.wait(),
      ])
      return { stdout, stderr, code: result.code }
    })).success).toBe(true)
    const receipt = await runner.submit({
      scope,
      kind: 'verify',
      input: null,
      environmentId: 'sandbox',
    })
    if (!receipt.success)
      throw new Error(receipt.error.message)
    await expect.poll(() => runner.get(scope, receipt.data.id), { timeout: 15_000 })
      .toMatchObject({
        success: true,
        data: {
          status: 'succeeded',
          output: { stdout: 'success', code: 0 },
        },
      })

    expect((await runner.register('stop', async (_input, context) => {
      const launched = await context.start({
        command: 'sleep',
        args: ['600'],
      })
      if (!launched.success)
        throw new Error(launched.error.message)
      expect((await context.emit({ launched: true })).success).toBe(true)
      await launched.data.wait()
      return null
    })).success).toBe(true)
    const active = await runner.submit({
      scope,
      kind: 'stop',
      input: null,
      environmentId: 'sandbox',
    })
    if (!active.success)
      throw new Error(active.error.message)
    await expect.poll(() => runner.events(scope, active.data.id), { timeout: 15_000 })
      .toMatchObject({
        success: true,
        data: [
          {
            data: { launched: true },
          },
        ],
      })
    expect((await runner.cancel(scope, active.data.id)).success).toBe(true)
    await expect.poll(() => runner.get(scope, active.data.id), { timeout: 15_000 })
      .toMatchObject({
        success: true,
        data: { status: 'cancelled' },
      })
  }, 45_000)

  it('shares concurrent stop attempts and retries uncertain staging cleanup', async () => {
    const fileSystem = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    expect((await runner.register('retry-cleanup', async (_input, context) => {
      const launched = await context.start({
        command: 'sleep',
        args: ['600'],
        inputs: {},
      })
      if (!launched.success)
        throw new Error(launched.error.message)
      const handle = launched.data
      const remove = vi.mocked(rm).mockImplementationOnce(async (...args) => {
        await fileSystem.rm(...args)
        throw Object.assign(new Error('Fixture staging cleanup interrupted'), { code: 'EIO' })
      })
      try {
        const attempt = handle.close()
        expect(handle.close()).toBe(attempt)
        const result = await attempt
        expect(result.success).toBe(false)
        if (!result.success)
          expect(result.error.code).toBe(HaiRunnerError.CLEANUP_UNCONFIRMED.code)

        const retry = handle.close()
        expect(retry).not.toBe(attempt)
        expect((await retry).success).toBe(true)
        expect(handle.close()).toBe(retry)
        return null
      }
      finally {
        remove.mockReset().mockImplementation(fileSystem.rm)
      }
    })).success).toBe(true)
    const receipt = await runner.submit({
      scope,
      kind: 'retry-cleanup',
      input: null,
      environmentId: 'sandbox',
    })
    if (!receipt.success)
      throw new Error(receipt.error.message)
    await expect.poll(() => runner.get(scope, receipt.data.id), { timeout: 15_000 })
      .toMatchObject({
        success: true,
        data: { status: 'succeeded' },
      })
  }, 30_000)

  it('requires a settled creation attempt before reconciling a missing container ID', async () => {
    const executable = (await cli('/bin/sh', [
      '-c',
      'command -v "$1"',
      'fixture',
      engine,
    ])).stdout.trim()
    if (!/^\/[\w./-]+$/u.test(executable))
      throw new Error('Unexpected fixture engine executable')
    const directory = await mkdtemp(join(tmpdir(), 'hai-runner-create-fixture-'))
    const originalPath = process.env.PATH
    const originalTmpdir = process.env.TMPDIR
    try {
      const shim = join(directory, engine)
      const stageRoot = join(directory, 'staging')
      await mkdir(stageRoot)
      await writeFile(shim, `#!/bin/sh
if [ "$1:$2" = container:create ]; then
  if [ -e "$0.rejected" ]; then
    printf 'Error response from daemon: fixture rejected\\n' >&2
    exit 125
  fi
  printf 'unconfirmed fixture response\\n'
  exit 0
fi
exec '${executable}' "$@"
`, { flag: 'wx' })
      await chmod(shim, 0o700)
      process.env.PATH = originalPath
        ? `${directory}${delimiter}${originalPath}`
        : directory
      process.env.TMPDIR = stageRoot
      expect((await runner.register('creation-receipt', async (_input, context) => {
        const launched = await context.start({ command: 'true' })
        if (!launched.success)
          throw new Error(launched.error.message)
        return null
      })).success).toBe(true)

      async function submit(expected: 'unknown' | 'failed') {
        const receipt = await runner.submit({
          scope,
          kind: 'creation-receipt',
          input: null,
          environmentId: 'sandbox',
        })
        if (!receipt.success)
          throw new Error(receipt.error.message)
        await expect.poll(() => runner.get(scope, receipt.data.id), { timeout: 15_000 })
          .toMatchObject({
            success: true,
            data: { status: expected },
          })
        const record = await reldb.sql.get<{ container_json: string }>(
          'SELECT container_json FROM hai_runner_executions WHERE id = ?',
          [receipt.data.id],
        )
        if (!record.success || !record.data)
          throw new Error('Missing runner creation receipt')
        const staged = JSON.parse(record.data.container_json) as { attempt: string, stageName: string, id?: string }
        expect(staged.attempt).toMatch(/^[\da-f]{64}$/u)
        expect(staged.id).toBeUndefined()
        return {
          id: receipt.data.id,
          directory: join(stageRoot, staged.stageName),
        }
      }

      const unknown = await submit('unknown')
      expect((await stat(unknown.directory)).isDirectory()).toBe(true)
      await expect(stat(join(unknown.directory, 'environment'))).rejects.toMatchObject({ code: 'ENOENT' })
      const review = { operatorId: 'ops', reason: 'Confirmed original engine attempt completed without a container' }
      expect(await runner.reconcileUnknown(scope, unknown.id, review))
        .toMatchObject({
          success: false,
          error: { code: HaiRunnerError.CLEANUP_UNCONFIRMED.code },
        })
      await expect.poll(() => runner.reconcileUnknown(scope, unknown.id, { ...review, hostResourcesStopped: true }), { timeout: 10_000 })
        .toMatchObject({
          success: true,
          data: {
            status: 'unknown',
            reconciledAt: expect.any(Number),
          },
        })
      await expect(stat(unknown.directory)).rejects.toMatchObject({ code: 'ENOENT' })

      await writeFile(`${shim}.rejected`, '', { flag: 'wx' })
      const rejected = await submit('failed')
      await expect(stat(rejected.directory)).rejects.toMatchObject({ code: 'ENOENT' })
    }
    finally {
      if (originalPath === undefined)
        delete process.env.PATH
      else
        process.env.PATH = originalPath
      if (originalTmpdir === undefined)
        delete process.env.TMPDIR
      else
        process.env.TMPDIR = originalTmpdir
      await rm(directory, { recursive: true, force: true })
    }
  }, 45_000)

  it('admits the minimum container quota only when all requested mounts fit', async () => {
    const sandbox = runner.environment('sandbox')
    if (!sandbox.success)
      throw new Error(sandbox.error.message)
    const config = {
      nodeId: 'quota',
      executor: false,
      capacity: { ...sandbox.data.resources, pids: 1 },
    }
    const environment = {
      ...sandbox.data,
      resources: { ...sandbox.data.resources, pids: 2, scratchMiB: 3 },
    }
    expect(RunnerConfigSchema.safeParse(config).success).toBe(true)
    expect(RunnerConfigSchema.safeParse({
      ...config,
      environments: [
        {
          ...environment,
          resources: { ...environment.resources, pids: 1 },
        },
      ],
    }).success).toBe(false)
    const facade = runner.create()
    try {
      expect((await facade.init({
        ...config,
        environments: [environment],
      })).success).toBe(true)
      expect(facade.registerWarmPool({
        key: 'minimum',
        kind: 'minimum-quota',
        environmentId: environment.id,
        minReady: 1,
        maxRunning: 1,
        maxTotal: 1,
      }))
        .toMatchObject({
          success: false,
          error: { code: HaiRunnerError.INVALID.code },
        })
      expect((await facade.submit({
        scope,
        kind: 'host-job',
        input: null,
        resources: { pids: 1 },
      })).success).toBe(true)
    }
    finally {
      expect((await facade.close()).success).toBe(true)
    }

    expect((await runner.register('minimum-quota', async (input, context) => {
      const launched = await context.start({
        command: 'true',
        ...(input === true && { inputs: {} }),
        ...(input === 'workspace' && {
          workspace: { 'src/readme.txt': 'c2FtcGxl' },
        }),
      })
      return launched.success
        ? (await launched.data.wait()).code
        : launched.error.code
    })).success).toBe(true)
    const request = {
      scope,
      kind: 'minimum-quota',
      environmentId: 'sandbox',
      input: false,
    }
    expect(await runner.submit({
      ...request,
      resources: { pids: 1 },
    }))
      .toMatchObject({
        success: false,
        error: { code: HaiRunnerError.INVALID.code },
      })
    for (const [input, scratchMiB, output] of [
      [false, 3, 0],
      [true, 3, HaiRunnerError.INVALID.code],
      [true, 4, 0],
      ['workspace', 3, 0],
    ] as const) {
      const receipt = await runner.submit({
        ...request,
        input,
        resources: { pids: 2, scratchMiB },
      })
      if (!receipt.success)
        throw new Error(receipt.error.message)
      await expect.poll(() => runner.get(scope, receipt.data.id), { timeout: 15_000 })
        .toMatchObject({
          success: true,
          data: { status: 'succeeded', output },
        })
    }
  }, 30_000)

  it('releases a lost reservation only after the original engine has removed its recorded container', async () => {
    const other = runner.create()
    const review = { operatorId: 'operator', reason: 'INC-47: verified engine cleanup' }
    try {
      expect((await other.init({ engine, nodeId: 'another-engine-node' })).success).toBe(true)
      expect((await runner.register('reconcile', async (_input, context) => {
        const launched = await context.start({
          command: 'sleep',
          args: ['60'],
        })
        if (!launched.success)
          throw new Error(launched.error.message)
        launched.data.stdout.resume()
        launched.data.stderr.resume()
        expect((await context.emit({ launched: true })).success).toBe(true)
        await launched.data.wait()
        return null
      })).success).toBe(true)
      const original = await runner.submit({
        scope,
        kind: 'reconcile',
        input: null,
        environmentId: 'sandbox',
        reuseKey: 'worker',
        idempotencyKey: 'original',
      })
      if (!original.success)
        throw new Error(original.error.message)
      const id = original.data.id
      await expect.poll(() => runner.events(scope, id), { timeout: 8000 })
        .toMatchObject({
          success: true,
          data: [
            {
              data: { launched: true },
            },
          ],
        })
      expect(await runner.reconcileUnknown(scope, id, review)).toMatchObject({ success: false })
      expect((await reldb.sql.execute('UPDATE hai_runner_executions SET leased_until = 0 WHERE id = ?', [id])).success).toBe(true)
      await expect.poll(() => runner.get(scope, id), { timeout: 8000 })
        .toMatchObject({
          success: true,
          data: { status: 'unknown' },
        })
      expect(await other.reconcileUnknown(scope, id, review)).toMatchObject({ success: false })
      await expect.poll(() => runner.reconcileUnknown(scope, id, review), { timeout: 8000 })
        .toMatchObject({
          success: true,
          data: {
            status: 'unknown',
            reconciledAt: expect.any(Number),
          },
        })
      expect(await runner.reconcileUnknown(scope, id, review)).toMatchObject({ success: false })
      const audit = await reldb.sql.get<{ reconciliation_json: string }>('SELECT reconciliation_json FROM hai_runner_executions WHERE id = ?', [id])
      expect(audit.success && JSON.parse(audit.data!.reconciliation_json)).toEqual(review)
      expect(await runner.find(scope, 'reconcile', 'original'))
        .toMatchObject({
          success: true,
          data: {
            id,
            status: 'unknown',
            reconciledAt: expect.any(Number),
          },
        })
      const replacement = await runner.submit({
        scope,
        kind: 'reconcile',
        input: null,
        environmentId: 'sandbox',
        reuseKey: 'worker',
      })
      expect(replacement).toMatchObject({
        success: true,
        data: {
          id: expect.not.stringMatching(id),
        },
      })
    }
    finally {
      expect((await other.close()).success).toBe(true)
    }
  }, 30_000)
})

describe('isolated artifact export', () => {
  it('stages readable container files under a restrictive umask and captures only bounded regular files', async () => {
    const projectImage = 'docker.io/library/node:24.22.1-bookworm-slim'
    try {
      await cli(engine, ['image', 'inspect', projectImage])
    }
    catch {
      await cli(engine, ['pull', projectImage], { timeout: 120_000 })
    }
    const { stdout } = await cli(engine, [
      'image',
      'inspect',
      '--format',
      '{{.Id}}',
      projectImage,
    ])
    const previousUmask = process.umask(0o077)
    try {
      expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
      expect((await runner.init({
        engine,
        nodeId: 'project-node',
        environments: [
          {
            id: 'project',
            image: stdout.trim().replace(/^(?:sha256:)?/u, 'sha256:'),
            resources: {
              cpu: 0.5,
              memoryMiB: 128,
              pids: 32,
              scratchMiB: 64,
            },
          },
        ],
      })).success).toBe(true)
      const script = Buffer.from('#!/bin/sh\nprintf executable\n').toString('base64')
      const invalidExecutables = new Map([
        [
          'missing-executable',
          ['src/missing.sh'],
        ],
        [
          'invalid-executable',
          ['../check.sh'],
        ],
        [
          'duplicate-executable',
          ['src/check.sh', 'src/check.sh'],
        ],
        [
          'executables-without-workspace',
          ['src/check.sh'],
        ],
      ])
      expect((await runner.register('project-test', async (input, context) => {
        const executables = typeof input === 'string'
          ? invalidExecutables.get(input)
          : undefined
        const started = await context.start({
          command: '/bin/sh',
          args: [
            '-ec',
            [
              'test "$(stat -c %a /run/hai-project/src)" = 755',
              'test "$(stat -c %a /run/hai-project/src/main.txt)" = 644',
              'test "$(stat -c %a /run/hai-project/src/check.sh)" = 755',
              'test "$(stat -c %a /run/hai-config/metadata)" = 444',
              'test "$(stat -c %a /input/fixture.txt)" = 444',
              'test "$(cat /state/metadata)" = expected',
              'test "$(cat /input/fixture.txt)" = isolated',
              'test "$(cat src/main.txt)" = original',
              'test ! -x src/main.txt',
              'test "$(./src/check.sh)" = executable',
              'printf edited > src/main.txt',
              'head -c 270336 /dev/zero > report.bin',
              'ln -s /etc/passwd escape.txt',
              'printf ready',
              'read -r done',
            ].join('\n'),
          ],
          files: { metadata: 'expected' },
          inputs: { 'fixture.txt': 'aXNvbGF0ZWQ=' },
          workspace: input === 'executables-without-workspace'
            ? undefined
            : { [input === 'bad-path'
                ? '../outside'
                : 'src/main.txt']: 'b3JpZ2luYWw=', 'src/check.sh': script },
          workspaceExecutables: executables ?? ['src/check.sh'],
        })
        if (!started.success)
          return { code: started.error.code }
        try {
          await Promise.race([
            once(started.data.stdout, 'data', { signal: context.signal }),
            started.data.wait().then(({ code }) => {
              throw new Error(`Project container stopped before readiness: ${code}`)
            }),
          ])
          const capture = await started.data.snapshot(512 * 1024)
          const tooLarge = await started.data.snapshot(3)
          if (!capture.success)
            throw new Error(capture.error.message)
          const { 'report.bin': report, ...files } = capture.data
          return { files, reportBytes: Buffer.from(report, 'base64').length, overBudget: !tooLarge.success }
        }
        finally {
          await started.data.close()
        }
      })).success).toBe(true)
      for (const [input, output] of [
        [
          'good-path',
          {
            files: { 'src/main.txt': 'ZWRpdGVk', 'src/check.sh': script },
            reportBytes: 270336,
            overBudget: true,
          },
        ],
        ...[
          'bad-path',
          ...invalidExecutables.keys(),
        ].map(input => [
          input,
          { code: HaiRunnerError.INVALID.code },
        ] as const),
      ] as const) {
        const task = await runner.submit({
          scope,
          kind: 'project-test',
          environmentId: 'project',
          input,
        })
        if (!task.success)
          throw new Error(task.error.message)
        await expect.poll(() => runner.get(scope, task.data.id), { timeout: 15_000 })
          .toMatchObject({
            success: true,
            data: { status: 'succeeded', output },
          })
      }
    }
    finally {
      try {
        await runner.close()
      }
      finally {
        process.umask(previousUmask)
        await reldb.close()
      }
    }
  }, 150_000)

  it.runIf(!!artifactImage)('consumes each ready container once after claim without carrying files between principals', async () => {
    const peer = runner.create()
    const entered = Promise.withResolvers<string>()
    const release = Promise.withResolvers<void>()
    const previousUmask = process.umask(0o077)
    try {
      expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
      const { stdout } = await cli(engine, [
        'image',
        'inspect',
        '--format',
        '{{.Id}}',
        artifactImage!,
      ])
      const image = stdout.trim().replace(/^(?:sha256:)?/u, 'sha256:')
      const environment = {
        id: 'tools',
        image,
        resources: {
          cpu: 0.5,
          memoryMiB: 128,
          pids: 24,
          scratchMiB: 64,
        },
      }
      const pool = {
        key: 'documents',
        kind: 'read',
        environmentId: 'tools',
        minReady: 1,
        maxRunning: 1,
        maxTotal: 1,
      }
      for (const [index, node] of [runner, peer].entries()) {
        expect((await node.init({
          nodeId: `warm-${index}`,
          engine,
          environments: [environment],
        })).success).toBe(true)
        expect((await node.register('read', async (input, context) => {
          if (input === 'hold') {
            entered.resolve(context.id)
            await release.promise
          }
          const launched = await context.start({
            command: '/bin/sh',
            args: [
              '-ec',
              [
                'test -z "$(ls -A /output)"',
                'if test -e /run/hai-config/warm-launch.json; then test "$(stat -c %a /run/hai-config/warm-launch.json)" = 444; fi',
                'test "$(stat -c %a /input/current)" = 444',
                'cat /input/current',
              ].join('\n'),
            ],
            inputs: {
              current: input === 'hold'
                ? 'YWxwaGE='
                : String(input),
            },
          })
          if (!launched.success)
            throw new Error(launched.error.message)
          launched.data.stderr.resume()
          return await read(launched.data.stdout)
        })).success).toBe(true)
        expect((await node.registerWarmPool(pool)).success).toBe(true)
      }
      const readyId = async () => {
        const result = await reldb.sql.get<{ container_json: string }>('SELECT container_json FROM hai_runner_executions WHERE warm_state = \'ready\' AND state = \'running\'')
        return result.success && result.data
          ? JSON.parse(result.data.container_json).id as string
          : undefined
      }
      const jobId = async (id: string) => {
        const result = await reldb.sql.get<{ container_json: string }>('SELECT container_json FROM hai_runner_executions WHERE id = ?', [id])
        return result.success && result.data
          ? JSON.parse(result.data.container_json).id as string
          : undefined
      }
      await expect.poll(readyId, { timeout: 8000 }).toBeDefined()
      const initial = await readyId()
      const submit = (userId: string, input: string) => runner.submit({
        scope: { ...scope, userId },
        kind: 'read',
        input,
        environmentId: 'tools',
        capacityClass: 'tool',
        concurrency: { key: 'documents', limit: 1 },
        warmPool: true,
      })
      const alice = await submit('alice', 'hold')
      if (!alice.success)
        throw new Error(alice.error.message)
      await expect.poll(() => runner.get({ ...scope, userId: 'alice' }, alice.data.id), { timeout: 8000 })
        .toMatchObject({
          success: true,
          data: { status: 'running' },
        })
      expect(await entered.promise).toBe(alice.data.id)
      expect(await jobId(alice.data.id)).toBe(initial)
      const bob = await submit('bob', 'YmV0YQ==')
      if (!bob.success)
        throw new Error(bob.error.message)
      const count = await reldb.sql.get<{ total: number }>('SELECT COUNT(*) AS total FROM hai_runner_executions WHERE state = \'running\'')
      expect(count).toEqual({
        success: true,
        data: { total: 1 },
      })
      expect(await runner.get({ ...scope, userId: 'bob' }, bob.data.id))
        .toMatchObject({
          success: true,
          data: { status: 'queued' },
        })
      expect(await readyId()).toBeUndefined()

      // 失租后不得在原已认领容器上注入迟到的文件或启动工具。
      expect((await reldb.sql.execute('UPDATE hai_runner_executions SET leased_until = 0 WHERE id = ?', [alice.data.id])).success).toBe(true)
      release.resolve()
      await expect.poll(() => runner.get({ ...scope, userId: 'alice' }, alice.data.id), { timeout: 8000 })
        .toMatchObject({
          success: true,
          data: { status: 'unknown', output: undefined },
        })
      const review = { operatorId: 'ops', reason: 'Test confirms old container gone' }
      await expect.poll(async () => {
        const [a, b] = await Promise.all([
          runner.reconcileUnknown({ ...scope, userId: 'alice' }, alice.data.id, review),
          peer.reconcileUnknown({ ...scope, userId: 'alice' }, alice.data.id, review),
        ])
        return a.success || b.success
      }, { timeout: 8000 }).toBe(true)
      await expect.poll(() => runner.get({ ...scope, userId: 'bob' }, bob.data.id), { timeout: 8000 })
        .toMatchObject({
          success: true,
          data: { status: 'succeeded', output: 'beta' },
        })
      expect(await jobId(bob.data.id)).not.toBe(initial)
      await expect.poll(readyId, { timeout: 8000 }).toBeDefined()
      expect(await readyId()).not.toBe(initial)
    }
    finally {
      release.resolve()
      try {
        const closed = await Promise.all([
          runner.close(),
          peer.close(),
        ])
        expect(closed.every(result => result.success)).toBe(true)
      }
      finally {
        process.umask(previousUmask)
        await reldb.close()
      }
    }
  }, 30_000)

  it.runIf(!!artifactImage)('releases an idle warm reservation after unregistering its handler', async () => {
    const peer = runner.create()
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    try {
      const { stdout } = await cli(engine, [
        'image',
        'inspect',
        '--format',
        '{{.Id}}',
        artifactImage!,
      ])
      const environment = {
        id: 'tools',
        image: stdout.trim().replace(/^(?:sha256:)?/u, 'sha256:'),
        resources: {
          cpu: 0.5,
          memoryMiB: 128,
          pids: 24,
          scratchMiB: 64,
        },
      }
      const pool = {
        kind: 'handoff',
        key: 'tools',
        environmentId: environment.id,
        minReady: 1,
        maxRunning: 1,
        maxTotal: 1,
      }
      expect((await runner.init({
        engine,
        nodeId: 'warm-owner',
        environments: [environment],
      })).success).toBe(true)
      const owner = runner.register(pool.kind, async () => 'original')
      if (!owner.success)
        throw new Error(owner.error.message)
      expect(runner.registerWarmPool(pool).success).toBe(true)
      const ready = () => reldb.sql.get<{ id: string, container_json: string }>(
        'SELECT id, container_json FROM hai_runner_executions WHERE owner_node = \'warm-owner\' AND warm_state = \'ready\' AND state = \'running\'',
      )
      await expect.poll(ready, { timeout: 8000 }).toMatchObject({
        success: true,
        data: {
          id: expect.any(String),
        },
      })
      const reservation = await ready()
      if (!reservation.success || !reservation.data)
        throw new Error('Original warm reservation is missing')
      const container = JSON.parse(reservation.data.container_json) as { id: string }
      expect((await peer.init({
        engine,
        nodeId: 'warm-peer',
        environments: [environment],
      })).success).toBe(true)
      expect(peer.register(pool.kind, async () => 'peer').success).toBe(true)
      expect(peer.registerWarmPool(pool).success).toBe(true)
      owner.data()
      const receipt = await peer.submit({
        scope,
        kind: pool.kind,
        input: null,
        environmentId: environment.id,
        capacityClass: 'tool',
        concurrency: { key: pool.key, limit: pool.maxRunning },
        warmPool: true,
      })
      if (!receipt.success)
        throw new Error(receipt.error.message)
      await expect.poll(() => peer.get(scope, receipt.data.id), { timeout: 8000 }).toMatchObject({
        success: true,
        data: { status: 'succeeded', output: 'peer' },
      })
      const { stdout: remaining } = await cli(engine, [
        'container',
        'ls',
        '--all',
        '--filter',
        `id=${container.id}`,
        '--format',
        '{{.ID}}',
      ])
      expect(remaining.trim()).toBe('')
    }
    finally {
      try {
        const closed = await Promise.all([
          runner.close(),
          peer.close(),
        ])
        expect(closed.every(result => result.success)).toBe(true)
      }
      finally {
        await reldb.close()
      }
    }
  }, 25_000)

  it.runIf(!!artifactImage)('exports a bounded regular file and rejects traversal, symlinks and FIFOs', async () => {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    try {
      const { stdout } = await cli(engine, [
        'image',
        'inspect',
        '--format',
        '{{.Id}}',
        artifactImage!,
      ])
      const id = stdout.trim().replace(/^(?:sha256:)?/u, 'sha256:')
      expect((await runner.init({
        nodeId: 'artifact-test',
        engine,
        environments: [
          {
            id: 'artifact',
            image: id,
            resources: {
              cpu: 1,
              memoryMiB: 128,
              pids: 30,
              scratchMiB: 128,
            },
          },
        ],
      })).success).toBe(true)
      expect((await runner.register('artifact', async (_input, context) => {
        const result = await context.start({
          command: '/bin/sh',
          args: ['-ec', 'printf result > /output/good.txt; head -c 270336 /dev/zero > /output/report.bin; ln -s /input/fixture.txt /output/link.txt; mkfifo /output/pipe; printf ready; exec sleep 60'],
          inputs: { 'fixture.txt': 'cHJpdmF0ZQ==' },
        })
        if (!result.success)
          throw new Error(result.error.message)
        result.data.stderr.resume()
        await once(result.data.stdout, 'data')
        const good = await result.data.artifact('good.txt', 6)
        const report = await result.data.artifact('report.bin', 512 * 1024)
        if (!report.success)
          throw new Error(report.error.message)
        expect(Buffer.from(report.data, 'base64')).toEqual(Buffer.alloc(270336))
        const rejected = await Promise.all([
          result.data.artifact('../input/fixture.txt', 100),
          result.data.artifact('good.txt', 5),
          result.data.artifact('link.txt', 100),
          result.data.artifact('pipe', 100),
        ])
        return {
          value: good.success ? good.data : null,
          rejected: rejected.every(item => !item.success),
        }
      })).success).toBe(true)
      const receipt = await runner.submit({
        scope,
        kind: 'artifact',
        input: null,
        environmentId: 'artifact',
      })
      if (!receipt.success)
        throw new Error(receipt.error.message)
      await expect.poll(() => runner.get(scope, receipt.data.id), { timeout: 15_000 })
        .toMatchObject({
          success: true,
          data: {
            status: 'succeeded',
            output: { value: 'cmVzdWx0', rejected: true },
          },
        })
    }
    finally {
      try {
        expect((await runner.close()).success).toBe(true)
      }
      finally {
        await reldb.close()
      }
    }
  }, 20_000)
})
