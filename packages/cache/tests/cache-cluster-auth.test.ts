/** @h-ai/cache — 真实 Redis Cluster 数据节点鉴权回归。 */
import { lookup } from 'node:dns/promises'
import Redis from 'ioredis'
import { GenericContainer, Wait } from 'testcontainers'
import { expect, it } from 'vitest'
import { CacheConfigSchema } from '../src/cache-config.js'
import { createRedisProvider } from '../src/providers/cache-provider-redis.js'

it('cluster password reaches discovered data nodes and wrong passwords fail', async () => {
  const password = 'test-only-cluster-password'
  const container = await new GenericContainer('docker.io/library/redis:7.4.11-alpine')
    .withExposedPorts(6379)
    .withCommand(['redis-server', '--cluster-enabled', 'yes', '--cluster-config-file', 'nodes.conf', '--requirepass', password])
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .start()
  const good = createRedisProvider()
  const bad = createRedisProvider()
  const urlProvider = createRedisProvider()
  let setupClient: Redis | undefined
  try {
    const host = container.getHost()
    const port = container.getMappedPort(6379)
    const address = (await lookup(host, { family: 4 })).address
    // 通过真实网络配置节点；避免 Podman Docker API 的 exec 流等待影响测试结束。
    setupClient = new Redis({ host, port, password, lazyConnect: true, retryStrategy: () => null, connectTimeout: 1000, commandTimeout: 1000 })
    await setupClient.connect()
    const command = async (...args: string[]) => {
      const [name, ...parameters] = args
      return String(await setupClient!.call(name!, ...parameters))
    }
    await command('CONFIG', 'SET', 'cluster-announce-ip', address)
    await command('CONFIG', 'SET', 'cluster-announce-port', String(port))
    await command('CLUSTER', 'ADDSLOTSRANGE', '0', '16383')
    const deadline = Date.now() + 10000
    while (!(await command('CLUSTER', 'INFO')).includes('cluster_state:ok')) {
      if (Date.now() > deadline)
        throw new Error('Cluster did not become ready')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    // Podman 仅发布 IPv4；避免 localhost 的 IPv6 解析把测试变成不可达地址验证。
    const config = CacheConfigSchema.parse({ type: 'redis', cluster: [{ host: address, port }], password, maxRetries: 0, connectTimeout: 1000, commandTimeout: 1000 })
    expect(await good.connect(config)).toEqual({ success: true, data: undefined })
    expect((await good.kv.set('auth-probe', 'value')).success).toBe(true)
    expect(await good.kv.get('auth-probe')).toEqual({ success: true, data: 'value' })
    expect((await urlProvider.connect(CacheConfigSchema.parse({ type: 'redis', url: `redis://:${password}@${host}:${port}`, password: 'ignored-password' }))).success).toBe(true)
    expect((await bad.connect({ ...config, password: 'wrong-test-password' })).success).toBe(false)
  }
  finally {
    try {
      setupClient?.disconnect()
      await container.stop()
    }
    finally {
      await Promise.allSettled([good.close(), bad.close(), urlProvider.close()])
    }
  }
}, 120000)
