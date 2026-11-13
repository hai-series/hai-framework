import type { RunnerProcess } from '../src/index.js'
import { execFile } from 'node:child_process'
import { once } from 'node:events'
import process from 'node:process'
import { promisify } from 'node:util'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRunner, runner } from '../src/index.js'

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

  it('releases a lost reservation only after the original engine has removed its recorded container', async () => {
    const other = createRunner()
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
          args: ['-ec', 'printf result > /output/good.txt; ln -s /input/fixture.txt /output/link.txt; mkfifo /output/pipe; printf ready; exec sleep 60'],
          inputs: { 'fixture.txt': 'cHJpdmF0ZQ==' },
        })
        if (!result.success)
          throw new Error(result.error.message)
        result.data.stderr.resume()
        await once(result.data.stdout, 'data')
        const good = await result.data.artifact('good.txt', 6)
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
