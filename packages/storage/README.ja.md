# @h-ai/storage

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

共通の `storage` 入口で S3 互換ストレージとローカルファイルシステムを操作するオブジェクトストレージモジュールです。

## クイックスタート

### Node.js サーバー

検証済みの S3 または local の設定と PNG データを `storeImage` に渡します。この例は接続を初期化し、処理後に閉じます。常駐サービスでは起動時に初期化し、停止時に閉じます。

```ts
import type { FileMetadata, StorageConfigInput } from '@h-ai/storage'
import type { Buffer } from 'node:buffer'
import { storage } from '@h-ai/storage'

export async function storeImage(config: StorageConfigInput, imageBuffer: Uint8Array) {
  // バックエンドを 1 つ選び、初期化結果を確認します。
  const initialized = await storage.init(config)
  if (!initialized.success)
    throw new Error(initialized.error.message)

  let result: { metadata: FileMetadata, bytes: Buffer, downloadUrl?: string }
  let closed
  try {
    const key = 'uploads/image.png'
    // オブジェクトキーに PNG データを書き込み、メタデータを取得します。
    const uploaded = await storage.file.put(key, imageBuffer, { contentType: 'image/png' })
    if (!uploaded.success)
      throw new Error(uploaded.error.message)

    // 同じキーでファイルを読み込み、内容を Buffer として取得します。
    const downloaded = await storage.file.get(key)
    if (!downloaded.success)
      throw new Error(downloaded.error.message)

    result = { metadata: uploaded.data, bytes: downloaded.data }
    if (config.type === 's3') {
      // S3 では 3,600 秒有効なダウンロード URL を発行します。
      const signed = await storage.presign.getUrl(key, { expiresIn: 3600 })
      if (!signed.success)
        throw new Error(signed.error.message)
      result.downloadUrl = signed.data
    }
  }
  finally {
    // 接続を解放し、失敗時は呼び出し元にエラーを返します。
    closed = await storage.close()
  }
  if (!closed.success)
    throw new Error(closed.error.message)
  return result
}
```

### ブラウザークライアント

初期化済みの `apiClient` で S3 のアップロード URL を取得します。アプリが許可したキーとユーザーが選択した `File` を `uploadImage` に渡します。

```ts
import { apiClient } from '@h-ai/api-client'
import { uploadWithPresignedUrl } from '@h-ai/storage/client'

export async function uploadImage(key: string, file: File) {
  // 署名とアップロードには同じ Content-Type を使います。
  const contentType = file.type || 'application/octet-stream'
  const signed = await apiClient.storage.presignedUrls.createUpload({ key, contentType })
  if (!signed.success)
    throw new Error(signed.error.message)

  // オブジェクトストレージに直接アップロードし、サーバーが確認したキーを返します。
  const uploaded = await uploadWithPresignedUrl(signed.data.url, file, { contentType })
  if (!uploaded.success)
    throw new Error(uploaded.error ?? 'Upload failed')
  return signed.data.key
}
```

> 注：`@h-ai/storage` に HTTP ルートは組み込まれていません。署名付き URL API はアプリケーション層で実装してください。

## 設定一覧

生成したプロジェクトでは、ローカルディレクトリまたは S3 互換ストレージへの接続設定を `config/_storage.yml` に記述します。アプリの起動コードがファイルを読み込み、設定オブジェクトを `storage.init(config)` に渡します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/storage.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/storage.md)（中国語）を参照してください。

- `storage.init` / `storage.close` / `storage.config` / `storage.isInitialized` — ローカルディレクトリまたは S3 互換ストレージを選び、接続状態を確認し、終了時にリソースを解放する
- `storage.file` / `storage.dir` / `storage.checksum` / `storage.presign` — ファイルを読み書きし、ディレクトリを一覧表示し、チェックサムを検証し、S3 オブジェクト用の期限付きリンクを作る
- `@h-ai/storage/client` / `@h-ai/storage/schemas` — ブラウザーでのアップロード、ダウンロード、キー検証

## データ構造

モジュール独自のデータベーステーブルは作成しません。

ローカルファイルと S3 オブジェクト、キー、メタデータ、保持期間については[データ構造](../../docs/usage/data/storage.md)（中国語）を参照してください。

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
