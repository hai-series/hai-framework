# @h-ai/api-contract API リファレンス

[原文（中国語）](api-contract.md) · [設定](../configuration/api-contract.ja.md) · [データ構造](../data/api-contract.ja.md)

<a id="quick-start"></a>

## クイックスタート

`@h-ai/api-contract` から `apiContract` をインポートします。アプリの契約を組み立て、サーバーの処理と型付きクライアントで共有します。

```ts
import { apiContract } from '@h-ai/api-contract'

export const contract = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  ai: false,
})
```

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

<a id="api-reference"></a>

## API 一覧

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `apiContract.create(domains)` | 利用するドメインからルーターを作成。false のドメインは除外。 | `apiContract.create({ iam: apiContract.iam, payment: false })` |
| `apiContract.route(options)` | HTTP メソッドとパスを宣言し、入出力スキーマを設定するビルダーを返す。 | `apiContract.route({ method: 'GET', path: '/status' })` |
| `apiContract.pathOf(procedure)` | 契約のプロシージャからパスを取得。 | `apiContract.pathOf(apiContract.iam.auth.login)` |
| `apiContract.haiResultSchema(schema)`, `voidResultSchema` | 成功・失敗のレスポンス、またはデータを伴わない成功を検証。 | `apiContract.haiResultSchema(z.string())` |
| `apiContract.paginatedSchema(itemSchema)` | 要素と総件数を持つページのスキーマを返す。 | `apiContract.paginatedSchema(z.string())` |
| `apiContract.iam`, `storage`, `ai`, `feedback`, `payment` | 組み込みのドメイン契約。対応する処理を実装した場合に組み込む。 | `apiContract.create({ storage: apiContract.storage })` |
