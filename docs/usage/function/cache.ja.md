# @h-ai/cache API リファレンス

<!-- translation: partial -->

[原文（中国語）](cache.md) · [設定](../configuration/cache.ja.md) · [データ構造](../data/cache.ja.md)

<a id="quick-start"></a>

## クイックスタート

利用前に Cache を初期化し、依存するモジュールの終了後に閉じます。値を使う前に結果を確認します。分散ロックの処理はリースが切れる前に安全に終えられる範囲にします。

```ts
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'

const initialized = await cache.init({ type: 'redis', host: 'localhost' })
if (!initialized.success)
  throw new Error(initialized.error.message)
try {
  const written = await cache.kv.set('user:1', { name: 'Alice' }, { ex: 3600 })
  if (!written.success)
    throw new Error(written.error.message)
  const user = await cache.kv.get<{ name: string }>('user:1')
  if (!user.success)
    throw new Error(user.error.message)
  if (user.data)
    core.logger.info('Cached user', { name: user.data.name })
}
finally {
  const closed = await cache.close()
  if (!closed.success)
    core.logger.error('Cache cleanup pending', { code: closed.error.code })
}
```

<a id="api-reference"></a>

## API 一覧

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `cache.init(config)`, `close()` | 方式を選び、終了時に接続などを解放。 | `await cache.init({ type: 'memory' })` |
| `cache.kv.get`, `set`, `mget`, `mset`, `compareAndSwap` | JSON の値を読み書きし、期待値と一致した場合は原子的に置換。 | `await cache.kv.get('session:1')` |
| `cache.kv.del`, `exists`, `type`, `expire`, `expireAt`, `ttl`, `persist` | キーを確認・削除し、有効期限を設定・取得・解除。 | `await cache.kv.ttl('session:1')` |
| `cache.kv.incr`, `incrBy`, `decr`, `decrBy`, `keys`, `scan` | カウンターを更新するかキーを列挙。大規模なストアではカーソルで走査。 | `await cache.kv.incr('count')` |
| `cache.hash.hget`, `hset`, `hdel`, `hexists`, `hgetall`, `hkeys`, `hvals`, `hlen`, `hmget`, `hincrBy` | ハッシュ内の項目を読み書き・削除・集計。 | `await cache.hash.hget('user:1', 'name')` |
| `cache.list.lpush`, `rpush`, `lpop`, `rpop`, `llen`, `lrange`, `lindex`, `lset`, `ltrim`, `blpop`, `brpop` | リストの両端、位置、範囲を操作。待機付き pop は指定時間まで待つ。 | `await cache.list.lrange('jobs', 0, 9)` |
| `cache.set_.sadd`, `srem`, `smembers`, `sismember`, `scard`, `srandmember`, `spop`, `sinter`, `sunion`, `sdiff` | 一意な要素を管理し、集合演算を行う。 | `await cache.set_.smembers('roles')` |
| `cache.zset.zadd`, `zrem`, `zscore`, `zrank`, `zrevrank`, `zrange`, `zrevrange`, `zrangeByScore`, `zcard`, `zcount`, `zincrBy`, `zremRangeByRank`, `zremRangeByScore` | スコアを保存し、順位やスコアで検索・削除。 | `await cache.zset.zrange('scores', 0, 9)` |
| `cache.lock.acquire`, `release`, `isLocked` | 期限付きリースの取得、所有者トークンによる解放、状態確認。 | `await cache.lock.isLocked('daily')` |

未翻訳：残りのコレクション操作、Cluster の走査とロックの例。[中国語の該当節](cache.md#api-reference)を参照してください。
