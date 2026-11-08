# @h-ai/cache

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

統一されたキャッシュモジュールです。`cache` オブジェクトで KV / Hash / List / Set / ZSet / 分散ロックを操作し、メモリーと Redis のバックエンドに対応します。

## クイックスタート

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

`cache.config` は**機密情報をマスクした設定スナップショット**を返します。Redis の `password` / `url` などの認証情報は自動処理されるため、元の秘密情報を書き戻す用途には使わないでください。

## 機能

メモリー KV は有効期限に達した時点で無効になります。`incr/decr/incrBy/decrBy` は安全な整数値または整数文字列のみを受け付け、不正な増分やオーバーフローでは元の値を保持して `OPERATION_FAILED` を返します。Hash の `__proto__` / `constructor` などは通常のフィールドとして保持され、戻り値のオブジェクトのプロトタイプを変更しません。

Memory の KV・Hash・List・Set・ZSet は一つの key 名前空間を共有します。`exists/expire/expireAt/ttl/persist/keys/scan/del/type` は全構造を対象とし、期限切れ key は構造操作でも直ちに存在しないものとして扱います。del は実際に削除した論理 key を数え、異なる型の構造操作は失敗します。

接続はヘルスチェック成功後に公開します。初期化失敗時は候補リソースを解放し、解放にも失敗した場合は初期化エラーの `error.ext.cleanupPending` が `true` になります。`cache.close()` は `Promise<HaiResult<void>>` を返し、初期化を待機して並行する終了処理をまとめます。解放開始後は `isInitialized` が `false` となり、設定と操作は利用できません。解放に失敗したリソースは保持され、次の `close()` または `init()` で再試行します。解放が成功するまで代替接続は作成しません。終了結果を必ず確認してください。

```ts
const closed = await cache.close()
if (!closed.success) {
  // 障害への対処後に一度再試行し、再失敗はアプリへ報告します。
  const retried = await cache.close()
  if (!retried.success)
    throw new Error(retried.error.message)
}
```

Redis の QUIT が失敗した場合は disconnect で切断し、解放が完了した場合のみ成功を返します。

### 操作と入出力

本節の完全な初期化手順を先に実行します。例の業務値はホストが検証・認可し、非同期領域結果は success を確認してから data を読みます。void はデータなし完了、null は不存在、同期ファクトリー/ツールは表の型を直接返します。

key/keys は業務キー、field/fields はハッシュ項目、value/members は JSON 値。start/stop/index は添字、min/max は点数範囲、seconds/ttl/timeout は秒、timestamp は Unix 秒。owner は acquire の戻り値。

#### cache.kv

JSON スナップショットを保存。get/mget は値/null（入力順）、set は TTL/NX/XX と適用 boolean、mset は [key,value][] から void。

| 入口            | 入力引数            | 成功結果        | 呼出し例                                                   |
| --------------- | ------------------- | --------------- | ---------------------------------------------------------- |
| `cache.kv.get`  | key                 | `T \| null`     | `await cache.kv.get('u:1')`                                |
| `cache.kv.set`  | key, value, options | `boolean`       | `await cache.kv.set('u:1', { name: 'Alice' }, { ex: 60 })` |
| `cache.kv.mget` | keys                | `(T \| null)[]` | `await cache.kv.mget('u:1', 'u:2')`                        |
| `cache.kv.mset` | entries             | `void`          | `await cache.kv.mset([['u:1', { name: 'Alice' }]])`        |

#### cache.kv

ノード間の版付き確定。key・expected・value・期限を原子的に比較し applied を返す。undefined は不存在/削除、不一致時は値と TTL を保持。

| 入口                      | 入力引数                      | 成功結果  | 呼出し例                                         |
| ------------------------- | ----------------------------- | --------- | ------------------------------------------------ |
| `cache.kv.compareAndSwap` | key, expected, value, options | `boolean` | `await cache.kv.compareAndSwap('version', 1, 2)` |

#### cache.kv

全構造をキー単位で管理。del/exists は複数キーから削除数/存在数、type は単一キーから構造名を返す。

| 入口              | 入力引数 | 成功結果 | 呼出し例                              |
| ----------------- | -------- | -------- | ------------------------------------- |
| `cache.kv.del`    | keys     | `number` | `await cache.kv.del('u:1', 'u:2')`    |
| `cache.kv.exists` | keys     | `number` | `await cache.kv.exists('u:1', 'u:2')` |
| `cache.kv.type`   | key      | `string` | `await cache.kv.type('u:1')`          |

#### cache.kv

保存期限を管理。相対秒・Unix 秒・キーで TTL を設定/照会/解除。変更は boolean、ttl は秒（-1 無期限、-2 不存在）。

| 入口                | 入力引数       | 成功結果  | 呼出し例                                                             |
| ------------------- | -------------- | --------- | -------------------------------------------------------------------- |
| `cache.kv.expire`   | key, seconds   | `boolean` | `await cache.kv.expire('u:1', 60)`                                   |
| `cache.kv.expireAt` | key, timestamp | `boolean` | `await cache.kv.expireAt('u:1', Math.floor(Date.now() / 1000) + 60)` |
| `cache.kv.ttl`      | key            | `number`  | `await cache.kv.ttl('u:1')`                                          |
| `cache.kv.persist`  | key            | `boolean` | `await cache.kv.persist('u:1')`                                      |

#### cache.kv

カウンターはキーと整数増分から更新後の安全な整数を返す。型不正・桁あふれは元値を変更せず失敗。

| 入口              | 入力引数       | 成功結果 | 呼出し例                            |
| ----------------- | -------------- | -------- | ----------------------------------- |
| `cache.kv.incr`   | key            | `number` | `await cache.kv.incr('hits')`       |
| `cache.kv.incrBy` | key, increment | `number` | `await cache.kv.incrBy('hits', 2)`  |
| `cache.kv.decr`   | key            | `number` | `await cache.kv.decr('stock')`      |
| `cache.kv.decrBy` | key, decrement | `number` | `await cache.kv.decrBy('stock', 2)` |

#### cache.kv

列挙。keys は glob からキー配列、scan は不透明カーソルと match/count から [次カーソル,キー配列]。スナップショット・一意性保証なし。

| 入口            | 入力引数        | 成功結果             | 呼出し例                                                 |
| --------------- | --------------- | -------------------- | -------------------------------------------------------- |
| `cache.kv.keys` | pattern         | `string[]`           | `await cache.kv.keys('u:*')`                             |
| `cache.kv.scan` | cursor, options | `[string, string[]]` | `await cache.kv.scan('0', { match: 'u:*', count: 100 })` |

#### cache.hash

フィールド保存。キーとフィールド/配列/オブジェクト/増分を入力。読取は値/null・オブジェクト・配列・長さ、hset/hdel は件数、hexists は boolean、hincrBy は更新整数。

| 入口                 | 入力引数              | 成功結果        | 呼出し例                                        |
| -------------------- | --------------------- | --------------- | ----------------------------------------------- |
| `cache.hash.hget`    | key, field            | `T \| null`     | `await cache.hash.hget('u:1', 'name')`          |
| `cache.hash.hset`    | key, field, value     | `number`        | `await cache.hash.hset('u:1', 'name', 'Alice')` |
| `cache.hash.hdel`    | key, fields           | `number`        | `await cache.hash.hdel('u:1', 'name')`          |
| `cache.hash.hexists` | key, field            | `boolean`       | `await cache.hash.hexists('u:1', 'name')`       |
| `cache.hash.hgetall` | key                   | `T`             | `await cache.hash.hgetall('u:1')`               |
| `cache.hash.hkeys`   | key                   | `string[]`      | `await cache.hash.hkeys('u:1')`                 |
| `cache.hash.hvals`   | key                   | `T[]`           | `await cache.hash.hvals('u:1')`                 |
| `cache.hash.hlen`    | key                   | `number`        | `await cache.hash.hlen('u:1')`                  |
| `cache.hash.hmget`   | key, fields           | `(T \| null)[]` | `await cache.hash.hmget('u:1', 'name', 'age')`  |
| `cache.hash.hincrBy` | key, field, increment | `number`        | `await cache.hash.hincrBy('u:1', 'visits', 1)`  |

#### cache.list

順序キュー。キー・値・添字/範囲を入力し push は長さ、pop/index は値/null、range は配列、set/trim は void。阻塞 pop は秒数とキーから [key,value]/null。

| 入口                | 入力引数          | 成功結果              | 呼出し例                                          |
| ------------------- | ----------------- | --------------------- | ------------------------------------------------- |
| `cache.list.lpush`  | key, values       | `number`              | `await cache.list.lpush('jobs', 'job-1')`         |
| `cache.list.rpush`  | key, values       | `number`              | `await cache.list.rpush('jobs', 'job-2')`         |
| `cache.list.lpop`   | key               | `T \| null`           | `await cache.list.lpop('jobs')`                   |
| `cache.list.rpop`   | key               | `T \| null`           | `await cache.list.rpop('jobs')`                   |
| `cache.list.llen`   | key               | `number`              | `await cache.list.llen('jobs')`                   |
| `cache.list.lrange` | key, start, stop  | `T[]`                 | `await cache.list.lrange('jobs', 0, 9)`           |
| `cache.list.lindex` | key, index        | `T \| null`           | `await cache.list.lindex('jobs', 0)`              |
| `cache.list.lset`   | key, index, value | `void`                | `await cache.list.lset('jobs', 0, 'replacement')` |
| `cache.list.ltrim`  | key, start, stop  | `void`                | `await cache.list.ltrim('jobs', 0, 99)`           |
| `cache.list.blpop`  | timeout, keys     | `[string, T] \| null` | `await cache.list.blpop(5, 'jobs')`               |
| `cache.list.brpop`  | timeout, keys     | `[string, T] \| null` | `await cache.list.brpop(5, 'jobs')`               |

#### cache.set_

重複排除・集合演算。キーと要素の追加/削除/判定は件数/boolean。members は配列、card は数、random/pop は count により要素/配列/null、積/和/差は複数キーから配列。

| 入口                     | 入力引数     | 成功結果           | 呼出し例                                        |
| ------------------------ | ------------ | ------------------ | ----------------------------------------------- |
| `cache.set_.sadd`        | key, members | `number`           | `await cache.set_.sadd('roles', 'editor')`      |
| `cache.set_.srem`        | key, members | `number`           | `await cache.set_.srem('roles', 'editor')`      |
| `cache.set_.smembers`    | key          | `T[]`              | `await cache.set_.smembers('roles')`            |
| `cache.set_.sismember`   | key, member  | `boolean`          | `await cache.set_.sismember('roles', 'editor')` |
| `cache.set_.scard`       | key          | `number`           | `await cache.set_.scard('roles')`               |
| `cache.set_.srandmember` | key, count   | `T \| T[] \| null` | `await cache.set_.srandmember('roles', 2)`      |
| `cache.set_.spop`        | key, count   | `T \| T[] \| null` | `await cache.set_.spop('roles', 1)`             |
| `cache.set_.sinter`      | keys         | `T[]`              | `await cache.set_.sinter('roles:a', 'roles:b')` |
| `cache.set_.sunion`      | keys         | `T[]`              | `await cache.set_.sunion('roles:a', 'roles:b')` |
| `cache.set_.sdiff`       | keys         | `T[]`              | `await cache.set_.sdiff('roles:a', 'roles:b')`  |

#### cache.zset

ランキングは要素・score・順位/点数範囲を入力。追加/削除は件数、score/rank は数/null、range は要素/点数付き配列、incrBy は更新点、card/count は件数。

| 入口                          | 入力引数                     | 成功結果                | 呼出し例                                                                  |
| ----------------------------- | ---------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| `cache.zset.zadd`             | key, members                 | `number`                | `await cache.zset.zadd('scores', { member: 'u1', score: 10 })`            |
| `cache.zset.zrem`             | key, members                 | `number`                | `await cache.zset.zrem('scores', 'u1')`                                   |
| `cache.zset.zscore`           | key, member                  | `number \| null`        | `await cache.zset.zscore('scores', 'u1')`                                 |
| `cache.zset.zrank`            | key, member                  | `number \| null`        | `await cache.zset.zrank('scores', 'u1')`                                  |
| `cache.zset.zrevrank`         | key, member                  | `number \| null`        | `await cache.zset.zrevrank('scores', 'u1')`                               |
| `cache.zset.zrange`           | key, start, stop, withScores | `string[] \| ZMember[]` | `await cache.zset.zrange('scores', 0, 9, true)`                           |
| `cache.zset.zrevrange`        | key, start, stop, withScores | `string[] \| ZMember[]` | `await cache.zset.zrevrange('scores', 0, 9, true)`                        |
| `cache.zset.zrangeByScore`    | key, min, max, options       | `string[] \| ZMember[]` | `await cache.zset.zrangeByScore('scores', 10, 100, { withScores: true })` |
| `cache.zset.zcard`            | key                          | `number`                | `await cache.zset.zcard('scores')`                                        |
| `cache.zset.zcount`           | key, min, max                | `number`                | `await cache.zset.zcount('scores', 10, 100)`                              |
| `cache.zset.zincrBy`          | key, increment, member       | `number`                | `await cache.zset.zincrBy('scores', 5, 'u1')`                             |
| `cache.zset.zremRangeByRank`  | key, start, stop             | `number`                | `await cache.zset.zremRangeByRank('scores', 0, 9)`                        |
| `cache.zset.zremRangeByScore` | key, min, max                | `number`                | `await cache.zset.zremRangeByScore('scores', 0, 10)`                      |

#### cache.lock

短期排他。acquire はキー/TTL から owner/null、release/extend は owner 必須で boolean、isLocked は観測のみ。資源側 CAS の代用ではない。

| 入口                  | 入力引数        | 成功結果         | 呼出し例                                         |
| --------------------- | --------------- | ---------------- | ------------------------------------------------ |
| `cache.lock.acquire`  | key, options    | `string \| null` | `await cache.lock.acquire('daily', { ttl: 30 })` |
| `cache.lock.release`  | key, owner      | `boolean`        | `await cache.lock.release('daily', owner)`       |
| `cache.lock.isLocked` | key             | `boolean`        | `await cache.lock.isLocked('daily')`             |
| `cache.lock.extend`   | key, ttl, owner | `boolean`        | `await cache.lock.extend('daily', 60, owner)`    |

#### cache

引数なしの健全性確認。バックエンド応答文字列、接続障害は失敗。

| 入口         | 入力引数 | 成功結果 | 呼出し例             |
| ------------ | -------- | -------- | -------------------- |
| `cache.ping` | 引数なし | `string` | `await cache.ping()` |

- 開発・テスト用のメモリーキャッシュ
- 本番環境の Redis キャッシュ（単一ノード、URL、Cluster、Sentinel）
- IAM セッション・権限用の集合キャッシュ
- 複数ノード間の排他制御に使う分散ロック

### API 一覧

- `cache.kv`：文字列・オブジェクトのキーと値、および TTL（`set/get/mget/mset/expire/ttl/...`）。
- `cache.hash`：Hash 構造（`hset/hget/hgetall/...`）。
- `cache.list`：リスト（`lpush/rpush/lpop/rpop/...`）。
- `cache.set_`：集合（`sadd/smembers/sismember/...`）。
- `cache.zset`：ソート済み集合（`zadd/zrange/zrevrange/...`）。
- `cache.lock`：分散ロック（`acquire/release/isLocked/extend`）。

`kv.set` は `HaiResult<boolean>` を返し、`data=true` は書き込みの適用を表します。NX/XX が不成立なら `success=true,data=false` となり、値と TTL を変更しません。チケット、セッション、公鍵登録の発行前に両方を確認してください。`ex/px/exat/pxat` の単位は秒、ミリ秒、Unix 秒、Unix ミリ秒です。正の安全な整数を一つだけ指定し、`keepTtl=true` と併用できません。NX と XX も排他です。ゼロ、負数、小数、非有限値、オーバーフローは `INVALID_SET_OPTIONS`（`cache:016`）となり、永続キーを作成しません。過去の正の絶対期限は即時失効します。期限を省略すると既存 TTL は削除され、`keepTtl` は既存 TTL を維持します。新規キーは期限なしです。両 provider は JSON スナップショットを保存します。

compareAndSwap は単一キーの JSON 値を原子的に比較・置換/削除し、適用有無を返します。expected の undefined は不存在、value の undefined は削除、null は JSON 値です。px は正の整数で keepTtl と排他です。期限省略時は永続保存し、不一致なら TTL を変更しません。

### Cluster の複数キー操作と走査

`mget/del/exists` は slot ごとの独立操作を有界並行実行し、MGET は入力順序を維持します。slot 間の原子性やスナップショットは提供しません。DEL の失敗時は一部削除済みの場合があり、再試行は冪等です。`mset`、集合演算、複数キーの blocking pop は同一 slot が必要です。共通の `{hash-tag}` を使わない場合は `CROSS_SLOT` を返し、MSET の部分書き込みは行いません。

`scan` は文字列 `'0'` で開始し、不透明な返却カーソルをそのまま渡します。同じ設定とトポロジーなら別のアプリケーションノードで継続できます。Cluster の全 master を走査し、トポロジー・match・keyPrefix が変わると `SCAN_TOPOLOGY_CHANGED` を返すため `'0'` から再開します。返却キーから keyPrefix を除去し、prefix の glob 文字はリテラルとして扱います。`keys` も同じ規則で重複を除去します。SCAN はスナップショットではなく重複を許容し、count は正の整数の目安です。無効なカーソル/count は `INVALID_SCAN` を返します。

### 分散ロック

SET NX EX を利用する分散排他ロックで、複数ノードのデプロイに適しています。

```ts
// 获取锁（TTL 30 秒，owner 用于标识持有者）
const acquired = await cache.lock.acquire('my-lock', { ttl: 30 })
if (acquired.success && acquired.data) {
  try {
    // 执行受保护操作
  }
  finally {
    await cache.lock.release('my-lock', acquired.data)
  }
}

// 检查锁状态
const locked = await cache.lock.isLocked('my-lock')

// 续期锁
if (acquired.success && acquired.data)
  await cache.lock.extend('my-lock', 60, acquired.data)
```

- **Memory バックエンド**：Map と TTL による有効期限管理。
- **Redis バックエンド**：`SET NX EX` でアトミックにロックを取得。Lua スクリプトで owner を検証して安全に解除・延長します。
- `acquire` は取得ごとの一意なトークン（競合時は `null`）を返します。解除・延長にはこのトークンが必須です。ノード ID やトークンなしの操作は使用できません。

owner はリース延長・解除の所有権であり、リソースの fencing token ではありません。停止した処理は期限切れ後も再開できるため、最終書込には保存先の CAS・世代条件・トランザクション制約が必要です。延長や処理後の失敗返却だけでは旧書込を防げません。

### 本番の共有状態

本番は Redis（Cluster を含む）が必須です。memory は開発・明示的テスト用であり、Redis 障害時もローカルへフォールバックしません。 NODE_ENV または HAI_CORE_ENV が production の場合、初期化成功前に検証します。明示的な HAI_E2E=1/HAI_E2E_MOCK=1 テストのみ除外します。 [状態・並行制御・復旧範囲（中国語）](../../.agents/instructions/distributed-state.md).

## 設定

ライフサイクル。init にバックエンド/業務設定を渡し成功後に使用します。借用依存先の解放前に close の完了を待ち、正確な戻り値は例と公開署名に従います。

```ts
// Memory（开发/测试）
await cache.init({ type: 'memory' })

// Redis 单机
await cache.init({
  type: 'redis',
  host: 'localhost',
  port: 6379,
  password: 'secret',
  db: 0,
})

// Redis URL（优先级最高）
await cache.init({
  type: 'redis',
  url: 'redis://:password@localhost:6379/0',
})

// Redis 集群
await cache.init({
  type: 'redis',
  cluster: [
    { host: 'node1', port: 6379 },
    { host: 'node2', port: 6379 },
  ],
})

// Redis 哨兵
await cache.init({
  type: 'redis',
  sentinel: {
    sentinels: [
      { host: 'sentinel1', port: 26379 }
    ],
    name: 'mymaster',
  },
})
```

`cache.init(config)` は組み込み memory/redis を選択します。Provider は内部契約であり、独自バックエンドの登録 API はありません。

`password` は単独・Cluster・Sentinel のデータノードに使用され、発見・リダイレクト後の接続にも適用します。`url` 指定時は URL 内の認証情報を使用し、独立した password フィールドでは上書きしません。

設定はホストが読込・検証してから渡します。秘密はサーバーの非公開環境に保存し、利用場面に応じてバックエンド・容量・期限・ログを選びます。変更後は再初期化の結果を確認してください。

[項目別の用途・適用場面・例](../../docs/usage/configuration/data.md).

## エラー処理

領域操作は result.success を確認し、失敗時はモジュールのエラー定義と安全な説明を使います。コード・関連 ID・秘匿した原因をサーバーログに残します。同期ツール・ファクトリー・ストリーム反復・ライフサイクルは各署名に従い、Promise 完了だけで成功と判断しません。回復条件は各機能を参照してください。

すべての操作は `HaiResult<T>` を返します。主なエラーコード：

| エラーコード                           | code            | 説明                   |
| -------------------------------------- | --------------- | ---------------------- |
| `HaiCacheError.CONNECTION_FAILED`      | `hai:cache:001` | 接続に失敗             |
| `HaiCacheError.OPERATION_FAILED`       | `hai:cache:002` | 操作に失敗             |
| `HaiCacheError.SERIALIZATION_FAILED`   | `hai:cache:003` | シリアライズに失敗     |
| `HaiCacheError.DESERIALIZATION_FAILED` | `hai:cache:004` | デシリアライズに失敗   |
| `HaiCacheError.KEY_NOT_FOUND`          | `hai:cache:005` | キーが存在しない       |
| `HaiCacheError.TIMEOUT`                | `hai:cache:006` | タイムアウト           |
| `HaiCacheError.NOT_INITIALIZED`        | `hai:cache:010` | 未初期化               |
| `HaiCacheError.UNSUPPORTED_TYPE`       | `hai:cache:011` | 未対応のキャッシュ種別 |
| `HaiCacheError.CONFIG_ERROR`           | `hai:cache:012` | 設定エラー             |

## 開発とテスト

```bash
pnpm --filter @h-ai/cache test
```

> Redis 関連のテストには Docker が必要です。

公開契約と内部構造には型検査できる例を用意しています。[JSDoc 規約（中国語）](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) を参照してください。

## ライセンス

Apache-2.0
