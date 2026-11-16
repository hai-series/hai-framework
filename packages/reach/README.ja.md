# @h-ai/reach

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/cache](../cache/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

メール・SMS・API 通知など複数の Provider を同時登録できる通知モジュールです。テンプレートと Provider の対応で用途に応じて配信します。通知抑制（DND）と設定ファイルによるテンプレート定義を備えます。

## クイックスタート

[最小構成の導入手順](../../docs/usage/function/reach.md#最小接入示例)（中国語）を参照してください。

## 設定一覧

生成したプロジェクトでは、配信チャネル、テンプレート、通知を止める時間帯、再試行ルールを `config/_reach.yml` に記述します。アプリの起動コードがファイルを読み込み、設定オブジェクトを `reach.init(config)` に渡します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/reach.md)（中国語）を参照してください。

## 機能

[API 一覧](../../docs/usage/function/reach.md#api-reference)（中国語）で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

通知ジョブ、結果、デッドレター、冪等性レコード、共有ロックについては[データ構造](../../docs/usage/data/reach.md)（中国語）を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/reach test
```

`tests/reach-repository-send-log-databases.test.ts` は Testcontainers で隔離した PostgreSQL 16.15 / MySQL 8.4.11 を起動し、終了後に削除します。利用可能な Docker API が必要です。Podman では `DOCKER_HOST` を互換ソケットに向け、rootless 環境では Testcontainers の要件に従って `TESTCONTAINERS_RYUK_DISABLED=true` を設定してください。

## ライセンス

Apache-2.0
