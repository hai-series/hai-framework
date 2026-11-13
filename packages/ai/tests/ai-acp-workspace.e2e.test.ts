import type { HaiResult } from '@h-ai/core'
import type { ACPPlatformPolicy } from '../src/index.js'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { promisify } from 'node:util'
import { createRunner } from '@h-ai/runner'
import { describe, expect, it, vi } from 'vitest'
import { ai, HaiAIError } from '../src/index.js'

const shell = promisify(execFile)
const engine = (process.env.HAI_ACP_E2E_ENGINE ?? process.env.HAI_TEST_CONTAINER_ENGINE) === 'docker'
  ? 'docker'
  : 'podman'
const image = process.env.HAI_ACP_MANAGED_TEST_IMAGE

function value<T>(result: HaiResult<T>) {
  if (!result.success)
    throw new Error(JSON.stringify(result.error))
  return result.data
}

describe.skipIf(!image)('managed ACP workspace snapshot', () => {
  it('mounts authorized bytes read-only, preserves writable scratch and rejects foreign or revoked access', async () => {
    const inspect = await shell(engine, [
      'image',
      'inspect',
      '--format',
      '{{.Id}}',
      image!,
    ])
    const fixture = await readFile(new URL('./fixtures/acp-workspace.mjs', import.meta.url), 'utf8')
    const runner = createRunner()
    value(await runner.init({
      engine,
      nodeId: 'acp-workspace-test',
      environments: [
        {
          id: 'workspace-image',
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
    const subject = { tenantId: 'team', userId: 'alice' }
    let authorized = true
    const resolver = vi.fn<NonNullable<ACPPlatformPolicy['resolveWorkspace']>>(() => Promise.resolve({
      'notes.txt': Buffer.from('authorized document'),
    }))
    try {
      value(await ai.init({
        acp: {
          agents: [
            {
              id: 'fixture',
              name: 'Workspace Fixture',
              mode: 'embedded',
              adapter: 'fixture',
              environmentIds: ['workspace-image'],
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
          preferUserWorker: () => true,
          allowWorkspace: (scope: typeof subject, id: string) => authorized && scope.tenantId === subject.tenantId && scope.userId === subject.userId && id === 'project',
          resolveWorkspace: resolver,
        },
      }))
      const alice = ai.acp.scoped(subject)
      const bob = ai.acp.scoped({ ...subject, userId: 'bob' })
      const request = {
        agentId: 'fixture',
        workspaceId: 'project',
        permissions: { profile: 'read-only' },
      } as const
      expect(value(await alice.plan(request))).toMatchObject({ resolvedMode: 'task', workspaceId: 'project' })
      expect(resolver).not.toHaveBeenCalled()
      expect(await bob.sessions.create(request)).toMatchObject({
        success: false,
        error: { code: HaiAIError.ACP_NOT_FOUND.code },
      })
      expect(await alice.sessions.create({
        ...request,
        execution: { mode: 'user' },
      })).toMatchObject({
        success: false,
        error: { code: HaiAIError.ACP_UNSUPPORTED.code },
      })
      expect(await alice.sessions.create({
        ...request,
        execution: { mode: 'shared' },
      })).toMatchObject({
        success: false,
        error: { code: HaiAIError.ACP_UNSUPPORTED.code },
      })
      expect(resolver).not.toHaveBeenCalled()
      resolver.mockResolvedValueOnce({
        'notes.txt': Buffer.from('authorized document'),
        '../notes.txt': Buffer.from('unsafe path'),
      })
      expect(await alice.sessions.create(request)).toMatchObject({ success: false })
      expect(resolver).toHaveBeenCalledTimes(1)
      const session = value(await alice.sessions.create(request))
      expect(resolver).toHaveBeenCalledTimes(2)
      expect(resolver).toHaveBeenCalledWith(subject, 'project', expect.any(AbortSignal))
      expect(await bob.sessions.get(session.id)).toMatchObject({
        success: false,
        error: { code: HaiAIError.ACP_NOT_FOUND.code },
      })
      expect(value(await session.prompt('inspect workspace', {
        output: { format: 'json' },
      }))).toMatchObject({
        output: {
          json: {
            source: 'authorized document',
            readOnly: true,
            privateCopy: 'authorized document private copy',
            mountHint: true,
          },
        },
      })
      authorized = false
      expect(await session.prompt('inspect again')).toMatchObject({
        success: false,
        error: { code: HaiAIError.ACP_NOT_FOUND.code },
      })
      value(await session.close())
    }
    finally {
      await ai.close()
      value(await runner.close())
    }
  }, 35_000)
})
