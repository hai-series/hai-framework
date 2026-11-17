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

<a id="api-一覧"></a>

<a id="api-reference"></a>

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

モジュールの import は入門例と同じです。開始・終了の例以外は初期化成功後、終了前に実行します。value は HaiResult.success を確認し元エラーを保持します。独立したテストデータと明示した後片付けを使います。

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="connection"></a>

### 接続と終了：`cache`

起動時にバックエンドを選び、正常な接続を確認してから使用します。終了時は依存モジュールから先に閉じます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `cache.init` | 按配置创建进程内缓存或连接 Redis | `config`（必填） | `Promise<HaiResult<void>>` | `await cache.init({ type: 'memory' })` |
| `cache.close` | 释放缓存实例。用内存模式时，关闭后该实例中的值不再可用 | 无 | `Promise<HaiResult<void>>` | `await cache.close()` |
| `cache.ping` | 接続を確認 | 无参数 | `string` | `await cache.ping()` |
| `cache.config` | 現在のマスク済み設定を取得 | 読み取り専用プロパティ、引数なし | `CacheConfig \| null` | `cache.config` |
| `cache.isInitialized` | キャッシュ操作が利用できるか確認 | 読み取り専用プロパティ、引数なし | `boolean` | `cache.isInitialized` |

#### 利用例：接続と終了

```ts
value(await cache.init({ type: 'memory' }))
value(await cache.ping()) // 'PONG'
cache.isInitialized // true
cache.config?.type // 'memory'
value(await cache.close()) // undefined; the memory instance is released
```

開発用の memory 設定では ping は `PONG` を返します。終了時に業務データは返さず、メモリ上の記録を解放します。次の例では再初期化してください。

未翻訳：残りのコレクション操作、Cluster の走査とロックの例。[中国語の該当節](cache.md#api-reference)を参照してください。

[引数と手順の詳細](cache.md#connection)

<a id="values"></a>

### 値・カウンター・期限の管理：`cache.kv`

業務用のキーにシリアライズ可能な値を保存します。比較と交換では読み取り後に変更された値の上書きを防げます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `cache.kv.get` | 値を取得 | key | `T \| null` | `await cache.kv.get('u:1')` |
| `cache.kv.set` | 有効期限・条件付きで保存 | key, value, options | `boolean` | `await cache.kv.set('u:1', { name: 'Alice' }, { ex: 60 })` |
| `cache.kv.mget` | 入力順に一括取得 | keys | `(T \| null)[]` | `await cache.kv.mget('u:1', 'u:2')` |
| `cache.kv.mset` | 複数の値を一括保存 | entries | `void` | `await cache.kv.mset([['u:1', { name: 'Alice' }]])` |
| `cache.kv.compareAndSwap` | 現在値が一致する場合のみ更新 | key, expected, value, options | `boolean` | `await cache.kv.compareAndSwap('version', 1, 2)` |
| `cache.kv.del` | 指定キーを削除 | keys | `number` | `await cache.kv.del('u:1', 'u:2')` |
| `cache.kv.exists` | 存在するキーを数える | keys | `number` | `await cache.kv.exists('u:1', 'u:2')` |
| `cache.kv.type` | 保存したデータ型を確認 | key | `string` | `await cache.kv.type('u:1')` |
| `cache.kv.expire` | 現在からの有効秒数を設定 | key, seconds | `boolean` | `await cache.kv.expire('u:1', 60)` |
| `cache.kv.expireAt` | 絶対有効期限を設定 | key, timestamp | `boolean` | `await cache.kv.expireAt('u:1', Math.floor(Date.now() / 1000) + 60)` |
| `cache.kv.ttl` | 残り有効秒数を取得 | key | `number` | `await cache.kv.ttl('u:1')` |
| `cache.kv.persist` | 有効期限を解除 | key | `boolean` | `await cache.kv.persist('u:1')` |
| `cache.kv.incr` | 1増やす | key | `number` | `await cache.kv.incr('hits')` |
| `cache.kv.incrBy` | 指定量を加算 | key, increment | `number` | `await cache.kv.incrBy('hits', 2)` |
| `cache.kv.decr` | 1減らす | key | `number` | `await cache.kv.decr('stock')` |
| `cache.kv.decrBy` | 指定量を減算 | key, decrement | `number` | `await cache.kv.decrBy('stock', 2)` |
| `cache.kv.keys` | パターンに一致するキーを列挙 | pattern | `string[]` | `await cache.kv.keys('u:*')` |
| `cache.kv.scan` | 一致するキーを分割して走査 | cursor, options | `[string, string[]]` | `await cache.kv.scan('0', { match: 'u:*', count: 100 })` |

#### 利用例：値・カウンター・期限の管理

```ts
value(await cache.kv.set('demo:user:1', { name: 'Ada' }, { ex: 60 })) // true
value(await cache.kv.get('demo:user:1')) // { name: 'Ada' }
value(await cache.kv.mset([['demo:user:2', { name: 'Lin' }]])) // undefined
value(await cache.kv.mget('demo:user:1', 'demo:user:2')) // [{ name: 'Ada' }, { name: 'Lin' }]
value(await cache.kv.compareAndSwap('demo:revision', undefined, 1, { px: 60_000 })) // true
value(await cache.kv.compareAndSwap('demo:revision', 0, 2)) // false; revision stays 1
value(await cache.kv.exists('demo:user:1', 'demo:missing')) // 1
value(await cache.kv.type('demo:user:1')) // 'string' (JSON value)
value(await cache.kv.expire('demo:user:1', 120)) // true
value(await cache.kv.expireAt('demo:user:2', Math.floor(Date.now() / 1000) + 120)) // true
value(await cache.kv.ttl('demo:user:1')) // about 120 seconds
value(await cache.kv.persist('demo:user:1')) // true
value(await cache.kv.ttl('demo:user:1')) // -1
value(await cache.kv.incr('demo:hits')) // 1
value(await cache.kv.incrBy('demo:hits', 4)) // 5
value(await cache.kv.decr('demo:hits')) // 4
value(await cache.kv.decrBy('demo:hits', 2)) // 2
value(await cache.kv.keys('demo:user:*')) // the two user keys, order is backend-dependent
let cursor = '0'
do {
  const page = value(await cache.kv.scan(cursor, { match: 'demo:user:*', count: 100 }))
  cursor = page[0] // use the returned cursor, not a page number
  const keys = page[1] // a batch of matching keys; duplicates are possible
} while (cursor !== '0')
value(await cache.kv.del('demo:user:1', 'demo:user:2')) // 2
value(await cache.kv.get('demo:user:1')) // null
```

新しい `demo:*` キーを使い、並行書き込みなしで順に実行します。CAS の不一致は成功データ `false` です。TTL は残り秒数で、`-1` は無期限、`-2` は不存在です。scan の件数は目安で、重複する場合があります。

[引数と手順の詳細](cache.md#values)

<a id="hashes"></a>

### フィールド単位の更新：`cache.hash`

オブジェクト全体を置き換えず、一つのフィールドを更新する場合に使います。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `cache.hash.hget` | フィールドを取得 | key, field | `T \| null` | `await cache.hash.hget('u:1', 'name')` |
| `cache.hash.hset` | フィールドを保存 | key, field, value | `number` | `await cache.hash.hset('u:1', 'name', 'Alice')` |
| `cache.hash.hdel` | 指定フィールドを削除 | key, fields | `number` | `await cache.hash.hdel('u:1', 'name')` |
| `cache.hash.hexists` | フィールドの存在確認 | key, field | `boolean` | `await cache.hash.hexists('u:1', 'name')` |
| `cache.hash.hgetall` | 全フィールドを取得 | key | `T` | `await cache.hash.hgetall('u:1')` |
| `cache.hash.hkeys` | フィールド名を列挙 | key | `string[]` | `await cache.hash.hkeys('u:1')` |
| `cache.hash.hvals` | フィールド値を列挙 | key | `T[]` | `await cache.hash.hvals('u:1')` |
| `cache.hash.hlen` | フィールド数を取得 | key | `number` | `await cache.hash.hlen('u:1')` |
| `cache.hash.hmget` | 入力順に複数フィールドを取得 | key, fields | `(T \| null)[]` | `await cache.hash.hmget('u:1', 'name', 'age')` |
| `cache.hash.hincrBy` | 数値フィールドに加算 | key, field, increment | `number` | `await cache.hash.hincrBy('u:1', 'visits', 1)` |

#### 利用例：フィールド単位の更新

```ts
value(await cache.hash.hset('demo:profile', 'name', 'Ada')) // 1 new field
value(await cache.hash.hget('demo:profile', 'name')) // 'Ada'
value(await cache.hash.hexists('demo:profile', 'name')) // true
value(await cache.hash.hincrBy('demo:profile', 'visits', 1)) // 1
value(await cache.hash.hmget('demo:profile', 'name', 'missing')) // ['Ada', null]
value(await cache.hash.hgetall('demo:profile')) // { name: 'Ada', visits: 1 }
value(await cache.hash.hkeys('demo:profile')) // 'name' and 'visits'; order may vary
value(await cache.hash.hvals('demo:profile')) // 'Ada' and 1; order may vary
value(await cache.hash.hlen('demo:profile')) // 2
value(await cache.hash.hdel('demo:profile', 'name')) // 1
```

一つの資料キーと二つのフィールドを入力します。追加数・存在判定・読み取った値は各行に示しています。存在しないフィールドは null です。

[引数と手順の詳細](cache.md#hashes)

<a id="lists"></a>

### 順序付きの読み書き：`cache.list`

リストは順序を保持し、両端から追加・取り出しできます。ブロッキング取り出しは値の到着か期限まで待ちます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `cache.list.lpush` | 左端に追加 | key, values | `number` | `await cache.list.lpush('jobs', 'job-1')` |
| `cache.list.rpush` | 右端に追加 | key, values | `number` | `await cache.list.rpush('jobs', 'job-2')` |
| `cache.list.lpop` | 左端から取り出す | key | `T \| null` | `await cache.list.lpop('jobs')` |
| `cache.list.rpop` | 右端から取り出す | key | `T \| null` | `await cache.list.rpop('jobs')` |
| `cache.list.llen` | リスト長を取得 | key | `number` | `await cache.list.llen('jobs')` |
| `cache.list.lrange` | 両端を含む範囲を取得 | key, start, stop | `T[]` | `await cache.list.lrange('jobs', 0, 9)` |
| `cache.list.lindex` | 指定位置の値を取得 | key, index | `T \| null` | `await cache.list.lindex('jobs', 0)` |
| `cache.list.lset` | 指定位置の値を置換 | key, index, value | `void` | `await cache.list.lset('jobs', 0, 'replacement')` |
| `cache.list.ltrim` | 指定範囲だけを残す | key, start, stop | `void` | `await cache.list.ltrim('jobs', 0, 99)` |
| `cache.list.blpop` | 左端の値を待って取得 | timeout, keys | `[string, T] \| null` | `await cache.list.blpop(5, 'jobs')` |
| `cache.list.brpop` | 右端の値を待って取得 | timeout, keys | `[string, T] \| null` | `await cache.list.brpop(5, 'jobs')` |

#### 利用例：順序付きの読み書き

```ts
value(await cache.list.rpush('demo:jobs', 'b', 'c')) // 2
value(await cache.list.lpush('demo:jobs', 'a')) // 3
value(await cache.list.llen('demo:jobs')) // 3
value(await cache.list.lrange('demo:jobs', 0, -1)) // ['a', 'b', 'c']
value(await cache.list.lindex('demo:jobs', 1)) // 'b'
value(await cache.list.lset('demo:jobs', 1, 'B')) // undefined
value(await cache.list.ltrim('demo:jobs', 0, 1)) // undefined; ['a', 'B'] remains
value(await cache.list.lpop('demo:jobs')) // 'a'
value(await cache.list.rpop('demo:jobs')) // 'B'
value(await cache.list.rpush('demo:jobs', 'd', 'e')) // 2
value(await cache.list.blpop(1, 'demo:jobs')) // ['demo:jobs', 'd']
value(await cache.list.brpop(1, 'demo:jobs')) // ['demo:jobs', 'e']
value(await cache.list.lpop('demo:jobs')) // null
```

空のリストから始めます。範囲の終端を含み、`-1` は末尾です。ここでは値があるので即時にキーと値を返します。空の場合は指定秒数待ち、期限後に null を返します。

[引数と手順の詳細](cache.md#lists)

<a id="sets"></a>

### 重複排除と集合の比較：`cache.set_`

存在判定・統合・比較には集合を使います。メンバーの順序は定まりません。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `cache.set_.sadd` | 重複を除いて追加 | key, members | `number` | `await cache.set_.sadd('roles', 'editor')` |
| `cache.set_.srem` | 指定要素を削除 | key, members | `number` | `await cache.set_.srem('roles', 'editor')` |
| `cache.set_.smembers` | 全要素を取得 | key | `T[]` | `await cache.set_.smembers('roles')` |
| `cache.set_.sismember` | 要素が含まれるか確認 | key, member | `boolean` | `await cache.set_.sismember('roles', 'editor')` |
| `cache.set_.scard` | 要素数を取得 | key | `number` | `await cache.set_.scard('roles')` |
| `cache.set_.srandmember` | 削除せず無作為に取得 | key, count | `T \| T[] \| null` | `await cache.set_.srandmember('roles', 2)` |
| `cache.set_.spop` | 無作為に取り出す | key, count | `T \| T[] \| null` | `await cache.set_.spop('roles', 1)` |
| `cache.set_.sinter` | 共通要素を取得 | keys | `T[]` | `await cache.set_.sinter('roles:a', 'roles:b')` |
| `cache.set_.sunion` | 全体の和集合を取得 | keys | `T[]` | `await cache.set_.sunion('roles:a', 'roles:b')` |
| `cache.set_.sdiff` | 最初の集合から差集合を取得 | keys | `T[]` | `await cache.set_.sdiff('roles:a', 'roles:b')` |

#### 利用例：重複排除と集合の比較

```ts
value(await cache.set_.sadd('demo:roles:a', 'reader', 'editor')) // 2
value(await cache.set_.sadd('demo:roles:b', 'editor', 'owner')) // 2
value(await cache.set_.sismember('demo:roles:a', 'reader')) // true
value(await cache.set_.scard('demo:roles:a')) // 2
value(await cache.set_.smembers('demo:roles:a')) // reader, editor
value(await cache.set_.sinter('demo:roles:a', 'demo:roles:b')) // ['editor']
value(await cache.set_.sunion('demo:roles:a', 'demo:roles:b')) // reader, editor, owner
value(await cache.set_.sdiff('demo:roles:a', 'demo:roles:b')) // ['reader']
value(await cache.set_.srandmember('demo:roles:a', 1)) // one-member array; set unchanged
value(await cache.set_.spop('demo:roles:b', 1)) // one-member array; chosen member removed
value(await cache.set_.srem('demo:roles:a', 'reader')) // 1
```

二つのロール集合を入力します。結果の順序は不定です。ランダム取得は元の集合を保ち、ランダム取り出しは選ばれた要素を削除します。

[引数と手順の詳細](cache.md#sets)

<a id="scores"></a>

### 順位と得点による検索：`cache.zset`

ソート済み集合はメンバーごとに得点を持ち、順位や得点範囲で検索できます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `cache.zset.zadd` | 要素とスコアを保存 | key, members | `number` | `await cache.zset.zadd('scores', { member: 'u1', score: 10 })` |
| `cache.zset.zrem` | 指定要素を削除 | key, members | `number` | `await cache.zset.zrem('scores', 'u1')` |
| `cache.zset.zscore` | スコアを取得 | key, member | `number \| null` | `await cache.zset.zscore('scores', 'u1')` |
| `cache.zset.zrank` | 0始まりの昇順順位を取得 | key, member | `number \| null` | `await cache.zset.zrank('scores', 'u1')` |
| `cache.zset.zrevrank` | 0始まりの降順順位を取得 | key, member | `number \| null` | `await cache.zset.zrevrank('scores', 'u1')` |
| `cache.zset.zrange` | 順位の昇順で取得 | key, start, stop, withScores | `string[] \| ZMember[]` | `await cache.zset.zrange('scores', 0, 9, true)` |
| `cache.zset.zrevrange` | 順位の降順で取得 | key, start, stop, withScores | `string[] \| ZMember[]` | `await cache.zset.zrevrange('scores', 0, 9, true)` |
| `cache.zset.zrangeByScore` | スコア範囲で取得 | key, min, max, options | `string[] \| ZMember[]` | `await cache.zset.zrangeByScore('scores', 10, 100, { withScores: true })` |
| `cache.zset.zcard` | 全要素数を取得 | key | `number` | `await cache.zset.zcard('scores')` |
| `cache.zset.zcount` | 範囲内の要素数を取得 | key, min, max | `number` | `await cache.zset.zcount('scores', 10, 100)` |
| `cache.zset.zincrBy` | スコアを加算 | key, increment, member | `number` | `await cache.zset.zincrBy('scores', 5, 'u1')` |
| `cache.zset.zremRangeByRank` | 順位範囲を削除 | key, start, stop | `number` | `await cache.zset.zremRangeByRank('scores', 0, 9)` |
| `cache.zset.zremRangeByScore` | スコア範囲を削除 | key, min, max | `number` | `await cache.zset.zremRangeByScore('scores', 0, 10)` |

#### 利用例：順位と得点による検索

```ts
value(await cache.zset.zadd('demo:scores', { member: 'a', score: 10 }, { member: 'b', score: 20 })) // 2
value(await cache.zset.zscore('demo:scores', 'a')) // 10
value(await cache.zset.zrank('demo:scores', 'a')) // 0
value(await cache.zset.zrevrank('demo:scores', 'a')) // 1
value(await cache.zset.zrange('demo:scores', 0, -1)) // ['a', 'b']
value(await cache.zset.zrevrange('demo:scores', 0, -1)) // ['b', 'a']
value(await cache.zset.zrangeByScore('demo:scores', 10, 20)) // ['a', 'b']
value(await cache.zset.zcard('demo:scores')) // 2
value(await cache.zset.zcount('demo:scores', 10, 15)) // 1
value(await cache.zset.zincrBy('demo:scores', 5, 'a')) // 15
value(await cache.zset.zremRangeByScore('demo:scores', 0, 14)) // 0
value(await cache.zset.zremRangeByRank('demo:scores', 0, 0)) // 1; removes a
value(await cache.zset.zrem('demo:scores', 'b')) // 1
```

a=10、b=20 の新しいランキングを入力します。順位はゼロ始まりです。a を 15 にした後は 0〜14 点の削除数はゼロです。削除操作は実際の削除数を返します。

[引数と手順の詳細](cache.md#scores)

<a id="locks"></a>

### 短時間処理の排他：`cache.lock`

共有 Redis の期限付きロックで短い処理を調整します。業務の最終更新には別途、競合の検査が必要です。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `cache.lock.acquire` | 期限付きロックを取得 | key, options | `string \| null` | `await cache.lock.acquire('daily', { ttl: 30 })` |
| `cache.lock.release` | 所有者トークンで解放 | key, owner | `boolean` | `await cache.lock.release('daily', owner)` |
| `cache.lock.isLocked` | ロックの有無を確認 | key | `boolean` | `await cache.lock.isLocked('daily')` |
| `cache.lock.extend` | 所有者トークンで延長 | key, ttl, owner | `boolean` | `await cache.lock.extend('daily', 60, owner)` |

#### 利用例：短時間処理の排他

```ts
const owner = value(await cache.lock.acquire('demo:daily', { ttl: 30 }))
if (owner !== null) {
  try {
    value(await cache.lock.isLocked('demo:daily')) // true while the lease is valid
    const extended = value(await cache.lock.extend('demo:daily', 60, owner))
    if (!extended)
      throw new Error('Lease lost')
  }
  finally {
    value(await cache.lock.release('demo:daily', owner)) // true only if this owner still holds it
  }
}
```

入力は処理キーと秒数です。取得時はランダムな owner、取得できなければ null を返します。延長・解放に同じ owner を使い、false は所有権を失ったことを示します。

[引数と手順の詳細](cache.md#locks)
