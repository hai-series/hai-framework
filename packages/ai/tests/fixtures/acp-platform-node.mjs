import process from 'node:process'
import { ai } from '@h-ai/ai'
import { reldb } from '@h-ai/reldb'
import { createRunner } from '@h-ai/runner'
import { vecdb } from '@h-ai/vecdb'

const runner = createRunner()
const sessions = new Map()
let shutdown
const alice = () => ai.acp.scoped({ tenantId: 'studio', userId: 'alice' })
const bob = () => ai.acp.scoped({ tenantId: 'studio', userId: 'bob' })
const request = {
  agentId: 'fixture',
  execution: { mode: 'task' },
}

function take(result) {
  if (!result?.success)
    throw new Error(result?.error.code ?? 'Missing lifecycle result')
  return result.data
}

const methods = {
  async init({ database, vectorDirectory, engine, nodeId, executor, image, script }) {
    take(await reldb.init(database))
    take(await vecdb.init({ type: 'lancedb', path: vectorDirectory }))
    take(await runner.init({
      engine,
      nodeId,
      executor,
      environments: [
        {
          id: 'fixture',
          image,
          resources: {
            cpu: 0.5,
            memoryMiB: 128,
            pids: 32,
            scratchMiB: 16,
          },
        },
      ],
    }))
    take(await ai.init({
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
          configure: () => ({
            command: 'node',
            args: ['/state/fixture.mjs'],
            env: {},
            files: { 'fixture.mjs': script },
          }),
        },
      },
      acpPolicy: {
        resolvePermission: (_scope, _session, tool) => tool.kind === 'read'
          ? { key: 'read:fixture', summary: 'Read fixture' }
          : undefined,
      },
    }))
    return { isExecutor: runner.isExecutor }
  },
  async run() {
    return alice().run({ ...request, prompt: 'cross-node', idempotencyKey: 'stable' })
  },
  async open() {
    const session = take(await alice().sessions.create(request))
    sessions.set(session.id, session)
    return session.id
  },
  async prompt({ sessionId, prompt }, notify) {
    const session = sessions.get(sessionId) ?? take(await alice().sessions.get(sessionId))
    return session.prompt(prompt, { onEvent: notify })
  },
  async events({ taskId, cursor }) {
    return alice().tasks.events(taskId, cursor)
  },
  async get({ taskId }) {
    return alice().tasks.get(taskId)
  },
  async unauthorized({ taskId }) {
    return bob().tasks.get(taskId)
  },
  async cancel({ taskId }) {
    return alice().tasks.cancel(taskId)
  },
  async end({ sessionId }) {
    const session = take(await alice().sessions.get(sessionId))
    return take(await session.close())
  },
  close() {
    shutdown ??= (async () => {
      try {
        await ai.close()
      }
      finally {
        try {
          take(await runner.close())
        }
        finally {
          const results = [await vecdb.close(), await reldb.close()]
          results.forEach(take)
        }
      }
    })()
    return shutdown
  },
}

process.on('message', async ({ id, method, input }) => {
  try {
    const output = await methods[method](input, event => process.send?.({ id, event }))
    process.send?.({ id, output })
  }
  catch (error) {
    process.send?.({
      id,
      error: error instanceof Error
        ? `${method}: ${error.message}`
        : 'fixture failed',
    })
  }
})

process.on('disconnect', () => {
  void methods.close().then(() => process.exit(0), () => process.exit(1))
})
