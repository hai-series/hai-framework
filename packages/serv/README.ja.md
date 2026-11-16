# @h-ai/serv

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/ai](../ai/README.ja.md) · [@h-ai/api-contract](../api-contract/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md) · [@h-ai/iam](../iam/README.ja.md) · [@h-ai/storage](../storage/README.ja.md)

hai-framework の API サービスランタイム。公開 HTTP App 抽象を通じて `@h-ai/api-contract` を複数プラットフォームから使える HTTP API として提供します。Hono は内部実装です。

実行時の操作は `serv.xx` を使います。名前空間の型注釈や再エクスポートにはルート入口の `ServFunctions` を利用できます。context ファクトリーと汎用 `implement` の公開シグネチャーは利用側の宣言生成に対応し、内部ビルドパスや独立した helper は不要です。

## クイックスタート

アプリの起動時に `core`、`iam`、`storage`、`ai` を初期化し、`serv` の設定を読み込んで検証してから `startApi(closeApp)` を呼び出します。`closeApp` は業務リソースを初期化と逆の順序で解放する非同期コールバックです。関数は Node のリスナーハンドルを返します。コールバックを渡すと、終了シグナルの受信時に `serv.listen` がリスナーを閉じてから呼び出します。ヘルスチェックだけを提供する場合は、空の契約と procedures でアプリを作成できます。

```ts
import type { ServConfig } from '@h-ai/serv'
import { ai } from '@h-ai/ai'
import { apiContract } from '@h-ai/api-contract'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { createAiProcedures } from '@h-ai/serv/features/ai'
import { createIamProcedures } from '@h-ai/serv/features/iam'
import { createStorageProcedures } from '@h-ai/serv/features/storage'
import { storage } from '@h-ai/storage'

export function startApi(closeApp: () => Promise<void>) {
  // 3 つのモジュールの契約から HTTP ルートの契約を作成します。
  const contract = apiContract.create({ iam: apiContract.iam, storage: apiContract.storage, ai: apiContract.ai })

  // 初期化済みのモジュールを procedures に結び付け、各ストレージキーの所有権を確認します。
  const procedures = {
    iam: createIamProcedures({ iam }),
    storage: createStorageProcedures({
      storage,
      authorize: ({ context, keys }) => keys.every(key =>
        key.startsWith(`users/${encodeURIComponent(context.session.userId)}/`)),
    }),
    ai: createAiProcedures({ ai }),
  }

  // 契約、procedures、HTTP 設定を使ってアプリを組み立てます。
  const app = serv.createApp({
    contract,
    procedures,
    iam,
    http: {
      apiPrefix: '/api/v1',
      openapi: { path: '/openapi.json' },
      docs: { path: '/docs' },
    },
  })

  // 読み込み済みのリスナー設定を使い、アドレスと close() を持つハンドルを返します。
  const { server } = core.config.getOrThrow<ServConfig>('serv')
  return serv.listen(app, {
    host: server.host,
    port: server.port,
    onListening: info => core.logger.info('API service listening', { port: info.port }),
    onClose: closeApp,
  })
}
```

Storage procedures には `authorize({ context, operation, keys })` が必須で、未設定の場合はアクセスを拒否します。認証済み session から所有者・テナントを判定し、ダウンロード、アップロード、一覧、メタデータ、削除に適用します。上記の例は `users/<エンコードした userId>/` 配下だけを許可し、一覧にもその prefix が必要です。一括処理はすべての key が許可された後に実行し、管理者アクセスはアプリ側で明示的に許可します。

`storage.files.deleteMany` の成功データは `{ deletedKeys, failures: [] }` です。失敗進捗は `error.ext.deleteMany`（`failed / unknown / notAttempted`）にあり、HTTP 200 だけで完了と判断しません。[Storage の一括削除](../../docs/usage/function/storage.md#api-概览)を参照してください。

AI procedures は省略された `objectId` を信頼できる `context.session.userId` に結び付けます。会話・メッセージの保存、履歴、会話一覧、記憶 recall/list は認可された主体で処理し、会話は `objectId + sessionId` で分離します。書き込み時の sessionId の既定値は `default` です。他の objectId へのアクセスは既定で拒否し、管理者も信頼できる権限とテナント関係を検証する明示的な `authorizeObject` ポリシーが必要です。

`chats.createCompletion`（`POST /ai/chats/completions`）は非ストリーミングの `HaiResult<AiChatCompletionData>` を一度返します。function `tools` のネストした JSON Schema と `strict`、`tool_choice`（`auto` / `none` / `required` / 提供した関数名）をモデルへ渡し、役割、`name`、ユーザー画像、ツール呼び出しを保持します。ツール結果には `role: 'tool'` と空でない `tool_call_id` が必須で、指定名は今回のツール定義に含まれる必要があります。procedure はツールを実行しません。アプリ側で認可・実行後、助手の `tool_calls` と対応する結果を送信します。入力に `stream` はなく、`true` / `false` とも Provider 呼び出し前に HTTP 400 で拒否します。ストリーミングには `ai.llm.chatStream()` と対応する出力型を使う専用 endpoint を定義します。

## 設定一覧

生成プロジェクトは `config/_serv.yml` を使用します。アプリで設定を取り込む入口は `serv.createApp(options)` です。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/serv.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/serv.md)（中国語）を参照してください。

- `createApp` / `listen` / `toFetch` / `cors` / `storageAssets` — HTTP アプリの組み立て、実行環境への適合、静的ファイルの配信
- `implement` / `validateInputOrFail` / `generateSpec` / `m` — 型付きエンドポイント、入力検証、OpenAPI 生成
- `parseRequestContext` / `buildAuthContextFactory` / `resolveRequestLocale` / `createRuntimeSecurityPolicy` — リクエスト情報、認証、言語、アクセスポリシーの解決
- `@h-ai/serv/features/*` — IAM、ストレージ、AI、フィードバック API の組み込み

## データ構造

モジュール独自のデータベーステーブルは作成しません。

HTTP コンテキスト、セッション、静的ファイル、永続化の責務については[データ構造](../../docs/usage/data/serv.md)（中国語）を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/serv test
pnpm --filter @h-ai/serv typecheck
pnpm --filter @h-ai/serv lint
```

宣言の JSDoc 例は実在する `@h-ai/serv` または公開 features サブパスから import します。内部 Hono・guard・router・transport は「模块内部上下文」と明記し、ルート API として扱いません。起動設定の例外、業務 HaiResult、HTTP middleware の status、listener の Promise<void> 終了を区別し、既定の AI completion は非ストリーミング JSON のままです。保守時は `node scripts/check-module-jsdoc.mjs --package serv` で実際の宣言と内部スコープに対して例をコンパイルします。実 HTTP、認可、共有リプレイ防止の検証を代替しません。

## ライセンス

Apache-2.0
