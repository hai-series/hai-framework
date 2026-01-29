/**
 * =============================================================================
 * @hai/cache - Redis 容器化测试
 * =============================================================================
 *
 * 使用 testcontainers 进行 Redis 集成测试。
 * 测试需要 Docker 环境。
 *
 * 运行方式：
 *   pnpm test:container
 *
 * =============================================================================
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { GenericContainer, StartedTestContainer } from 'testcontainers'
import { cache, CacheErrorCode } from '../src/index.js'

describe('@hai/cache - Redis (容器化测试)', () => {
    let container: StartedTestContainer

    beforeAll(async () => {
        // 启动 Redis 容器
        container = await new GenericContainer('redis:alpine')
            .withExposedPorts(6379)
            .start()

        const host = container.getHost()
        const port = container.getMappedPort(6379)

        // 初始化缓存连接
        const result = await cache.init({
            type: 'redis',
            host,
            port,
            silent: true,
        })

        expect(result.success).toBe(true)
    }, 120000) // 2 分钟超时

    afterAll(async () => {
        await cache.close()
        if (container) {
            await container.stop()
        }
    })

    // =========================================================================
    // 初始化测试
    // =========================================================================

    describe('初始化', () => {
        it('应该正确初始化', () => {
            expect(cache.isInitialized).toBe(true)
            expect(cache.config?.type).toBe('redis')
        })

        it('ping 应该返回 PONG', async () => {
            const result = await cache.ping()
            expect(result.success).toBe(true)
            expect(result.data).toBe('PONG')
        })
    })

    // =========================================================================
    // 基础操作测试
    // =========================================================================

    describe('基础操作', () => {
        beforeEach(async () => {
            // 清理测试键
            await cache.del('test:key', 'test:counter', 'test:obj')
        })

        it('set/get - 应该设置和获取字符串', async () => {
            const setResult = await cache.set('test:key', 'hello')
            expect(setResult.success).toBe(true)

            const getResult = await cache.get<string>('test:key')
            expect(getResult.success).toBe(true)
            expect(getResult.data).toBe('hello')
        })

        it('set/get - 应该设置和获取对象', async () => {
            const user = { name: '张三', age: 25 }
            await cache.set('test:obj', user)

            const result = await cache.get<typeof user>('test:obj')
            expect(result.success).toBe(true)
            expect(result.data).toEqual(user)
        })

        it('set - 应该支持过期时间', async () => {
            await cache.set('test:key', 'value', { ex: 10 })

            const ttlResult = await cache.ttl('test:key')
            expect(ttlResult.success).toBe(true)
            expect(ttlResult.data).toBeGreaterThan(0)
            expect(ttlResult.data).toBeLessThanOrEqual(10)
        })

        it('get - 不存在的键应该返回 null', async () => {
            const result = await cache.get('nonexistent')
            expect(result.success).toBe(true)
            expect(result.data).toBeNull()
        })

        it('del - 应该删除键', async () => {
            await cache.set('test:key', 'value')
            const delResult = await cache.del('test:key')
            expect(delResult.success).toBe(true)
            expect(delResult.data).toBe(1)

            const getResult = await cache.get('test:key')
            expect(getResult.data).toBeNull()
        })

        it('exists - 应该检查键是否存在', async () => {
            await cache.set('test:key', 'value')

            const existsResult = await cache.exists('test:key')
            expect(existsResult.success).toBe(true)
            expect(existsResult.data).toBe(1)

            const notExistsResult = await cache.exists('nonexistent')
            expect(notExistsResult.data).toBe(0)
        })

        it('incr/decr - 应该自增和自减', async () => {
            await cache.set('test:counter', 10)

            const incrResult = await cache.incr('test:counter')
            expect(incrResult.data).toBe(11)

            const decrResult = await cache.decr('test:counter')
            expect(decrResult.data).toBe(10)

            const incrByResult = await cache.incrBy('test:counter', 5)
            expect(incrByResult.data).toBe(15)

            const decrByResult = await cache.decrBy('test:counter', 3)
            expect(decrByResult.data).toBe(12)
        })

        it('mget/mset - 应该批量操作', async () => {
            await cache.mset([
                ['test:k1', 'v1'],
                ['test:k2', 'v2'],
                ['test:k3', 'v3'],
            ])

            const result = await cache.mget<string>('test:k1', 'test:k2', 'test:k3')
            expect(result.success).toBe(true)
            expect(result.data).toEqual(['v1', 'v2', 'v3'])

            // 清理
            await cache.del('test:k1', 'test:k2', 'test:k3')
        })
    })

    // =========================================================================
    // Hash 操作测试
    // =========================================================================

    describe('Hash 操作', () => {
        const hashKey = 'test:hash'

        beforeEach(async () => {
            await cache.del(hashKey)
        })

        it('hset/hget - 应该设置和获取字段', async () => {
            await cache.hash.hset(hashKey, 'name', '张三')
            await cache.hash.hset(hashKey, 'age', 25)

            const nameResult = await cache.hash.hget<string>(hashKey, 'name')
            expect(nameResult.data).toBe('张三')

            const ageResult = await cache.hash.hget<number>(hashKey, 'age')
            expect(ageResult.data).toBe(25)
        })

        it('hset - 应该支持对象批量设置', async () => {
            await cache.hash.hset(hashKey, { name: '李四', email: 'li@test.com' })

            const result = await cache.hash.hgetall(hashKey)
            expect(result.data).toEqual({ name: '李四', email: 'li@test.com' })
        })

        it('hdel - 应该删除字段', async () => {
            await cache.hash.hset(hashKey, { a: 1, b: 2, c: 3 })

            const delResult = await cache.hash.hdel(hashKey, 'a', 'b')
            expect(delResult.data).toBe(2)

            const keysResult = await cache.hash.hkeys(hashKey)
            expect(keysResult.data).toEqual(['c'])
        })

        it('hexists - 应该检查字段是否存在', async () => {
            await cache.hash.hset(hashKey, 'field', 'value')

            const existsResult = await cache.hash.hexists(hashKey, 'field')
            expect(existsResult.data).toBe(true)

            const notExistsResult = await cache.hash.hexists(hashKey, 'nonexistent')
            expect(notExistsResult.data).toBe(false)
        })

        it('hincrBy - 应该自增字段值', async () => {
            await cache.hash.hset(hashKey, 'count', 10)

            const result = await cache.hash.hincrBy(hashKey, 'count', 5)
            expect(result.data).toBe(15)
        })
    })

    // =========================================================================
    // List 操作测试
    // =========================================================================

    describe('List 操作', () => {
        const listKey = 'test:list'

        beforeEach(async () => {
            await cache.del(listKey)
        })

        it('lpush/rpush - 应该从两端推入元素', async () => {
            await cache.list.rpush(listKey, 'a', 'b')
            await cache.list.lpush(listKey, 'c')

            const result = await cache.list.lrange<string>(listKey, 0, -1)
            expect(result.data).toEqual(['c', 'a', 'b'])
        })

        it('lpop/rpop - 应该从两端弹出元素', async () => {
            await cache.list.rpush(listKey, 'a', 'b', 'c')

            const lpopResult = await cache.list.lpop<string>(listKey)
            expect(lpopResult.data).toBe('a')

            const rpopResult = await cache.list.rpop<string>(listKey)
            expect(rpopResult.data).toBe('c')
        })

        it('llen - 应该返回列表长度', async () => {
            await cache.list.rpush(listKey, 'a', 'b', 'c')

            const result = await cache.list.llen(listKey)
            expect(result.data).toBe(3)
        })

        it('lindex/lset - 应该按索引操作', async () => {
            await cache.list.rpush(listKey, 'a', 'b', 'c')

            const indexResult = await cache.list.lindex<string>(listKey, 1)
            expect(indexResult.data).toBe('b')

            await cache.list.lset(listKey, 1, 'B')

            const updatedResult = await cache.list.lindex<string>(listKey, 1)
            expect(updatedResult.data).toBe('B')
        })
    })

    // =========================================================================
    // Set 操作测试
    // =========================================================================

    describe('Set 操作', () => {
        const setKey = 'test:set'

        beforeEach(async () => {
            await cache.del(setKey, 'test:set2')
        })

        it('sadd/smembers - 应该添加和获取成员', async () => {
            await cache.set_.sadd(setKey, 'a', 'b', 'c')

            const result = await cache.set_.smembers<string>(setKey)
            expect(result.data?.sort()).toEqual(['a', 'b', 'c'])
        })

        it('srem - 应该移除成员', async () => {
            await cache.set_.sadd(setKey, 'a', 'b', 'c')
            await cache.set_.srem(setKey, 'b')

            const result = await cache.set_.smembers<string>(setKey)
            expect(result.data?.sort()).toEqual(['a', 'c'])
        })

        it('sismember - 应该检查成员是否存在', async () => {
            await cache.set_.sadd(setKey, 'a', 'b')

            const isMemberResult = await cache.set_.sismember(setKey, 'a')
            expect(isMemberResult.data).toBe(true)

            const notMemberResult = await cache.set_.sismember(setKey, 'z')
            expect(notMemberResult.data).toBe(false)
        })

        it('scard - 应该返回成员数量', async () => {
            await cache.set_.sadd(setKey, 'a', 'b', 'c')

            const result = await cache.set_.scard(setKey)
            expect(result.data).toBe(3)
        })

        it('sinter/sunion/sdiff - 应该支持集合运算', async () => {
            await cache.set_.sadd(setKey, 'a', 'b', 'c')
            await cache.set_.sadd('test:set2', 'b', 'c', 'd')

            const interResult = await cache.set_.sinter<string>(setKey, 'test:set2')
            expect(interResult.data?.sort()).toEqual(['b', 'c'])

            const unionResult = await cache.set_.sunion<string>(setKey, 'test:set2')
            expect(unionResult.data?.sort()).toEqual(['a', 'b', 'c', 'd'])

            const diffResult = await cache.set_.sdiff<string>(setKey, 'test:set2')
            expect(diffResult.data).toEqual(['a'])
        })
    })

    // =========================================================================
    // SortedSet 操作测试
    // =========================================================================

    describe('SortedSet 操作', () => {
        const zsetKey = 'test:zset'

        beforeEach(async () => {
            await cache.del(zsetKey)
        })

        it('zadd/zrange - 应该添加和获取成员', async () => {
            await cache.zset.zadd(zsetKey, { score: 1, member: 'a' }, { score: 2, member: 'b' }, { score: 3, member: 'c' })

            const result = await cache.zset.zrange(zsetKey, 0, -1)
            expect(result.data).toEqual(['a', 'b', 'c'])
        })

        it('zrange - 应该支持返回分数', async () => {
            await cache.zset.zadd(zsetKey, { score: 100, member: 'player1' }, { score: 200, member: 'player2' })

            const result = await cache.zset.zrange(zsetKey, 0, -1, true)
            expect(result.data).toEqual([
                { member: 'player1', score: 100 },
                { member: 'player2', score: 200 },
            ])
        })

        it('zrevrange - 应该返回逆序', async () => {
            await cache.zset.zadd(zsetKey, { score: 1, member: 'a' }, { score: 2, member: 'b' }, { score: 3, member: 'c' })

            const result = await cache.zset.zrevrange(zsetKey, 0, -1)
            expect(result.data).toEqual(['c', 'b', 'a'])
        })

        it('zscore - 应该返回成员分数', async () => {
            await cache.zset.zadd(zsetKey, { score: 100, member: 'player1' })

            const result = await cache.zset.zscore(zsetKey, 'player1')
            expect(result.data).toBe(100)
        })

        it('zrank/zrevrank - 应该返回排名', async () => {
            await cache.zset.zadd(zsetKey, { score: 1, member: 'a' }, { score: 2, member: 'b' }, { score: 3, member: 'c' })

            const rankResult = await cache.zset.zrank(zsetKey, 'b')
            expect(rankResult.data).toBe(1) // 0-based

            const revrankResult = await cache.zset.zrevrank(zsetKey, 'b')
            expect(revrankResult.data).toBe(1)
        })

        it('zincrBy - 应该增加分数', async () => {
            await cache.zset.zadd(zsetKey, { score: 100, member: 'player1' })

            const result = await cache.zset.zincrBy(zsetKey, 50, 'player1')
            expect(result.data).toBe(150)
        })

        it('zrem - 应该移除成员', async () => {
            await cache.zset.zadd(zsetKey, { score: 1, member: 'a' }, { score: 2, member: 'b' }, { score: 3, member: 'c' })

            await cache.zset.zrem(zsetKey, 'b')

            const result = await cache.zset.zrange(zsetKey, 0, -1)
            expect(result.data).toEqual(['a', 'c'])
        })

        it('zcard - 应该返回成员数量', async () => {
            await cache.zset.zadd(zsetKey, { score: 1, member: 'a' }, { score: 2, member: 'b' })

            const result = await cache.zset.zcard(zsetKey)
            expect(result.data).toBe(2)
        })
    })

    // =========================================================================
    // 未初始化测试
    // =========================================================================
})

describe('@hai/cache - 未初始化', () => {
    it('未初始化时操作应该返回错误', async () => {
        await cache.close()

        const result = await cache.get('key')
        expect(result.success).toBe(false)
        expect(result.error?.code).toBe(CacheErrorCode.NOT_INITIALIZED)

        const hashResult = await cache.hash.hget('key', 'field')
        expect(hashResult.success).toBe(false)
        expect(hashResult.error?.code).toBe(CacheErrorCode.NOT_INITIALIZED)
    })
})
