import type { RunnerFunctions } from '@h-ai/runner'
import type { ACPPlatformPolicy } from '../src/index.js'
import { err, ok } from '@h-ai/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ai, HaiAIError } from '../src/index.js'

const scope = { tenantId: 'engineering', userId: 'alice' }
const environment = {
  id: 'isolated',
  image: `sha256:${'a'.repeat(64)}`,
  backend: 'container',
  networkPolicy: 'offline',
  capabilities: ['reports'],
  resources: {
    cpu: 1,
    memoryMiB: 256,
    pids: 32,
    scratchMiB: 64,
  },
} as const

async function initialize(acpPolicy?: ACPPlatformPolicy) {
  const unavailable = async () => err('fixture:unavailable', 'fixture')
  const runner: RunnerFunctions = {
    isExecutor: true,
    init: async () => ok(undefined),
    close: vi.fn(async () => ok(undefined)),
    environment: id => id === 'isolated'
      ? ok({
          ...environment,
          capabilities: [...environment.capabilities],
        })
      : err('fixture:not-found', 'fixture'),
    register: () => ok(() => {}),
    find: async () => ok(undefined),
    submit: vi.fn(unavailable),
    get: unavailable,
    events: unavailable,
    cancel: unavailable,
  }
  expect(await ai.init({
    acp: {
      agents: [
        {
          id: 'assistant',
          name: 'Assistant',
          mode: 'embedded',
          adapter: 'codex',
          environmentIds: ['isolated'],
          allowedCapabilities: ['reports'],
        },
      ],
    },
  }, { runner, acpPolicy })).toMatchObject({ success: true })
  return runner
}

afterEach(async () => ai.close())

describe('managed ACP planning', () => {
  it('chooses personal reuse only under the trusted application policy', async () => {
    await initialize({
      preferUserWorker: subject => subject.userId === 'alice',
    })
    expect(await ai.acp.scoped(scope).plan({ agentId: 'assistant' })).toMatchObject({
      success: true,
      data: { resolvedMode: 'user' },
    })
    expect(await ai.acp.scoped({ ...scope, userId: 'bob' }).plan({ agentId: 'assistant' })).toMatchObject({
      success: true,
      data: { resolvedMode: 'task' },
    })
  })
  it('resolves auto to an isolated task and makes no execution reservation', async () => {
    const runner = await initialize()
    const scoped = ai.acp.scoped(scope)
    const plan = await scoped.plan({
      agentId: 'assistant',
      capabilities: ['reports'],
    })
    expect(plan).toMatchObject({
      success: true,
      data: {
        resolvedMode: 'task',
        environmentId: 'isolated',
        permissions: { profile: 'workspace', approval: 'on-request' },
      },
    })
    expect(runner.submit).not.toHaveBeenCalled()
    await ai.close()
    expect(runner.close).not.toHaveBeenCalled()
  })

  it('rejects unverified sharing, excessive resources and unauthorized context', async () => {
    const runner = await initialize()
    const scoped = ai.acp.scoped(scope)
    expect(await scoped.plan({
      agentId: 'assistant',
      execution: { mode: 'shared' },
    })).toMatchObject({
      success: false,
      error: { code: HaiAIError.ACP_UNSUPPORTED.code },
    })
    expect(await scoped.plan({
      agentId: 'assistant',
      execution: {
        resources: { memoryMiB: 1024 },
      },
    })).toMatchObject({
      success: false,
      error: { code: HaiAIError.ACP_INVALID_REQUEST.code },
    })
    expect(await scoped.plan({
      agentId: 'assistant',
      context: {
        fileIds: ['private-file'],
      },
    })).toMatchObject({ success: false })
    expect(runner.submit).not.toHaveBeenCalled()
  })
})
