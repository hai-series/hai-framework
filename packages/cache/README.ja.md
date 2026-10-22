# @h-ai/cache

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

## 概要

統一されたキャッシュモジュールです。`cache` オブジェクトで KV / Hash / List / Set / ZSet / 分散ロックを操作し、メモリーと Redis のバックエンドに対応します。

メモリー KV は有効期限に達した時点で無効になります。`incr/decr/incrBy/decrBy` は安全な整数値または整数文字列のみを受け付け、不正な増分やオーバーフローでは元の値を保持して `OPERATION_FAILED` を返します。Hash の `__proto__` / `constructor` などは通常のフィールドとして保持され、戻り値のオブジェクトのプロトタイプを変更しません。

## 主な機能

- 開発・テスト用のメモリーキャッシュ
- 本番環境の Redis キャッシュ（単一ノード、URL、Cluster、Sentinel）
- IAM セッション・権限用の集合キャッシュ
- 複数ノード間の排他制御に使う分散ロック

## 使い始める

### クイックスタート

```ts
import { cache, HaiCacheError } from '@h-ai/cache'

const initResult = await cache.init({ type: 'memory' })
if (!initResult.success) {
  throw new Error(initResult.error.message)
}

await cache.kv.set('user:1', { name: '张三' }, { ex: 3600 })
const user = await cache.kv.get<{ name: string }>('user:1')

await cache.hash.hset('profile:1', { age: 18, city: 'Hangzhou' })
await cache.list.lpush('queue:jobs', 'job-1', 'job-2')
await cache.set_.sadd('role:admin:perms', 'user.read', 'user.write')
await cache.zset.zadd('rank', { member: 'u1', score: 100 })

// 分布式锁
const acquired = await cache.lock.acquire('my-lock', { ttl: 30, owner: 'node-1' })
if (acquired.success && acquired.data) {
  try {
    // 执行受保护的操作
  }
  finally {
    await cache.lock.release('my-lock', 'node-1')
  }
}

if (!user.success && user.error.code === HaiCacheError.NOT_INITIALIZED.code) {
  // 请先调用 cache.init()
}

await cache.close()
```

`cache.config` は**機密情報をマスクした設定スナップショット**を返します。Redis の `password` / `url` などの認証情報は自動処理されるため、元の秘密情報を書き戻す用途には使わないでください。

### 初期化設定

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
    sentinels: [{ host: 'sentinel1', port: 26379 }],
    name: 'mymaster',
  },
})
```

### API 一覧

- `cache.kv`：文字列・オブジェクトのキーと値、および TTL（`set/get/mget/mset/expire/ttl/...`）。
- `cache.hash`：Hash 構造（`hset/hget/hgetall/...`）。
- `cache.list`：リスト（`lpush/rpush/lpop/rpop/...`）。
- `cache.set_`：集合（`sadd/smembers/sismember/...`）。
- `cache.zset`：ソート済み集合（`zadd/zrange/zrevrange/...`）。
- `cache.lock`：分散ロック（`acquire/release/isLocked/extend`）。
- `CacheProvider`：高度な統合や独自バックエンド用の公開 Provider 契約。

### 分散ロック

SET NX EX を利用する分散排他ロックで、複数ノードのデプロイに適しています。

```ts
// 获取锁（TTL 30 秒，owner 用于标识持有者）
const acquired = await cache.lock.acquire('my-lock', { ttl: 30, owner: 'node-1' })
if (acquired.success && acquired.data) {
  try {
    // 执行受保护操作
  }
  finally {
    await cache.lock.release('my-lock', 'node-1')
  }
}

// 检查锁状态
const locked = await cache.lock.isLocked('my-lock')

// 续期锁
await cache.lock.extend('my-lock', 60, 'node-1')
```

- **Memory バックエンド**：Map と TTL による有効期限管理。
- **Redis バックエンド**：`SET NX EX` でアトミックにロックを取得。Lua スクリプトで owner を検証して安全に解除・延長します。
- `owner` は他の所有者のロックの誤解除を防ぎます。複数ノードのデプロイでは安定したノード識別子の指定を推奨します。

### エラーコード

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

## ライセンス

Apache-2.0
