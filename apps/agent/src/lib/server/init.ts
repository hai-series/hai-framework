import type { MCPServiceBroker } from '@h-ai/ai'
import type { Server } from 'node:http'
import { once } from 'node:events'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname } from 'node:path'
import { ai, AIConfigSchema } from '@h-ai/ai'
import { cache, CacheConfigSchema } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { iam, IamConfigSchema } from '@h-ai/iam'
import { reldb, ReldbConfigSchema } from '@h-ai/reldb'
import { runner, RunnerConfigSchema } from '@h-ai/runner'
import { storage, StorageConfigSchema } from '@h-ai/storage'
import { vecdb, VecdbConfigSchema } from '@h-ai/vecdb'
import { agentConfigSchema, config, production } from './config.js'
import { initWorkspace, value } from './data.js'
import { allowedTool, createPolicy, jobFiles } from './resources.js'

let broker: MCPServiceBroker | undefined
let server: Server | undefined

export const runtime = core.module.createRuntime([
  {
    name: 'configuration',
    start() {
      core.init({
        configDir: './config',
        configSchemas: {
          agent: agentConfigSchema,
          ai: AIConfigSchema,
          cache: CacheConfigSchema,
          db: ReldbConfigSchema,
          iam: IamConfigSchema,
          runner: RunnerConfigSchema,
          storage: StorageConfigSchema,
          vecdb: VecdbConfigSchema,
        },
      })
      if (production()) {
        const db = ReldbConfigSchema.parse(core.config.get('db'))
        const kv = CacheConfigSchema.parse(core.config.get('cache'))
        const vectors = VecdbConfigSchema.parse(core.config.get('vecdb'))
        const files = StorageConfigSchema.parse(core.config.get('storage'))
        if (db.type !== 'postgresql' || kv.type !== 'redis' || vectors.type !== 'qdrant' || files.type !== 's3')
          throw new Error('Agent deployment requires PostgreSQL, Redis, Qdrant and S3')
      }
    },
    close() {},
  },
  {
    name: 'reldb',
    async start() {
      const db = ReldbConfigSchema.parse(core.config.get('db'))
      if (db.type === 'sqlite' && db.database !== ':memory:')
        await mkdir(dirname(db.database), { recursive: true })
      return reldb.init(db)
    },
    close: () => reldb.close(),
  },
  {
    name: 'cache',
    start: () => cache.init(CacheConfigSchema.parse(core.config.get('cache'))),
    close: () => cache.close(),
  },
  {
    name: 'crypto',
    start: () => crypto.init(),
    close: () => crypto.close(),
  },
  {
    name: 'storage',
    start: () => storage.init(StorageConfigSchema.parse(core.config.get('storage'))),
    close: () => storage.close(),
  },
  {
    name: 'vecdb',
    start: () => vecdb.init(VecdbConfigSchema.parse(core.config.get('vecdb'))),
    close: () => vecdb.close(),
  },
  {
    name: 'iam',
    start: () => iam.init(IamConfigSchema.parse(core.config.get('iam'))),
    close: () => iam.close(),
  },
  {
    name: 'workspace',
    start: initWorkspace,
    close() {},
  },
  {
    name: 'runner',
    start: () => runner.init(RunnerConfigSchema.parse(core.config.get('runner'))),
    close: () => runner.close(),
  },
  {
    name: 'ai',
    start: () => ai.init(AIConfigSchema.parse(core.config.get('ai')), {
      runner,
      acpPolicy: createPolicy(() => broker),
      mcpJobFiles: jobFiles,
    }),
    close: () => ai.close(),
  },
  {
    name: 'mcp-broker',
    async start() {
      const { toolUrl, toolPort } = config()
      if (!toolUrl || !toolPort || !runner.isExecutor)
        return
      broker = value(ai.mcp.services.createBroker({
        url: toolUrl,
        authorize: ({ principal, serviceId, tool, taskId, arguments: args }) => allowedTool(principal, taskId, serviceId, tool, args ?? {}),
      }))
      const active = broker
      server = createServer((request, response) => {
        void active.handleRequest(request, response).catch(() => response.destroy())
      })
      server.listen(toolPort)
      await once(server, 'listening')
    },
    async close() {
      broker?.close()
      broker = undefined
      if (!server)
        return
      const active = server
      server = undefined
      if (active.listening) {
        active.close()
        active.closeAllConnections()
        await once(active, 'close')
      }
    },
  },
])
