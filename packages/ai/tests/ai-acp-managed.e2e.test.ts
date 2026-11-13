import type { HaiResult } from '@h-ai/core'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { promisify } from 'node:util'
import { createRunner } from '@h-ai/runner'
import { describe, expect, it } from 'vitest'
import { ai, HaiAIError } from '../src/index.js'

const engine = (process.env.HAI_ACP_E2E_ENGINE ?? process.env.HAI_TEST_CONTAINER_ENGINE) === 'docker'
  ? 'docker'
  : 'podman'
const image = process.env.HAI_ACP_MANAGED_TEST_IMAGE
const shell = promisify(execFile)

function value<T>(result: HaiResult<T>) {
  expect(result.success, result.success
    ? undefined
    : `${result.error.code}: ${result.error.message}`).toBe(true)
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

describe.skipIf(!image)('managed ACP on the real container runner', () => {
  it('isolates sessions, supports all three worker allocations, and deduplicates a one-shot task', async () => {
    const inspect = await shell(engine, [
      'image',
      'inspect',
      '--format',
      '{{.Id}}',
      image!,
    ])
    const fixture = await readFile(new URL('./fixtures/acp-multiplex.mjs', import.meta.url), 'utf8')
    const runner = createRunner()
    value(await runner.init({
      engine,
      nodeId: 'acp-e2e-node',
      environments: [
        {
          id: 'fixture',
          image: inspect.stdout.trim().replace(/^(?:sha256:)?/u, 'sha256:'),
          resources: {
            cpu: 0.5,
            memoryMiB: 128,
            pids: 32,
            scratchMiB: 16,
          },
        },
      ],
    }))
    try {
      value(await ai.init({
        acp: {
          agents: [
            {
              id: 'fixture',
              name: 'Fixture',
              mode: 'embedded',
              adapter: 'fixture',
              environmentIds: ['fixture'],
            },
          ],
        },
      }, {
        runner,
        acpAdapters: {
          fixture: {
            sharedSessions: true,
            configure: () => ({
              command: 'node',
              args: ['/state/fixture.mjs'],
              env: {},
              files: { 'fixture.mjs': fixture },
            }),
          },
        },
        acpPolicy: {
          resolvePermission: (_scope, _session, tool) =>
            tool.kind === 'read'
              ? { key: 'read:project', summary: 'Read project' }
              : undefined,
        },
      }))
      const alice = ai.acp.scoped({ tenantId: 'team', userId: 'alice' })
      const bob = ai.acp.scoped({ tenantId: 'team', userId: 'bob' })
      const request = {
        agentId: 'fixture',
        permissions: { profile: 'read-only' },
      } as const
      const left = value(await alice.sessions.create(request))
      const right = value(await bob.sessions.create(request))
      expect(await bob.sessions.get(left.id)).toMatchObject({
        success: false,
        error: { code: HaiAIError.ACP_NOT_FOUND.code },
      })
      const events: unknown[] = []
      const [x, y] = await Promise.all([
        left.prompt('Alice', {
          onEvent: event => events.push(event),
        }),
        right.prompt('Bob'),
      ])
      expect(value(x)).toMatchObject({
        output: { text: 'Alice' },
        effectiveOptions: { resolvedMode: 'shared' },
      })
      expect(value(y)).toMatchObject({
        output: { text: 'Bob' },
        effectiveOptions: { resolvedMode: 'shared' },
      })
      expect(events).toContainEqual({ type: 'text', text: 'Alice' })
      expect(events).not.toContainEqual({ type: 'text', text: 'Bob' })
      value(await left.close())
      expect(await left.prompt('closed')).toMatchObject({ success: false })
      expect(value(await right.prompt('continued'))).toMatchObject({
        output: { text: 'continued' },
      })
      expect(value(await right.changeExecution({ mode: 'task', acceptNewSession: true }))).toMatchObject({ resolvedMode: 'task' })
      expect(value(await right.prompt('isolated'))).toMatchObject({
        output: { text: 'isolated' },
        effectiveOptions: { resolvedMode: 'task' },
      })
      value(await right.close())

      const oneShot = {
        agentId: 'fixture',
        prompt: '{"answer":42}',
        execution: { mode: 'task' },
        output: {
          format: 'json',
          schema: {
            type: 'object',
            required: ['answer'],
          },
        },
        idempotencyKey: 'task-1',
      } as const
      const first = value(await alice.run(oneShot))
      expect(first.output).toMatchObject({
        json: { answer: 42 },
      })
      expect(value(await alice.run(oneShot)).taskId).toBe(first.taskId)
      expect(await alice.run({ ...oneShot, prompt: 'different' })).toMatchObject({
        success: false,
        error: { code: HaiAIError.ACP_CONFLICT.code },
      })
      expect(value(await alice.run({
        agentId: 'fixture',
        prompt: 'user',
        execution: { mode: 'user' },
      }))).toMatchObject({
        output: { text: 'user' },
        effectiveOptions: { resolvedMode: 'user' },
      })
      const review = value(await alice.sessions.create({ agentId: 'fixture' }))
      expect(value(await review.prompt('{"answer":7}', {
        output: { format: 'json' },
      }))).toMatchObject({
        output: {
          json: { answer: 7 },
        },
      })
      const streamed: unknown[] = []
      for await (const event of review.stream('streamed'))
        streamed.push(event)
      expect(streamed).toContainEqual({ type: 'text', text: 'streamed' })
      let approvalId: string | undefined
      const waiting = review.prompt('approval', {
        onEvent: (event) => {
          if (event && typeof event === 'object' && !Array.isArray(event) && event.type === 'approval' && typeof event.approvalId === 'string')
            approvalId = event.approvalId
        },
      })
      await expect.poll(() => approvalId).toBeDefined()
      expect(await bob.approvals.respond(approvalId!, 'allow-session')).toMatchObject({ success: false })
      value(await alice.approvals.respond(approvalId!, 'allow-session'))
      expect(value(await waiting)).toMatchObject({
        output: { text: 'once' },
      })
      expect(value(await review.prompt('approval'))).toMatchObject({
        output: { text: 'once' },
      })
      value(await review.close())
    }
    catch (error) {
      await ai.close()
      await runner.close()
      throw error
    }
    finally {
      await ai.close()
    }
    value(await runner.close())
  }, 60_000)
})
