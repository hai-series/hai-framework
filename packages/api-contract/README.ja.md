# @h-ai/api-contract

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md)

hai-framework の公開 HTTP API 契約パッケージ。oRPC contract + Zod を唯一の定義元として使用します。

## クイックスタート

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
    .route({
      method: 'POST',
      path: '/app/ping',
      operationId: 'app.ping',
      tags: ['app']
    })
    .output(apiContract.haiResultSchema(z.object({
      pong: z.boolean()
    }))),
}
```

## 設定一覧

アプリが公開するインターフェース定義を `apiContract.create(options)` に渡します。オプションのキーが各グループ名になります。返された契約はサーバー、型付きクライアント、API ドキュメントで共有できます。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/api-contract.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/api-contract.md)（中国語）を参照してください。

- `apiContract.create` / `apiContract.route` / `apiContract.pathOf` — インターフェース定義をまとめ、HTTP メソッドとパスを定義し、既存のパスを取得する
- `apiContract.haiResultSchema` / `apiContract.voidResultSchema` / `apiContract.paginatedSchema` — 成功・エラーの応答やページ付き結果の構造を定義する
- `apiContract.iam` / `apiContract.storage` / `apiContract.ai` / `apiContract.payment` / `apiContract.feedback` — 認証、ファイル、AI、決済、フィードバックの API 定義を再利用する

## データ構造

モジュール独自のデータベーステーブルは作成しません。

公開 HTTP ペイロードと永続化の責務については[データ構造](../../docs/usage/data/api-contract.md)（中国語）を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/api-contract test
pnpm --filter @h-ai/api-contract typecheck
```

Schema、推論型と組合せツールには型検査できる例があります。[JSDoc 規約（中国語）](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) を参照してください。Schema のローカル例は provider の実行証明ではありません。

## ライセンス

Apache-2.0
