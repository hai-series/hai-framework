# @h-ai/api-contract API リファレンス

<!-- translation: partial -->

[原文（中国語）](api-contract.md) · [設定](../configuration/api-contract.ja.md) · [データ構造](../data/api-contract.ja.md)

<a id="quick-start"></a>

## クイックスタート

`@h-ai/api-contract` から `apiContract` をインポートします。アプリの契約を組み立て、サーバーの処理と型付きクライアントで共有します。

```ts
import { apiContract } from '@h-ai/api-contract'

// Compose the built-in IAM and storage routers into contract. Passing false omits AI. This only defines the contract.
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
    // Describe POST /app/ping with operation ID app.ping and the app tag. This returns a route builder.
    .route({
      method: 'POST',
      path: '/app/ping',
      operationId: 'app.ping',
      tags: ['app']
    })
    // Use a boolean pong schema as the success data. The output builder also includes the HaiResult failure shape.
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
| `apiContract.create(options)` | ドメインの契約を組み合わせる | 必須の `options: CreateApiContractOptions` には業務ドメイン名と契約ルーターの対応を渡します。`false` または `undefined` のドメインは除外します。 [契約とルートの項目](#contract-route-options)を参照してください。 | `{ iam: IamContract }` | `apiContract.create({ iam: apiContract.iam, payment: false })` |
| `apiContract.route(route)` | HTTP エンドポイントを宣言 | 必須の `route: Route` に HTTP の `method` と `/` で始まる `path` を指定します。`summary`、`description`、`tags` などの OpenAPI メタデータも指定できます。 [契約とルートの項目](#contract-route-options)を参照してください。 | `ContractProcedureBuilder` | `apiContract.route({ method: "GET", path: "/status" })` |
| `apiContract.pathOf(procedure)` | 宣言済みの HTTP パスを取得 | 必須の `procedure: AnyContractProcedure` には HTTP パスを宣言済みの procedure を渡します。 | `string: "/auth/login"` | `apiContract.pathOf(apiContract.iam.auth.login)` |

<a id="contract-route-options"></a>

##### 契約とルートの項目

契約と HTTP の対応を設定する項目です。例の `{ status, iam: apiContract.iam, payment: false }` は `status` と `iam` だけを持つ契約になり、`/auth/login` を取得します。

| 項目 | 既定値または必須 | 動作と適用条件 |
| --- | --- | --- |
| `options[domain]` | オブジェクトは必須。ドメインは任意 | 各キーはルーターまたは procedure の名前です。常に有効な名前付きドメインは必須、常に無効なドメインは除外、条件付きで有効なドメインは省略可能です。実行時には有効なドメインが含まれます。 |
| `route.method / route.path` | 任意。HTTP 入口では明示を推奨 | `method` は HTTP メソッド、`path` は `/` から始まるパス。`pathOf` には宣言済みのパスが必要です。 |
| `route.operationId` | 既定はルーターのパス要素の連結 | OpenAPI の操作識別子を上書きします。 |
| `route.summary / route.description / route.deprecated / route.tags` | 省略可 | OpenAPI の要約、説明、非推奨フラグと分類タグです。 |
| `route.successStatus / route.successDescription` | `200` / `OK` | 成功時のステータスと説明です。ステータスは 200～399 を指定します。 |
| `route.inputStructure` | `compact` | `compact` はパス引数とクエリまたは本文をまとめます。`detailed` は `params`、`query`、`headers`、`body` を個別に渡します。 |
| `route.outputStructure` | `compact` | `compact` は出力をそのまま本文にします。`detailed` は `status`、`headers`、`body` を受け取り、`status` の省略時は `successStatus` を使います。 |
| `route.spec` | 省略時は自動生成 | OpenAPI Operation Object、または生成済み operation を受け取って置き換える関数を指定できます。 |

#### 利用例：HTTP 契約の定義と組合せ

契約オブジェクト自体はポートを開きません。ルート・Schema、サーバー実装、型付きクライアントの役割を示します。

![同じ契約をクライアントとサーバーで共有](../images/function-api-contract-boundaries.ja.svg)

同じ入出力定義でサーバー実装とクライアント型を確認します。本人確認、リソースの認可、業務処理はサーバーが行います。契約の作成やブラウザー側の検証だけでは代替できません。

```ts
import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'
// Create a route builder for GET /status. No handler runs while defining the route.
const status = apiContract.route({ method: 'GET', path: '/status' })
  // Set the output to HaiResult with a boolean ready field. Success data has ready and failures use the error shape.
  .output(apiContract.haiResultSchema(z.object({ ready: z.boolean() })))
// Compose the local status route with IAM. Passing false leaves payment out.
const contract = apiContract.create({ status, iam: apiContract.iam, payment: false })
// Read the relative path of the built-in login procedure. It yields /auth/login.
apiContract.pathOf(apiContract.iam.auth.login) // '/auth/login'
// contract includes status and iam; payment is omitted
```

GET /status と使用するモジュールを入力して契約オブジェクトを得ます。HTTP サーバーの起動は Serv/Kit で行います。

通常の JSON 業務 API は `HaiResult<T>` を使います。Alipay の非同期通知には HTTP 200 とプレーンテキストの本文 `success` を返します。[Alipay の通知応答](./payment.ja.md#alipay-notification-ack)を参照してください。

[引数と手順の詳細](api-contract.md#routes)

<a id="conditional-domains"></a>

#### 利用例：設定に応じて任意のドメインを有効にする

アプリの起動時に設定から決済の有効・無効を読み取ります。`satisfies` で名前付きドメインと条件付きの型を保持します。決済が無効な場合、`contract.payment` とクライアントの `payment` は `undefined` になります。任意のドメインには `?.` でアクセスできます。

```ts
import { type CreateApiContractOptions, apiContract } from '@h-ai/api-contract'

function buildContract(enablePayment: boolean) {
  const domains = {
    iam: apiContract.iam,
    payment: enablePayment ? apiContract.payment : false,
  } satisfies CreateApiContractOptions
  // IAM は常に登録し、決済は設定に応じて登録します。
  const contract = apiContract.create(domains)
  const get = contract.payment?.orders.get
  // 決済が有効なら注文照会のパスを、無効なら undefined を返します。
  const queryPath = get ? apiContract.pathOf(get) : undefined
  return { contract, queryPath }
}
```

<a id="serv-iam-wiring"></a>

#### 利用例：IAM 契約を Serv に登録する

ホストで IAM と必要な依存モジュールを初期化した後、同じ IAM インスタンスを procedure の作成と `serv.createApp` の両方に渡します。procedure は処理関数を提供します。アプリは IAM で Bearer トークンを検証し、ルートの認証ガードにセッションを渡します。

```ts
import type { IamFunctions } from '@h-ai/iam'
import { apiContract } from '@h-ai/api-contract'
import { serv } from '@h-ai/serv'

function mountIamApi(iam: IamFunctions) {
  const contract = apiContract.create({ iam: apiContract.iam })
  const procedures = { iam: serv.createIamProcedures({ iam }) }
  // 初期化済みの IAM を /api/v1 配下に組み込み、HTTP アプリを返します。
  return serv.createApp({ contract, procedures, iam, http: { apiPrefix: '/api/v1' } })
}
```

テスト用アカウントでログインした後、`GET /api/v1/auth/me` に `Authorization: Bearer <accessToken>` を送信します。セッションが有効なら `success: true` と利用者情報、ロール、権限が返ります。トークンを省略すると未認証の失敗結果が返ります。

OpenAPI は、公開 IAM 操作の `createCaptcha`、`publicConfig`、`renewPassword`、`loginWithLdap`、`requestPasswordReset`、`confirmPasswordReset`、`login`、`loginWithOtp`、`refresh`、`sendOtp`、`register` に `security: []` を設定します。Bearer トークンなしで呼び出せます。個々の操作の入力や資格情報はサーバー側で検証されます。`currentUser` など保護された操作にはサービスの Bearer 要件が適用されます。

<a id="response-schemas"></a>

### 結果とページの検証：`apiContract.*Schema`

構造の検証と業務の成功を区別します。safeParse.success は形の検証だけです。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `apiContract.haiResultSchema(dataSchema)` | 校验成功或失败结果 | 必須の `dataSchema` には成功時の `data` の Zod スキーマを渡します。 | `ZodSchema<HaiResult<string>>` | `apiContract.haiResultSchema(z.string())` |
| `apiContract.voidResultSchema` | 校验无业务数据的结果 | スキーマ定数です。例の `safeParse(input)` で業務データのない結果を検証します。 | `ZodSchema<HaiResult<void>>` | `apiContract.voidResultSchema.safeParse({ success: true, data: undefined })` |
| `apiContract.paginatedSchema(itemSchema)` | 校验分页列表 | 必須の `itemSchema` はページ結果の `items` に入る 1 件分の Zod スキーマです。 | `ZodSchema<{ items: { id: string }[], total: number, page: number, pageSize: number }>` | `apiContract.paginatedSchema(z.object({ id: z.string() }))` |

#### 利用例：結果とページの検証

```ts
import { z } from 'zod'

// Build a result schema whose success data is a string. Its failure variant carries HaiError.
const stringResult = apiContract.haiResultSchema(z.string())
// Validate a ready success envelope. checked.success is true and checked.data contains that envelope.
const checked = stringResult.safeParse({ success: true, data: 'ready' })
// checked.success === true; checked.data is HaiResult<string>
// Validate success with undefined data. This is valid for the void result schema.
apiContract.voidResultSchema.safeParse({ success: true, data: undefined }).success // true
// Build a paginated schema whose items each have a string id.
const pageSchema = apiContract.paginatedSchema(z.object({ id: z.string() }))
// Validate page 1 of one order at page size 20. The record fits the schema, so success is true.
pageSchema.safeParse({ items: [{ id: 'o1' }], total: 1, page: 1, pageSize: 20 }).success // true
// A numeric success value is invalid for the string schema, so success is false.
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
// Compose the five supplied module routers into a new standard contract. No routes execute during assembly.
const standard = apiContract.create({
  iam: apiContract.iam,
  storage: apiContract.storage,
  ai: apiContract.ai,
  payment: apiContract.payment,
  feedback: apiContract.feedback,
})
// standard has these five routers; no business operation runs during composition
```

五つのルーターでアプリの契約を構成します。フィードバックでは `reports.policy({})` で有効な容量を取得し、`reports.listMine({ page: 1 })` でログイン中の利用者本人の報告を取得します。管理用の一覧には `reports.list` を使います。

[認証設定、チャレンジ、フィードバックの Schema とページ離脱時の動作（中国語）](api-contract.md#domains)
