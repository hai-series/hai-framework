# @h-ai/cache

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

## 概要

統一されたキャッシュモジュールです。`cache` オブジェクトで KV / Hash / List / Set / ZSet / 分散ロックを操作し、メモリーと Redis のバックエンドに対応します。

メモリー KV は有効期限に達した時点で無効になります。`incr/decr/incrBy/decrBy` は安全な整数値または整数文字列のみを受け付け、不正な増分やオーバーフローでは元の値を保持して `OPERATION_FAILED` を返します。Hash の `__proto__` / `constructor` などは通常のフィールドとして保持され、戻り値のオブジェクトのプロトタイプを変更しません。

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

## 主な機能

- 開発・テスト用のメモリーキャッシュ
- 本番環境の Redis キャッシュ（単一ノード、URL、Cluster、Sentinel）
- IAM セッション・権限用の集合キャッシュ
- 複数ノード間の排他制御に使う分散ロック

## 使い始める

### クイックスタート

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

## 本番の共有状態

本番は Redis（Cluster を含む）が必須です。memory は開発・明示的テスト用であり、Redis 障害時もローカルへフォールバックしません。 NODE_ENV または HAI_CORE_ENV が production の場合、初期化成功前に検証します。明示的な HAI_E2E=1/HAI_E2E_MOCK=1 テストのみ除外します。 [状態・並行制御・復旧範囲（中国語）](../../docs/distributed-state.md)。

`cache.init(config)` は組み込み memory/redis を選択します。Provider は内部契約であり、独自バックエンドの登録 API はありません。

`password` は単独・Cluster・Sentinel のデータノードに使用され、発見・リダイレクト後の接続にも適用します。`url` 指定時は URL 内の認証情報を使用し、独立した password フィールドでは上書きしません。

compareAndSwap は単一キーの JSON 値を原子的に比較・置換/削除し、適用有無を返します。expected の undefined は不存在、value の undefined は削除、null は JSON 値です。px は正の整数で keepTtl と排他です。期限省略時は永続保存し、不一致なら TTL を変更しません。

owner はリース延長・解除の所有権であり、リソースの fencing token ではありません。停止した処理は期限切れ後も再開できるため、最終書込には保存先の CAS・世代条件・トランザクション制約が必要です。延長や処理後の失敗返却だけでは旧書込を防げません。

`kv.set` は `HaiResult<boolean>` を返し、`data=true` は書き込みの適用を表します。NX/XX が不成立なら `success=true,data=false` となり、値と TTL を変更しません。チケット、セッション、公鍵登録の発行前に両方を確認してください。`ex/px/exat/pxat` の単位は秒、ミリ秒、Unix 秒、Unix ミリ秒です。正の安全な整数を一つだけ指定し、`keepTtl=true` と併用できません。NX と XX も排他です。ゼロ、負数、小数、非有限値、オーバーフローは `INVALID_SET_OPTIONS`（`cache:016`）となり、永続キーを作成しません。過去の正の絶対期限は即時失効します。期限を省略すると既存 TTL は削除され、`keepTtl` は既存 TTL を維持します。新規キーは期限なしです。両 provider は JSON スナップショットを保存します。

公開契約と内部構造には型検査できる例を用意しています。[JSDoc 規約（中国語）](../../docs/module-jsdoc.md) を参照してください。

## ライセンス

Apache-2.0
