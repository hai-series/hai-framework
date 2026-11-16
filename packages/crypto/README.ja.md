# @h-ai/crypto

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/cache](../cache/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

非対称暗号、ハッシュ、対称暗号、パスワードハッシュを提供する暗号モジュールです。

## クイックスタート

並行する `close()` は未完了の `init()` を無効にし、遅い初期化がモジュールを再開しないようにします。その初期化の完了を待ってから再初期化できます。

```ts
import { crypto } from '@h-ai/crypto'

// 初始化（使用前必须调用）
const initialized = await crypto.init()
if (!initialized.success)
  throw new Error(initialized.error.message)
```

## 設定一覧

暗号化、署名、ハッシュのオプションは各メソッドに渡します。HTTP の通信を暗号化する場合、`crypto.transport.createServer(options)` にサーバーの鍵と鍵の保存先を渡し、`crypto.transport.createClient(options)` に鍵交換用の URL を指定します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/crypto.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/crypto.md)（中国語）を参照してください。

- `crypto.init` / `crypto.close` / `crypto.isInitialized` — 暗号機能の初期化と終了
- `crypto.asymmetric` / `crypto.symmetric` / `crypto.hash` / `crypto.password` — 暗号化と復号、署名、ダイジェスト、パスワードハッシュ
- `crypto.transport` — HTTP クライアントとサーバー間の暗号化セッションを確立・更新

## データ構造

RelDB の通信鍵レジストリはテーブルを作成します。Redis レジストリは公開鍵とリプレイ防止の情報をキャッシュキーに保存します。

鍵、通信セッション、nonce、差し替え可能なストレージについては[データ構造](../../docs/usage/data/crypto.md)（中国語）を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/crypto test
```

## ライセンス

Apache-2.0
