// 离线查看或重建权限读缓存代次。运维人员负责核实数据库事务已排空。
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { cache, CacheConfigSchema } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { maintainIamReadCacheRevision } from './iam-cache.js'

function fail(code: string | number, traceId?: string) {
  process.stderr.write(`${JSON.stringify({ success: false, code, traceId })}\n`)
  process.exitCode = 1
}

async function main() {
  core.logger.setLevel('fatal')
  try {
    const { values } = parseArgs({
      options: {
        'cache': { type: 'string' },
        'apply': { type: 'boolean' },
        'expect-epoch': { type: 'string' },
        'writers-drained': { type: 'boolean' },
      },
    })
    if (!values.cache || (values.apply
      ? !values['expect-epoch'] || !values['writers-drained']
      : values['expect-epoch'] !== undefined || values['writers-drained'])) {
      return fail('invalid-arguments')
    }

    const input: unknown = JSON.parse(await readFile(values.cache, 'utf8'))
    const config = CacheConfigSchema.safeParse(input)
    if (!config.success || config.data.type === 'memory')
      return fail('invalid-redis-config')

    const connected = await cache.init(config.data)
    if (!connected.success)
      return fail(connected.error.code, connected.error.traceId)
    try {
      const result = await maintainIamReadCacheRevision(values['expect-epoch'])
      if (!result.success)
        return fail(result.error.code, result.error.traceId)
      process.stdout.write(`${JSON.stringify({ success: true, ...result.data })}\n`)
    }
    finally {
      const closed = await cache.close()
      if (!closed.success)
        fail(closed.error.code, closed.error.traceId)
    }
  }
  catch {
    fail('read-cache-maintenance-failed')
  }
}

void main()
