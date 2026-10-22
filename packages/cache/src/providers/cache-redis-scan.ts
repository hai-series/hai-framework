/** Redis 单节点/Cluster 的无进程游标状态扫描。 */
import type { Cluster, Redis } from 'ioredis'
import type { ScanOptions } from '../cache-types.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { z } from 'zod'

/** 内部校验错误，由 Provider 转换为 HaiResult。 */
export class RedisScanError extends Error {
  constructor(readonly reason: 'invalid' | 'topology') {
    super(`Redis scan ${reason}`)
  }
}

const PositionSchema = z.string().regex(/^\d{1,20}$/).refine(value => BigInt(value) <= 18_446_744_073_709_551_615n)
const ClusterCursorSchema = z.object({
  topology: z.string().regex(/^[a-f0-9]{64}$/),
  node: z.number().int().nonnegative(),
  position: PositionSchema,
})

/** 按连接地址稳定排序，游标不依赖某个应用进程保存状态。 */
function sortedMasters(client: Cluster): Redis[] {
  return client.nodes('master').sort((left, right) => {
    const a = `${left.options.host}:${left.options.port}`
    const b = `${right.options.host}:${right.options.port}`
    return a < b ? -1 : a > b ? 1 : 0
  })
}

/** keyPrefix 为字面量命名空间，不作为 Redis glob 解释。 */
function escapeGlob(prefix: string): string {
  return prefix.replace(/[\\*?[\]]/g, '\\$&')
}

/**
 * 扫描逻辑 key，Cluster 游标携带拓扑指纹和节点位置。
 *
 * @param client - 已连接的 Redis 客户端
 * @param cursor - 首次传 '0'，之后原样传回返回的游标
 * @param options - match/count；一次遍历的 match 必须保持不变
 * @returns 下一游标及去除 keyPrefix 的逻辑 key；'0' 表示遍历结束
 * @throws 无效游标或拓扑变化，由 Provider 边界转换为结构化失败。
 * @example
 * ```ts
 * const [next, keys] = await scanRedisKeys(client, '0', { match: 'users:*' })
 * ```
 */
export async function scanRedisKeys(client: Redis | Cluster, cursor: string, options: ScanOptions = {}): Promise<[string, string[]]> {
  const prefix = client.options.keyPrefix ?? ('redisOptions' in client.options ? client.options.redisOptions?.keyPrefix : '') ?? ''
  const count = options.count ?? 10
  if (!Number.isSafeInteger(count) || count <= 0 || typeof cursor !== 'string' || cursor.length > 1024)
    throw new RedisScanError('invalid')
  const match = options.match ?? '*'
  const pattern = `${escapeGlob(prefix)}${match}`
  let node: Redis
  let position = cursor
  let state: z.infer<typeof ClusterCursorSchema> | undefined
  let masters: Redis[] = []
  if ('nodes' in client) {
    masters = sortedMasters(client)
    const topology = createHash('sha256').update(JSON.stringify({
      nodes: masters.map(master => [master.options.host, master.options.port]),
      // slot 所有者变化也使旧游标失效，避免无提示地跳过迁移数据。
      slots: client.slots.map(nodes => nodes[0]),
      prefix,
      match,
    })).digest('hex')
    if (cursor === '0') {
      state = { topology, node: 0, position: '0' }
    }
    else {
      if (!cursor.startsWith('c1.'))
        throw new RedisScanError('invalid')
      try {
        state = ClusterCursorSchema.parse(JSON.parse(Buffer.from(cursor.slice(3), 'base64url').toString('utf8')))
      }
      catch {
        throw new RedisScanError('invalid')
      }
      if (state.topology !== topology)
        throw new RedisScanError('topology')
    }
    if (masters.length === 0 || state.node >= masters.length)
      throw new RedisScanError('topology')
    node = masters[state.node]!
    position = state.position
  }
  else {
    if (!PositionSchema.safeParse(cursor).success)
      throw new RedisScanError('invalid')
    node = client
  }
  const [nextPosition, keys] = await node.scan(position, 'MATCH', pattern, 'COUNT', count)
  const logicalKeys = keys.filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length))
  if (!state)
    return [nextPosition, logicalKeys]
  if (nextPosition === '0') {
    state.node++
    state.position = '0'
    if (state.node >= masters.length)
      return ['0', logicalKeys]
  }
  else {
    state.position = nextPosition
  }
  return [`c1.${Buffer.from(JSON.stringify(state)).toString('base64url')}`, logicalKeys]
}
