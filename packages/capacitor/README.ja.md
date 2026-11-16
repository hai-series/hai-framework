# @h-ai/capacitor

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/api-client](../api-client/README.ja.md) · [@h-ai/core](../core/README.ja.md)

hai Framework のモバイルアプリ向け Capacitor ネイティブブリッジ。安全な Token ストレージ、端末情報、プッシュ通知、カメラ、ステータスバーを共通 API で提供します。

## クイックスタート

```ts
import { capacitor } from '@h-ai/capacitor'

const initialized = await capacitor.init()
if (!initialized.success)
  throw new Error(initialized.error.message)
const failures: unknown[] = []
try {
  const saved = await capacitor.preferences.set('theme', 'dark')
  if (!saved.success)
    throw new Error(saved.error.message)
  const theme = await capacitor.preferences.get('theme')
  if (!theme.success)
    throw new Error(theme.error.message)
  // theme.data は 'dark'。保存していないキーは null。
}
catch (cause) {
  failures.push(cause)
}
finally {
  const closed = await capacitor.close()
  if (!closed.success)
    failures.push(closed.error)
}
if (failures.length)
  throw new AggregateError(failures, 'Native preference operation failed')
```

## 設定一覧

Capacitor プロジェクトで、プッシュ通知やカメラなど必要なネイティブプラグインをインストールして設定します。起動時に `capacitor.init()` を呼び出した後、`capacitor.push` や `capacitor.camera` を使います。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/capacitor.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/capacitor.md)（中国語）を参照してください。

- `capacitor.init` / `capacitor.close` / `capacitor.isInitialized` / `capacitor.getPlatform` / `capacitor.isNative` — プラグイン初期化とプラットフォーム判定
- `capacitor.device` / `capacitor.camera` / `capacitor.push` / `capacitor.statusBar` — 端末情報の取得、撮影、プッシュ登録、ステータスバーの調整
- `capacitor.preferences` — アプリの一般設定を端末に保存する
- `createCapacitorTokenStorage()` — `@h-ai/capacitor` から個別にインポートし、返された安全な保存先を認証トークン用に API クライアントへ渡す

## データ構造

モジュール独自のデータベーステーブルは作成しません。

ネイティブ設定、認証情報、写真、プッシュトークンについては[データ構造](../../docs/usage/data/capacitor.md)（中国語）を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/capacitor test
```

> ネイティブプラグインへの依存があるため、テストでは `@capacitor/*` モジュールを mock する必要があります。

公開操作、内部リソースと型には型検査できる例があります。[JSDoc 規約（中国語）](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) を参照してください。型検査は端末権限や FCM/APNs の実配信を保証しません。

## ライセンス

Apache-2.0
