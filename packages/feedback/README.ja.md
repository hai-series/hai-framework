# @h-ai/feedback

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

[フレームワーク](../../README.ja.md)

ユーザーの問題報告と診断情報の収集、管理者への通知、一覧処理、オフライン問題パッケージの出力を提供します。説明は任意です。報告と構造化された証拠は関係データベースに、スクリーンショットなどは非公開オブジェクトストレージに保存します。別の telemetry サービスは不要です。

## クイックスタート

`pnpm add @h-ai/feedback @h-ai/reldb @h-ai/storage` でインストールします。

[最小構成の導入手順](../../docs/usage/function/feedback.ja.md#quick-start)を参照してください。 [依存関係と初期化順序](../../docs/usage/function/feedback.ja.md#module-dependencies)を参照してください。

## 設定一覧

生成したプロジェクトは `config/_feedback.yml` に `appId` と `notification.mode` を指定します。追加機能は `webhook`、`collection`、`retention` に、容量とタスクの調整は `limits` と `worker` にまとめます。アプリの起動コードがファイルを読み込み、設定オブジェクトを `feedback.init(config, options)` に渡します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/feedback.ja.md)を参照してください。

## 機能

[API 一覧](../../docs/usage/function/feedback.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

`feedback.listMine` で自分が投稿した報告をページ取得できます。本人一覧と管理一覧の両方でカテゴリを絞り込めます。収集や通知の復旧は[機能ガイド](../../docs/usage/function/feedback.ja.md#service)を参照してください。未送信の資料は[端末にも保存](../../docs/usage/function/feedback.ja.md#browser-capture)できます。

## データ構造

報告、証拠、バックグラウンドジョブ、添付、オフラインバンドル、ブラウザーの下書きについては[データ構造](../../docs/usage/data/feedback.ja.md)を参照してください。

## 開発とテスト

```sh
pnpm --filter @h-ai/feedback typecheck
pnpm --filter @h-ai/feedback lint
pnpm --filter @h-ai/feedback build
pnpm --filter @h-ai/feedback test
pnpm --filter @h-ai/cli test:scaffold-gates
# 上記の構築後、dist を再構築せず実 Chromium でオフライン表示・再生を確認します。
node packages/cli/tests/feedback-offline-browser.mjs
```

ブラウザー、SQLite/PG/MySQL、実際の S3/SMTP、複数インスタンス回復、ネットワーク切断時の表示をそれぞれ確認します。ビルドや mock の成功で代用しません。アプリの接続と配置は[利用ガイド](../../docs/usage/README.ja.md)を参照してください。

## ライセンス

Apache-2.0
