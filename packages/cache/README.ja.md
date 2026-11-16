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

## 設定一覧

生成したプロジェクトでは、バックエンドの種類と Redis の接続設定を `config/_cache.yml` に記述します。アプリの起動コードがファイルを読み込み、設定オブジェクトを `cache.init(config)` に渡します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/cache.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/cache.md)（中国語）を参照してください。

- `cache.init` / `cache.close` / `cache.config` / `cache.isInitialized` / `cache.ping` — 接続管理と可用性の確認
- `cache.kv` / `cache.hash` / `cache.list` / `cache.set_` / `cache.zset` — キー値、ハッシュ、リスト、集合、ソート済み集合の操作
- `cache.lock` — 有効期限付きロックで排他処理を調整

## データ構造

Redis とメモリの値型、キー、TTL、ロック所有者については[データ構造](../../docs/usage/data/cache.md)（中国語）を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/cache test
```

> Redis 関連のテストには Docker が必要です。

公開契約と内部構造には型検査できる例を用意しています。[JSDoc 規約（中国語）](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) を参照してください。

## ライセンス

Apache-2.0
