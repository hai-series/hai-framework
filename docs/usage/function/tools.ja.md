# @h-ai/tools 機能説明

`tools` で業務ツールを定義・登録・実行します。業務コード、画面操作、AI から同じ実装を利用できます。

[モジュール README](../../../packages/tools/README.ja.md) · [設定](../configuration/tools.ja.md) · [データの帰属](../data/tools.ja.md)

## エントリーポイントの選択

| インポート先 | 用途 | 実行とライフサイクル |
| --- | --- | --- |
| `@h-ai/tools` | 短時間の業務関数、ブラウザー内ツール、モデル連携用の中立な定義 | `tools.define/createRegistry` は純粋な定義・ファクトリー。`init/close` は不要で、Runner やモデル SDK を読み込まない |
| `@h-ai/tools/server` | 再開可能なタスク、進捗・キャンセル、文書とコンテナジョブ | 軽量メソッドに `tools.createService/createArtifactTools/createJobTools` を追加。初期化済み Runner を利用する |

軽量エントリーはブラウザーでも利用できますが、サーバーの権限は信頼できるサーバー側で検証します。`/server` をフロントエンドにインポートしないでください。

<a id="quick-start"></a>

## 最小構成

```sh
pnpm add @h-ai/tools zod
```

通常の業務呼び出しの例です。登録したツールだけを使用し、信頼できるサーバーから本人情報を渡します。

```ts
import { tools } from '@h-ai/tools'
import { z } from 'zod'

export async function calculate(objectId: string) {
  const registry = tools.createRegistry({
    authorize: ({ context }) => context.objectId === objectId,
  })
  const registered = registry.register(tools.define({
    name: 'sum',
    title: '合計',
    description: 'Add two numbers',
    examples: [{ label: '2 + 3', input: { a: 2, b: 3 } }],
    parameters: z.object({ a: z.number(), b: z.number() }),
    handler: ({ a, b }) => ({ total: a + b }),
  }))
  if (!registered.success)
    return registered
  return registry.execute('sum', { a: 2, b: 3 }, { objectId })
}
```

成功時の `data` は `{ total: 5 }` です。`title` は画面の表示名で、安定した `name` はプロトコルと有効化ルールの識別子です。`examples` はフォームのプリセットで、自動実行や権限付与は行いません。`tool.toDefinition()` と登録器の定義にも含まれます。

既存サービスが `HaiResult` を返す場合は `resultHandler`、通常データを返す場合は `handler` を使います。必ず片方だけを指定します。失敗の `HaiResult` を `handler` で返すと、成功データとして包まれてしまいます。

```ts
import type { HaiResult } from '@h-ai/core'
import { tools } from '@h-ai/tools'
import { z } from 'zod'

export function createLookup(read: (id: string) => Promise<HaiResult<string>>) {
  return tools.define({
    name: 'document_lookup',
    description: 'Read an authorized document',
    parameters: z.object({ id: z.string().min(1) }),
    resultHandler: ({ id }) => read(id),
  })
}
```

<a id="api-reference"></a>

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

Tools にモジュール単位の init/close はありません。軽量機能はルート、サーバー機能は /server から読み込み、初期化済み Runner を借用します。value は HaiResult.success を確認し元エラーを保持します。独立したテストデータと明示した後片付けを使います。

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="definitions"></a>

### 単一ツールの定義と実行：`tools.define`

入力検証と業務関数を結び付けます。定義だけでは動かず、execute で実行します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `tools.define` | ツールを定義し、実行時に入力を検証する。既定のタイムアウトは `30000` ms。定義が無効なら `TypeError` | `definition` | `Tool<TInput, TOutput>` | `const tool = tools.define(definition)` |
| `tool.execute` | 入力を検証して実行する。利用者、認可、キャンセル信号、期限も指定できる | 可另外传身份、授权、取消信号和期限；`input, options? = {}` | `Promise<HaiResult<TOutput>>` | `await tool.execute({ a: 2, b: 3 })` |
| `tool.toDefinition` | 入力の規則を JSON Schema に変換する。変換できないときは例外 | 无 | `ToolDefinition` | `tool.toDefinition()` |

#### 利用例：単一ツールの定義と実行

定義時は handler を実行しません。execute は入力検証、認可、実行に共通の中止・時間制限を適用します。

![ツール実行：検証・認可・共通の期限](../images/function-tools-execution.ja.svg)

検証・認可に失敗したら handler に入りません。登録側と呼出側の認可は両方必要です。中止・期限切れは待機を止めますが、handler は signal に従う必要があり、外部処理は巻き戻しません。handler の値は data、resultHandler は既存の HaiResult を維持します。

```ts
import { z } from 'zod'
const tool = tools.define({
  name: 'sum', description: 'Add two numbers',
  parameters: z.object({ a: z.number(), b: z.number() }),
  handler: ({ a, b }) => ({ total: a + b }),
})
tool.toDefinition().name // 'sum'; parameters are JSON Schema
value(await tool.execute({ a: 2, b: 3 })) // { total: 5 }
const invalid = await tool.execute({ a: 'wrong', b: 3 }) // success false: VALIDATION_FAILED
```

二つの数から total=5 を得て、不正な a は処理に渡しません。既存 HaiResult には resultHandler を使います。定義誤りは TypeError、実行失敗は HaiResult です。

`tool` と `registry` はファクトリーの戻り値であり、パッケージ直下の関数ではありません。登録器は他のツールを自動発見せず、`tools.define` が作成したインスタンスだけを受け付けます。手書き・コピーしたオブジェクトは拒否します。

名前は ASCII 1～64 文字で、先頭は英字、以降は英数字・アンダースコア・ハイフンです。名前、既定タイムアウト、処理関数の組み合わせが不正な場合、定義エラーとして `TypeError` を送出します。モデル用のパラメーターは JSON Schema に変換可能である必要があり、通常はオブジェクト Schema を使います。`z.date()` など表現できない型は直接使用できません。

`HaiToolsError` は `hai:tools` 名前空間の NOT_FOUND、ALREADY_REGISTERED、VALIDATION_FAILED、EXECUTION_FAILED、FORBIDDEN、TIMEOUT、CANCELLED を含みます。入力・認可・期限・キャンセルの失敗は失敗の `HaiResult` を返します。`resultHandler` は既存の業務エラーを保持し、モデル JSON の解析エラーは AI アダプターが処理します。

固定ジョブの `TIMEOUT` は `HaiToolsError.TIMEOUT`、安全でない Office 文書・プロジェクトや既知の入力拒否は `VALIDATION_FAILED` に対応します。サンドボックスや依存関係の不足、不正なジョブ出力、未知のワーカ障害は `EXECUTION_FAILED` のままとし、ユーザー入力の誤りとして扱いません。公開メッセージは翻訳済みの文言を使い、ワーカの原文を表示しません。処理とコンテナの解放が両方失敗した場合は解放エラーを主エラーとし、最初の処理エラーを安全に整形して `error.ext.operationError` に保持します。単独の失敗ではこの拡張を追加しません。

#### 開発テスト

`pnpm --filter @h-ai/tools test` はカーネルとサービス、`pnpm --filter @h-ai/tools test:jobs` はジョブプロトコルを検証します。実イメージとブラウザーの受け入れは別途環境が必要です。ユニットテストだけで実イメージを検証済みとはしません。

<a id="call-options"></a>

#### 呼び出し引数

[機能説明](tools.ja.md) · [データの帰属](../data/tools.ja.md)

`tools.define/createRegistry` は純粋な定義・ファクトリーで、モジュール YAML・環境変数・`init/close` はありません。サーバー用は `@h-ai/tools/server` からインポートし、初期化済み Runner を利用します。

#### 定義と実行のオプション

| 場所 | フィールド | 既定値と用途 |
| --- | --- | --- |
| 定義 | `name/description/parameters` | 必須。名前は ASCII 1～64 文字、先頭は英字、以降は英数字・アンダースコア・ハイフン。Zod で入力を検証 |
| 定義 | `handler` または `resultHandler` | 片方だけ必須。通常データ、または既存の `HaiResult` を返す |
| 定義 | `title/examples` | 任意の表示名と `{ label, input }[]` プリセット。権限は変わらない |
| 定義 | `timeoutMs` | 整数 0～2147483647 ミリ秒。省略時 30 秒、0 は即時期限切れ |
| 登録器 | `authorize` | 任意。設定時は毎回の呼び出しで許可が必要 |
| 実行 | `signal` | 処理関数へ渡すキャンセルシグナル |
| 実行 | `objectId/sessionId` | 信頼済みの本人・セッション。未認証のモデル入力から取得しない |
| 実行 | `deadline/timeoutMs` | 絶対期限、呼び出し別、ツール、30 秒の順。検証・認可・処理を含む |
| 実行 | `authorize` | 呼び出し別の追加認可。登録器の認可と両方必要 |
| 一括実行 | `parallel` | 既定 false。並列可能な操作だけ有効にする |

不正な名前・既定タイムアウト・処理関数の組み合わせは定義時に `TypeError` を送出します。業務実行は `HaiResult` を返します。登録器は `tools.define` が作成したツールだけを受け付けます。モデル用パラメーターは JSON Schema に変換可能なものを使い、通常はオブジェクトにします。

#### ライフサイクルと複数ノード

Tools に全体の有効化スイッチはありません。各アプリケーションが設定からファクトリーと `enabled` を組み立てます。Hai Agent の `workbench.selection` は groups/tools/exclude を使い、省略時は既定の内蔵グループ、明示的な `{}` はすべて無効です。`workbench` スイッチ、グループ、環境割り当ては [Agent 使用説明](../../../apps/agent/README.ja.md#設定)、画像・音声モデルは [AI 設定](../configuration/ai.md) を参照してください。

同じサービスのノードは既存 Runner データベースと Storage を共有し、サービス ID・ツール定義・環境を揃えます。新しいキューや状態テーブルは作りません。API ノードは Runner `executor: false`、実行ノードは再起動後も安定した一意の `nodeId` を設定できます。実行ノードで有効化と認可を再確認するため、フロントエンドだけで無効化しないでください。

`close()` は自サービスのハンドラーだけを解除し、借りた Runner は終了しません。キャンセル後は終端まで状態を読み取り、待機の中断をプロセス終了と扱わないでください。

パラメーター・各イベント・出力は Runner の各 512 KiB JSON 上限も適用します。50 MiB ファイルと scratchMiB は別制約です。[データ境界](../data/tools.ja.md#サイズと保持期間) を参照してください。

[引数と手順の詳細](tools.md#definitions)

<a id="registry"></a>

### 登録・検索・一括実行：`tools.createRegistry`

ホストが明示したツールだけを登録し、実行権限をモデルでなく authorize で制御します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `tools.createRegistry` | `authorize` を省略すると、登録先独自の認可条件を適用しない空の登録先を作る | `options? = {}` | `ToolRegistryOperations` | `const registry = tools.createRegistry()` |
| `registry.register` | ツールのインスタンスを登録 | `tool` | `HaiResult<void>` | `registry.register(tool)` |
| `registry.registerMany` | 複数のツールを登録する。重複や無効な項目が一つでもあれば、どれも登録しない | `tools: Tool[]` | `HaiResult<void>` | `registry.registerMany([tool])` |
| `registry.replace` | 既存のツールを同名の新しい定義で置き換える。登録済みの名前が必要 | `tool` | `HaiResult<void>` | `registry.replace(updatedTool)` |
| `registry.unregister` | 指定した名前を削除する。登録済みの場合だけ `true` | `name` | `boolean` | `registry.unregister('sum')` |
| `registry.get` | 名前でツールを取得 | `name` | `Tool / undefined` | `registry.get('sum')` |
| `registry.has` | 名前が登録済みか確認する | `name` | `boolean` | `registry.has('sum')` |
| `registry.getNames` | 登録された名前を一覧にする | 无 | `string[]` | `registry.getNames()` |
| `registry.getDefinitions` | 登録済みツールの定義を返す。入力を JSON Schema に変換できないときは例外 | 无 | `ToolDefinition[]` | `registry.getDefinitions()` |
| `registry.execute` | 登録済みツールを実行する。登録先と呼び出しの両方に認可条件があれば、両方を満たす必要がある | `name, input, options? = {}` | `Promise<HaiResult<unknown>>` | `await registry.execute('sum', { a: 2, b: 3 })` |
| `registry.executeAll` | 既定では順に実行して最初の失敗で停止する。`parallel: true` では、失敗しても実行を開始した処理は取り消されない | `calls: ToolInvocation[], options?` | `Promise<HaiResult<unknown[]>>` | `await registry.executeAll([{ name: 'sum', input: { a: 2, b: 3 } }])` |
| `registry.clear` | 登録内容を消去する。進行中の呼び出しはキャンセルしない | 无 | `void` | `registry.clear()` |
| `registry.size` | 登録済みの件数を取得する（プロパティ） | 无 | `number` | `registry.size` |

#### 利用例：登録・検索・一括実行

```ts
// Continue with the sum tool from the preceding scenario.
const registry = tools.createRegistry({ authorize: ({ context }) => context.objectId === 'demo-user' })
value(registry.register(tool)) // undefined
value(registry.registerMany([])) // undefined; no tools added
registry.size // 1
registry.has('sum') // true
registry.get('sum')?.toDefinition().name // 'sum'
registry.getNames() // ['sum']
registry.getDefinitions().map(definition => definition.name) // ['sum']
value(await registry.execute('sum', { a: 2, b: 3 }, { objectId: 'demo-user' })) // { total: 5 }
value(await registry.executeAll([{ name: 'sum', input: { a: 4, b: 1 } }], { objectId: 'demo-user' })) // [{ total: 5 }]
value(registry.replace(tool)) // undefined; same registered name
registry.unregister('sum') // true
value(registry.registerMany([tool])) // undefined
registry.clear() // undefined
registry.size // 0
```

例では信頼する demo-user だけを許可し、実際の主体はサーバーで取得します。登録は void、照会はインスタンス・定義・名前・件数です。clear は実行中処理を止めません。

[引数と手順の詳細](tools.md#registry)

<a id="services"></a>

### 復元可能な業務タスク：`tools.createService`

サーバー工場は Runner を借り、一覧・投入・受付・照会・取消を復元可能な流れにします。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `tools.createService` | Runner を借用するツールサービスを作成 | `ToolServiceOptions`。id、runner、createTools、enabled、authorize 必須 | `HaiResult<ToolService>` | `tools.createService(options)` |
| `service.catalog` | 利用可能なツールを列挙 | 可信上下文 | `Promise<HaiResult<ToolCatalog>>` | `await service.catalog(context)` |
| `service.submit` | 永続ジョブを送信 | `{ name, input, idempotencyKey? }` とコンテキスト | `Promise<HaiResult<ToolRun>>` | `await service.submit(request, context)` |
| `service.find` | 冪等キーでジョブを検索 | 幂等键、可信上下文 | `Promise<HaiResult<ToolRun \| undefined>>` | `await service.find(key, context)` |
| `service.inspect` | ジョブの状態と結果を取得 | 完整回执、上下文、可选 `{ after }` | `Promise<HaiResult<ToolRun>>` | `await service.inspect(receipt, context)` |
| `service.cancel` | ジョブの中止を要求 | 完整回执、上下文 | `Promise<HaiResult<ToolRun>>` | `await service.cancel(receipt, context)` |
| `service.invoke` | ツールを呼び出して結果を待つ | 与 submit 相同 | `Promise<HaiResult<RunnerJson>>` | `await service.invoke(request, context)` |
| `service.close` | サービスと所有リソースを終了 | なし | `void` | `service.close()` |

#### 利用例：復元可能な業務タスク

service を作り、catalog から選択して同じキーで submit/find、完全な receipt で inspect/cancel します。invoke は終端を待ち、close は借用 Runner を閉じません。

#### 利用例：サーバータスクサービスを作る

[Runner](runner.ja.md) をインストール・初期化して `/server` からインポートします。ホストが本人情報、有効化、認可、成果物アクセスを提供します。サービスは借りた Runner を初期化・終了しません。

```ts
import type { RunnerFunctions } from '@h-ai/runner'
import type { ToolArtifactAccess } from '@h-ai/tools/server'
import { tools } from '@h-ai/tools/server'

export function createDocumentService(runner: RunnerFunctions, files: ToolArtifactAccess) {
  return tools.createService({
    id: 'documents',
    runner,
    createTools: context => tools.createArtifactTools({ context, files }),
    enabled: { groups: ['documents', 'analysis'] },
    authorize: ({ context }) => context.scope.userId.length > 0,
  })
}
```

例は信頼済みユーザーの存在だけを確認します。`files.read/publish/save` は本人、リソース、最終確定条件も検証してください。本人情報はモデル引数ではなく `ToolServiceContext.scope` に渡します。

業務結果は先に `success` を確認します。最終出力が必要な業務処理では `invoke`、長い画面操作では `submit/inspect` を使い、完全な受領情報と `queued/running/cancelling` などの実際の状態を保持します。キャンセルの応答だけではプロセス終了を証明できません。

`enabled` は必須です。指定グループと個別ツールの和集合から `exclude` を除きます。空オブジェクトはすべて無効です。`catalog` はファクトリーと有効化ルールで作成し、個々の `authorize` は呼びません。利用者別の非表示はコンテキストに応じた `createTools/enabled` で実施します。提出時と実行ノードで集合を作り直して認可するため、古いカタログから無効化を回避できません。

#### サービスファクトリーの引数

| フィールド | 必須・既定値 | 用途 |
| --- | --- | --- |
| `id` | 必須、英数字・アンダースコア・点・ハイフンの 1～60 文字 | Runner 型 `hai.tools.<id>.v1`。同じサービスのノード間で統一 |
| `runner` | 必須 | 初期化済み Runner。サービスはライフサイクルを所有しない |
| `createTools` | 必須 | 信頼済み `ToolServiceContext` から `ToolSet` または Promise を返す。実行ノードで再構築 |
| `enabled` | 必須 | `ToolSelection` またはコンテキスト関数。グループとツールの和集合から `exclude` を除く。`{}` はすべて無効 |
| `authorize` | 必須 | `{ context, name, input, phase }`。`phase` は `submit` または `execute` で両方の許可が必要 |
| `runTimeoutMs` | 300000 ミリ秒 | 実行期限。整数 1～86400000 |
| `queueTimeoutMs` | 300000 ミリ秒 | 待機期限。整数 1～86400000 |

`ToolServiceContext` は `scope: { tenantId, userId }` と任意の `sessionId/signal` を含みます。実際の `execution` は Runner 実行ノードが設定します。クライアントが申告した本人情報や実行コンテキストを受け入れないでください。

`ToolSet` は `tools`、任意の `groups: { id, title, tools }[]` と `environments: Record<toolName, environmentId>` を含みます。環境割り当ては Runner 環境を指定し、実行ノードでも再確認します。`ToolSelection` の `groups/tools/exclude` は名前の配列です。

カタログは各ツールの `authorize` を呼びません。利用者別の表示制限は `createTools/enabled` で行います。サーバーの認可と最終リソース検証は別途必要で、ボタンを隠すだけでは無効化できません。

`service.submit/invoke` は同一ユーザー操作の idempotencyKey を維持します。受付不明時は新しいキーで重複提出せず `service.find(key, context)` で取得します。カタログ無効化後も本人の旧タスクは照会でき、本人・サービスの検証は維持します。

[引数と手順の詳細](tools.md#services)

#### 利用例：送信後の復旧・状態確認・中止

createDocumentService の成功データ、認証済みコンテキスト、カタログから選び検証した要求を使います。同じ冪等キーで送信・検索します。中止後も実際の状態を確認し、invoke で同じ要求の結果を待ちます。

```ts
import type { ToolService, ToolServiceContext, ToolSubmitRequest } from '@h-ai/tools/server'

async function followJob(service: ToolService, context: ToolServiceContext, request: ToolSubmitRequest) {
  const catalog = value(await service.catalog(context))
  // catalog.tools describes what this context can submit.
  const keyed = { ...request, idempotencyKey: 'demo-operation-42' }
  const submitted = value(await service.submit(keyed, context))
  const recovered = value(await service.find(keyed.idempotencyKey, context))
  // recovered is the same logical run, or undefined if none was accepted.
  const current = value(await service.inspect(submitted.receipt, context))
  const cancelling = value(await service.cancel(submitted.receipt, context))
  // current/cancelling are ToolRun values; cancellation may still be in progress.
  return service.invoke(keyed, context)
}
// At application shutdown, after all users of the service finish:
// service.close() returns void and leaves Runner open.
```

<a id="artifact-jobs"></a>

### 成果物・Web・文書ジョブの再利用：ツール工場

ホストが許可済みファイル操作と環境対応を渡します。工場が一覧を返してもコンテナーは起動しません。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `tools.createArtifactTools` | 成果物・分析ツールを作成 | `ArtifactToolOptions`：`context, files` | `ToolSet` | `tools.createArtifactTools({ context, files })` |
| `tools.createJobTools` | 環境を割り当てた作業ツールを作成 | `JobToolOptions`：`context, files, runner, environments`；`browserProxy?` | `ToolSet` | `tools.createJobTools({ context, files, runner, environments })` |

#### 利用例：成果物・Web・文書ジョブの再利用

認証済み context、認可付き files、初期化済み Runner、信頼済み環境対応表を渡します。返った ToolSet を createService.createTools で返します。工場自体はジョブを送らず、終了処理も持ちません。

```ts
import type { JobToolOptions, ToolSet } from '@h-ai/tools/server'
import { tools } from '@h-ai/tools/server'

function createWorkTools(options: JobToolOptions): ToolSet {
  const artifacts = tools.createArtifactTools({ context: options.context, files: options.files })
  const jobs = tools.createJobTools(options)
  return {
    tools: [...artifacts.tools, ...jobs.tools],
    groups: [...(artifacts.groups ?? []), ...(jobs.groups ?? [])],
    environments: { ...artifacts.environments, ...jobs.environments },
  }
}
// The result includes artifact_create/read/save and data_analyze.
// Job tools appear only for the environments present in options.environments.
```
