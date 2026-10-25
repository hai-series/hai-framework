/** 真实三主节点 Cluster：跨 slot 操作、可移交游标和命名空间。 */
import { lookup } from 'node:dns/promises'
import { createServer } from 'node:net'
import Redis from 'ioredis'
import { GenericContainer, Wait } from 'testcontainers'
import { expect, it } from 'vitest'
import { CacheConfigSchema } from '../src/cache-config.js'
import { HaiCacheError } from '../src/cache-types.js'
import { createMemoryProvider } from '../src/providers/cache-provider-memory.js'
import { createRedisProvider } from '../src/providers/cache-provider-redis.js'

/** 分配空闲端口；容器内外端口相同，使真实 Cluster 公告地址可直接访问。 */
async function reservePorts(): Promise<number[]> {
  const servers: ReturnType<typeof createServer>[] = []
  const ports: number[] = []
  try {
    while (ports.length < 3) {
      const server = createServer()
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
      })
      const address = server.address()
      if (!address || typeof address === 'string')
        throw new Error('No test port')
      if (address.port > 55535) {
        await new Promise<void>(resolve => server.close(() => resolve()))
        continue
      }
      servers.push(server)
      ports.push(address.port)
    }
    return ports
  }
  finally {
    await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  }
}

it('rejects invalid scan inputs for memory without treating zero count as default', async () => {
  const memory = createMemoryProvider()
  await memory.connect({ type: 'memory' })
  try {
    for (const cursor of ['-1', '18446744073709551616', 'c1.invalid'])
      expect(await memory.kv.scan(cursor)).toMatchObject({ success: false, error: { code: HaiCacheError.INVALID_SCAN.code } })
    expect(await memory.kv.scan('0', { count: 0 })).toMatchObject({ success: false, error: { code: HaiCacheError.INVALID_SCAN.code } })
  }
  finally {
    await memory.close()
  }
})

it('scans all masters with transferable cursors and performs independent cross-slot operations', async () => {
  const ports = await reservePorts()
  // 三个真实 Redis 进程共用容器网络；总线使用内部端口，数据端口与主机保持一致。
  // daemonize 返回时监听端口可能尚未就绪；所有节点实际响应后才发布启动标记。
  const start = ports.map(port => `
mkdir -p /tmp/redis-${port}
redis-server --port ${port} --cluster-enabled yes --cluster-config-file /tmp/redis-${port}/nodes.conf --cluster-announce-ip 127.0.0.1 --cluster-announce-port ${port} --cluster-announce-bus-port ${port + 10000} --daemonize yes --logfile /tmp/redis-${port}/redis.log
attempt=0
until [ "$(redis-cli -p ${port} ping 2>/dev/null)" = PONG ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 100 ]; then
    echo "Redis fixture did not become ready on port ${port}" >&2
    exit 1
  fi
  sleep 0.05
done
`).join('\n')
  const container = await new GenericContainer('docker.io/library/redis:7.4.11-alpine')
    .withExposedPorts(...ports.map(port => ({ container: port, host: port })))
    .withCommand(['sh', '-c', `set -eu\n${start}\necho fixture-started; tail -f /dev/null`])
    .withWaitStrategy(Wait.forLogMessage('fixture-started'))
    .start()
  const clients: Redis[] = []
  let rawCluster: InstanceType<typeof Redis.Cluster> | undefined
  const left = createRedisProvider()
  const right = createRedisProvider()
  try {
    const host = (await lookup(container.getHost(), { family: 4 })).address
    // Podman 在本机发布端口；测试不把远程容器主机伪装为本机 Cluster。
    if (host !== '127.0.0.1')
      throw new Error('This local Cluster fixture requires loopback port publishing')
    for (const port of ports) {
      const client = new Redis({ host, port, lazyConnect: true, retryStrategy: () => null, connectTimeout: 1000, commandTimeout: 1000 })
      clients.push(client)
      await client.connect()
    }
    for (const [index, client] of clients.entries()) {
      await client.call('CLUSTER', 'SET-CONFIG-EPOCH', String(index + 1))
      const first = index === 0 ? 0 : index === 1 ? 5461 : 10923
      const last = index === 0 ? 5460 : index === 1 ? 10922 : 16383
      await client.call('CLUSTER', 'ADDSLOTSRANGE', String(first), String(last))
      if (index > 0)
        await clients[0]!.call('CLUSTER', 'MEET', '127.0.0.1', String(ports[index]))
    }
    const deadline = Date.now() + 15000
    while (!(await Promise.all(clients.map(client => client.call('CLUSTER', 'INFO')))).every(info => String(info).includes('cluster_state:ok'))) {
      if (Date.now() > deadline)
        throw new Error('Three-master Cluster did not become ready')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    const config = CacheConfigSchema.parse({ type: 'redis', cluster: [{ host, port: ports[0] }], keyPrefix: 'ns[*]:', maxRetries: 0, connectTimeout: 1000, commandTimeout: 1000 })
    expect((await left.connect(config)).success).toBe(true)
    expect((await right.connect(config)).success).toBe(true)
    expect(await left.kv.compareAndSwap('state', undefined, { version: 1 })).toEqual({ success: true, data: true })
    expect(await right.kv.compareAndSwap('state', { version: 1 }, { version: 2 })).toEqual({ success: true, data: true })
    expect(await left.kv.compareAndSwap('state', { version: 1 }, { version: 3 })).toEqual({ success: true, data: false })
    const expected = Array.from({ length: 90 }, (_, index) => `item:${index}`)
    for (const [index, key] of expected.entries())
      expect((await left.kv.set(key, index)).success).toBe(true)
    // 相似但不同的前缀应被排除，[*] 必须按字面量匹配。
    rawCluster = new Redis.Cluster([{ host, port: ports[0]! }], { lazyConnect: true })
    await rawCluster.connect()
    await rawCluster.set('nsx:other', 'unrelated')
    const found = new Set<string>()
    let cursor = '0'
    let pageCount = 0
    do {
      const provider = pageCount++ % 2 ? left : right
      const page = await provider.kv.scan(cursor, { match: 'item:*', count: 2 })
      if (!page.success)
        throw new Error(page.error.message)
      cursor = page.data[0]
      for (const key of page.data[1]) found.add(key)
      if (cursor !== '0') {
        expect(await provider.kv.scan(cursor, { match: 'other:*' })).toMatchObject({ success: false, error: { code: HaiCacheError.SCAN_TOPOLOGY_CHANGED.code } })
      }
    } while (cursor !== '0')
    expect([...found].sort()).toEqual(expected.sort())
    const all = await left.kv.keys('item:*')
    expect(all.success && all.data.sort()).toEqual(expected.sort())
    expect(await left.kv.mget('item:1', 'missing', 'item:70')).toEqual({ success: true, data: [1, null, 70] })
    expect(await left.kv.exists('item:1', 'missing', 'item:70')).toEqual({ success: true, data: 2 })
    expect((await left.kv.mset([['{atomic}:a', 1], ['{atomic}:b', 2]])).success).toBe(true)
    expect(await left.kv.mset([['cross:a', 1], ['cross:b', 2]])).toMatchObject({ success: false, error: { code: HaiCacheError.CROSS_SLOT.code } })
    expect(await left.kv.mget('cross:a', 'cross:b')).toEqual({ success: true, data: [null, null] })
    expect(await left.set_.sinter('cross:a', 'cross:b')).toMatchObject({ success: false, error: { code: HaiCacheError.CROSS_SLOT.code } })
    expect(await left.kv.del('item:1', 'item:70')).toEqual({ success: true, data: 2 })
    expect(await left.kv.scan('invalid')).toMatchObject({ success: false, error: { code: HaiCacheError.INVALID_SCAN.code } })
  }
  finally {
    rawCluster?.disconnect()
    for (const client of clients) client.disconnect()
    await container.stop()
    await Promise.allSettled([left.close(), right.close()])
  }
}, 120000)
