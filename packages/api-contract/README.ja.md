# @h-ai/api-contract

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

## 概要

hai-framework の公開 HTTP API 契約パッケージ。oRPC contract + Zod を唯一の定義元として使用します。

## 主な機能

- `apiContract.iam`、`apiContract.storage`、`apiContract.ai`、`apiContract.payment`：ドメイン単位の contract。
- `apiContract.create()`：アプリケーションに必要なドメインの contract を組み合わせる。
- `apiContract.route()`：アプリケーションの contract で再利用する独自 HTTP ルートのメタデータを定義。
- `apiContract.pathOf()`：contract procedure から業務パスを取得し、middleware/client で再利用。
- `apiContract.haiResultSchema()` / `apiContract.voidResultSchema` / `apiContract.paginatedSchema()`：共通 DTO Schema のファクトリー。
- 共通 DTO Schema：すべての HTTP 出力を `HaiResult<T>` でラップ。
- IAM Token DTO は httpOnly cookie に対応。レスポンス本文に `refreshToken` が含まれない場合は、サーバーが `Set-Cookie` で管理します。
- IAM の `auth.currentUser` はユーザー情報と現在のサーバーセッションの `roles` / `permissions` を返します。セッション復元のためにクライアントが権限のスナップショットを永続化する必要はありません。

支払い作成の入出力は WeChat `jsapi`・Alipay `h5`・Stripe `h5` のみ受け付け、WeChat は `userId`（openid）が必須です。App・Native・ミニプログラムなどは検証で拒否します。Alipay は `{ gateway, fields }` のページパラメーターを返し、作成成功は支払い完了を意味しません。クライアント処理は [Payment](../payment/README.ja.md) を参照してください。

## 使い始める

### クイックスタート

```ts
import { apiContract } from '@h-ai/api-contract'

export const contract = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  ai: false,
})
```

独自のアプリケーション contract も、このパッケージでルートを定義します。`@h-ai/serv` への依存は不要です：

```ts
import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'

export const appContract = {
  ping: apiContract
    .route({ method: 'POST', path: '/app/ping', operationId: 'app.ping', tags: ['app'] })
    .output(apiContract.haiResultSchema(z.object({ pong: z.boolean() }))),
}
```

### API 契約

```ts
import { apiContract } from '@h-ai/api-contract'

const myContract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

myContract.iam.auth.login
myContract.storage.presignedUrls.createUpload
myContract.ai.chats.createCompletion
```

`ai.chats.createCompletion` は `POST /ai/chats/completions` で、非ストリーミングの `HaiResult<AiChatCompletionData>` を返します。厳密な入力 Schema は `stream` など未定義のフィールドを拒否します。function ツールのネストした JSON Schema と `strict` を保持し、選択は `auto` / `none` / `required` / 提供した関数名に対応します。system/assistant/tool はテキスト、user は画像にも対応し、ツール結果の空でない `tool_call_id`、助手の内容または `tool_calls` が必須です。アプリがツールを認可・実行し、ストリーミング用には別の契約を定義します。

クライアントは `@h-ai/api-client` でネストしたメソッドを直接呼び出します：

```ts
import { apiClient } from '@h-ai/api-client'

await apiClient.init({ baseUrl: 'https://api.example.com/api/v1' })
const login = await apiClient.iam.auth.login({ identifier: 'alice', password: 'secret' })
await apiClient.close()
```

サーバーは `@h-ai/serv` で contract をマウントします：

```ts
import { apiContract } from '@h-ai/api-contract'
import { serv } from '@h-ai/serv'

const contract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

const app = serv.createApp({
  contract,
  procedures,
  http: { apiPrefix: '/api/v1' },
})
```

### API 一覧

- `apiContract.create(options)`：`false` / `undefined` のドメインを除外し、アプリケーション contract を構成。
- `apiContract.route(routeConfig)`：独自 endpoint の method/path/operationId/tags などのルートメタデータを定義。
- `apiContract.pathOf(procedure)`：`*-contract.ts` に宣言された業務パスを取得。独立した routes 定数の管理は不要です。
- `apiContract.haiResultSchema(dataSchema)` / `apiContract.voidResultSchema` / `apiContract.paginatedSchema(itemSchema)`：共通 DTO Schema のファクトリー。
- `Iam*Schema` / `Storage*Schema` / `Ai*Schema` / `Payment*Schema`：複数の API・層で再利用する入力とデータ構造。

`storage.files.deleteMany` の成功データは `{ deletedKeys, failures: [] }` です。失敗進捗は `error.ext.deleteMany`（`failed / unknown / notAttempted`）にあり、HTTP 200 だけで完了と判断しません。[Storage の一括削除](../storage/README.ja.md#api-一覧)を参照してください。

業務 path は対応する `*-contract.ts` に直接記述します。一度しか使わない出力 Schema は `.output(...)` にインラインで定義します。同じ contract ファイル内で再利用する場合は非公開の定数にできますが、schemas からエクスポートしてはいけません。

### 設定

このパッケージには実行時設定がなく、環境変数も読み込みません。

### 設定による認証画面

規約は設定の userAgreementMarkdown/privacyPolicyMarkdown または URL を使用できます。同じ規約は Markdown 本文を優先して安全な Modal で描画します。

IAM に公開設定、LDAP、復旧要求と確定の標準 route を追加しました。IamPublicConfig は安全な Schema で、登録パスワードの長さは IAM 設定に従います。

[完整 IAM 配置 / IAM configuration](../iam/README.ja.md)

### エラー処理

Contract は入出力構造のみを定義します。業務エラーは procedure が返す `HaiResult<T>` で表し、クライアント側で業務例外を捕捉する必要はありません。

## 開発とテスト

```bash
pnpm --filter @h-ai/api-contract test
pnpm --filter @h-ai/api-contract typecheck
```

## ライセンス

Apache-2.0

## 入力制約と HTTP 機能

キーは UTF-8 で最大 1024 バイトで、絶対パス、バックスラッシュ、制御文字、ドットセグメントを拒否します。公開 HTTP 一括削除は一度に 1–1000 件です。共通規則はブラウザー対応の `@h-ai/storage/schemas` から参照できます。署名有効期限は整数 1–604800 秒（Node 既定 3600、HTTP 既定 900）。アップロード署名の入力は key/contentType/expiresIn のみで、contentLength/maxSize/metadata/checksum は未対応です。不正入力は HTTP 400、typed client では VALIDATION_FAILED です。FileUpload の制限は選択時の補助であり、実際のオブジェクトはサーバーで検証してください。Node のストリーム/checksum/条件付き書き込みには既定の HTTP エンドポイントがありません。[機能と認可の対応表（中国語）](../../docs/storage-api-capabilities.md)を参照してください。
