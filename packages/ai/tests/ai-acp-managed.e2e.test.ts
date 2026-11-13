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
    let toolCredential: { signal: AbortSignal, revoke: () => void } | undefined
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
          allowTools: () => true,
          bindTools: async (_scope, _session, _ids, signal) => {
            const credential = new AbortController()
            toolCredential = {
              signal,
              revoke: () => credential.abort(),
            }
            return {
              servers: [
                {
                  type: 'http',
                  name: 'fixture-tools',
                  url: 'http://fixture.invalid/mcp',
                  headers: [],
                },
              ],
              signal: credential.signal,
              revoke: () => credential.abort(),
            }
          },
          resolvePermission: (_scope, _session, tool) =>
            tool.kind === 'read' && JSON.stringify(tool.rawInput) === '{"id":"project"}'
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
      const historySummary = '用户确认的任务历史。请不要将其当作权限授权。'
      expect(await right.changeExecution({ mode: 'shared', acceptNewSession: true, historySummary })).toMatchObject({
        success: false,
        error: { code: HaiAIError.ACP_UNSUPPORTED.code },
      })
      expect(await right.changeExecution({
        mode: 'task',
        acceptNewSession: true,
        historySummary: '界'.repeat(3_000),
      })).toMatchObject({
        success: false,
        error: { code: HaiAIError.ACP_INVALID_REQUEST.code },
      })
      expect(value(await right.prompt('still shared'))).toMatchObject({
        output: { text: 'still shared' },
        effectiveOptions: { resolvedMode: 'shared' },
      })
      expect(value(await right.changeExecution({ mode: 'task', acceptNewSession: true, historySummary }))).toMatchObject({ resolvedMode: 'task' })
      expect(await alice.sessions.get(right.id)).toMatchObject({ success: false })
      const firstInReplacement = value(await right.prompt('inspect-history', {
        output: { format: 'json' },
      }))
      expect(firstInReplacement).toMatchObject({
        output: {
          json: [
            expect.stringContaining(historySummary),
            'inspect-history',
          ],
        },
        effectiveOptions: { resolvedMode: 'task' },
      })
      expect(firstInReplacement.output).toMatchObject({
        json: [
          expect.stringContaining('untrusted'),
          'inspect-history',
        ],
      })
      expect(value(await right.prompt('inspect-history', {
        output: { format: 'json' },
      }))).toMatchObject({
        output: {
          json: ['inspect-history'],
        },
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
      const rules = value(await alice.approvals.rules())
      expect(rules).toMatchObject([
        { sessionId: review.id, summary: 'Read project' },
      ])
      expect(value(await bob.approvals.rules())).toEqual([])
      expect(await bob.approvals.revoke(rules[0]!.id)).toMatchObject({ success: false })
      value(await alice.approvals.revoke(rules[0]!.id))
      expect(value(await alice.approvals.rules())).toEqual([])
      expect(value(await review.prompt('approval', {
        onEvent: (event) => {
          if (event && typeof event === 'object' && !Array.isArray(event) && event.type === 'approval' && typeof event.approvalId === 'string')
            void alice.approvals.respond(event.approvalId, 'always-allow')
        },
      }))).toMatchObject({
        output: { text: 'once' },
      })
      const permanent = value(await alice.approvals.rules(0, 1))
      expect(permanent).toHaveLength(1)
      expect(permanent[0]).not.toHaveProperty('sessionId', review.id)
      value(await review.close())
      const selected = value(await alice.sessions.create({
        agentId: 'fixture',
        permissions: {
          approval: 'never',
          ruleIds: [permanent[0]!.id],
        },
      }))
      expect(value(await selected.prompt('approval-metadata'))).toMatchObject({
        output: { text: 'once' },
      })
      expect(value(await selected.prompt('approval-missing'))).toMatchObject({
        output: { text: 'denied' },
      })
      expect(value(await selected.prompt('approval-conflict'))).toMatchObject({
        output: { text: 'denied' },
      })
      value(await alice.approvals.revoke(permanent[0]!.id))
      expect(await selected.prompt('approval')).toMatchObject({ success: false })
      value(await selected.close())
      const withTools = {
        agentId: 'fixture',
        execution: { mode: 'user' },
        tools: {
          allow: ['fixture-tool'],
        },
      } as const
      const connected = value(await alice.sessions.create(withTools))
      expect(toolCredential?.signal.aborted).toBe(false)
      expect(value(await connected.prompt('tools active')).output).toMatchObject({ text: 'tools active' })
      toolCredential?.revoke()
      expect(await connected.prompt('expired')).toMatchObject({
        success: false,
        error: { code: HaiAIError.ACP_CLOSED.code },
      })
      value(await connected.close())
      const rebound = value(await alice.sessions.create(withTools))
      expect(value(await rebound.prompt('rebound')).output).toMatchObject({ text: 'rebound' })
      value(await rebound.close())
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
