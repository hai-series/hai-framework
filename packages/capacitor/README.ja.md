# @h-ai/capacitor

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/api-client](../api-client/README.ja.md) · [@h-ai/core](../core/README.ja.md)

hai Framework のモバイルアプリ向け Capacitor ネイティブブリッジ。安全な Token ストレージ、端末情報、プッシュ通知、カメラ、ステータスバーを共通 API で提供します。

## クイックスタート

[最小構成の導入手順](../../docs/usage/function/capacitor.md#最小接入示例)（中国語）を参照してください。

## 設定一覧

Capacitor プロジェクトで、プッシュ通知やカメラなど必要なネイティブプラグインをインストールして設定します。起動時に `capacitor.init()` を呼び出した後、`capacitor.push` や `capacitor.camera` を使います。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/capacitor.md)（中国語）を参照してください。

## 機能

[API 一覧](../../docs/usage/function/capacitor.md#api-reference)（中国語）で、呼び出し方、入力、戻り値、使用例を確認できます。

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
