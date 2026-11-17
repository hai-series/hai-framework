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

<a id="api-一覧"></a>

<a id="api-reference"></a>

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

<a id="routes"></a>

### HTTP 契約の定義と組合せ：`apiContract`

契約はパス・入力・出力を定義し、通信は行いません。同じ定義をサーバーとクライアントで使います。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiContract.create` | 组合应用接口 | `{ iam: apiContract.iam, payment: false }` | `{ iam: IamContract }` | `apiContract.create({ iam: apiContract.iam, payment: false })` |
| `apiContract.route` | 声明 HTTP 接口 | `{ method: "GET", path: "/status" }` | `ContractProcedureBuilder` | `apiContract.route({ method: "GET", path: "/status" })` |
| `apiContract.pathOf` | 取唯一业务路径 | `apiContract.iam.auth.login` | `string: "/auth/login"` | `apiContract.pathOf(apiContract.iam.auth.login)` |

#### 利用例：HTTP 契約の定義と組合せ

```ts
import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'
const status = apiContract.route({ method: 'GET', path: '/status' })
  .output(apiContract.haiResultSchema(z.object({ ready: z.boolean() })))
const contract = apiContract.create({ status, iam: apiContract.iam, payment: false })
apiContract.pathOf(apiContract.iam.auth.login) // '/auth/login'
// contract includes status and iam; payment is omitted
```

GET /status と使用するモジュールを入力して契約オブジェクトを得ます。HTTP サーバーの起動は Serv/Kit で行います。

[引数と手順の詳細](api-contract.md#routes)

<a id="response-schemas"></a>

### 結果とページの検証：`apiContract.*Schema`

構造の検証と業務の成功を区別します。safeParse.success は形の検証だけです。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiContract.haiResultSchema` | 校验成功或失败结果 | `z.string()` | `ZodSchema<HaiResult<string>>` | `apiContract.haiResultSchema(z.string())` |
| `apiContract.voidResultSchema` | 校验无业务数据的结果 | `{ success: true, data: undefined }` | `ZodSchema<HaiResult<void>>` | `apiContract.voidResultSchema.safeParse({ success: true, data: undefined })` |
| `apiContract.paginatedSchema` | 校验分页列表 | `z.object({ id: z.string() })` | `ZodSchema<{ items: { id: string }[], total: number, page: number, pageSize: number }>` | `apiContract.paginatedSchema(z.object({ id: z.string() }))` |

#### 利用例：結果とページの検証

```ts
import { z } from 'zod'

const stringResult = apiContract.haiResultSchema(z.string())
const checked = stringResult.safeParse({ success: true, data: 'ready' })
// checked.success === true; checked.data is HaiResult<string>
apiContract.voidResultSchema.safeParse({ success: true, data: undefined }).success // true
const pageSchema = apiContract.paginatedSchema(z.object({ id: z.string() }))
pageSchema.safeParse({ items: [{ id: 'o1' }], total: 1, page: 1, pageSize: 20 }).success // true
stringResult.safeParse({ success: true, data: 42 }).success // false
```

文字列・void・ページと型違いを入力します。出力は検証の成否で、内側の HaiResult.success も確認します。

[引数と手順の詳細](api-contract.md#response-schemas)

<a id="domains"></a>

### 標準業務インターフェースの選択：`apiContract`

実装する標準領域を選び、実サービスと主体・資源の権限確認を接続します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiContract.iam` | 认证与账号接口 | `—` | `iam contract router` | `apiContract.create({ iam: apiContract.iam })` |
| `apiContract.storage` | 文件接口 | `—` | `storage contract router` | `apiContract.create({ storage: apiContract.storage })` |
| `apiContract.ai` | AI 接口 | `—` | `ai contract router` | `apiContract.create({ ai: apiContract.ai })` |
| `apiContract.payment` | 支付接口 | `—` | `payment contract router` | `apiContract.create({ payment: apiContract.payment })` |
| `apiContract.feedback` | 反馈接口 | `—` | `feedback contract router` | `apiContract.create({ feedback: apiContract.feedback })` |

#### 利用例：標準業務インターフェースの選択

```ts
const standard = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  ai: apiContract.ai,
  payment: apiContract.payment,
  feedback: apiContract.feedback,
})
// standard has these five routers; no business operation runs during composition
```

五つの既存ルーターから木構造を作り、業務は実行しません。認証・チャレンジ・フィードバック・離脱時の境界を以下に示します。

[引数と手順の詳細](api-contract.md#domains)
