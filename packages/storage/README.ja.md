# @h-ai/storage

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

共通の `storage` 入口で S3 互換ストレージとローカルファイルシステムを操作するオブジェクトストレージモジュールです。

## クイックスタート

[最小構成の導入手順](../../docs/usage/function/storage.ja.md#quick-start)を参照してください。

## 設定一覧

生成したプロジェクトでは、ローカルディレクトリまたは S3 互換ストレージへの接続設定を `config/_storage.yml` に記述します。アプリの起動コードがファイルを読み込み、設定オブジェクトを `storage.init(config)` に渡します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/storage.ja.md)を参照してください。

## 機能

[API 一覧](../../docs/usage/function/storage.ja.md#api-reference)で、呼び出し方、入力、戻り値、使用例を確認できます。

## データ構造

モジュール独自のデータベーステーブルは作成しません。

ローカルファイルと S3 オブジェクト、キー、メタデータ、保持期間については[データ構造](../../docs/usage/data/storage.ja.md)を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/storage test
```

S3 統合テストには Docker または互換ランタイムが必要です。初期化、ファイル、ディレクトリー、署名付き URL、実際の HTTP アップロード・ダウンロードの同じテストを MinIO と RustFS で実行し、コンテナー起動失敗をスキップしません。

- MinIO：[`ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z`](https://github.com/coollabsio/minio)。上流ソースからビルドしたコミュニティーイメージ。
- RustFS：[`ghcr.io/rustfs/rustfs:1.0.1`](https://github.com/rustfs/rustfs)。公式イメージ。

コンテナーは一時生成したテスト認証情報を使用します。サービスの準備完了後に S3 API でバケットを作成し、最後のリース解放時にコンテナーと匿名ボリュームを削除します。

ソースの JSDoc は[共通規約](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)に従います。公開例は実際の公開入口、内部例は元のモジュールスコープで型検査します。ビルド後に `pnpm check:jsdoc --package storage` を実行してください。例の型検査は実バックエンドの動作検証の代わりにはなりません。

実Chromeの回帰ゲートはChromeを用意し、`HAI_STORAGE_RUN_BROWSER_GATES=1` を設定して `pnpm --filter @h-ai/storage exec vitest run tests/storage-client-browser.test.ts` を実行します。実際のHTTP PUTでネイティブキャンセルとリスナー解放を検証し、ブラウザーがなければ失敗します。

## ライセンス

Apache-2.0
