# @h-ai/tools API リファレンス

<a id="h-aitools-機能説明"></a>

`tools` で業務ツールを定義・登録・実行します。業務コード、画面操作、AI から同じ実装を利用できます。

[モジュール README](../../../packages/tools/README.ja.md) · [設定](../configuration/tools.ja.md) · [データの帰属](../data/tools.ja.md)

## エントリーポイントの選択

| インポート先 | 用途 | 実行とライフサイクル |
| --- | --- | --- |
| `@h-ai/tools` | 短時間の業務関数、ブラウザー内ツール、モデル連携用の中立な定義 | `tools.define/createRegistry` は純粋な定義・ファクトリー。`init/close` は不要で、Runner やモデル SDK を読み込まない |
| `@h-ai/tools/server` | 再開可能なタスク、進捗・キャンセル、文書とコンテナジョブ | 軽量メソッドに `tools.createService/createArtifactTools/createJobTools` を追加 |

軽量エントリーはブラウザーでも利用できますが、サーバーの権限は信頼できるサーバー側で検証します。`/server` をフロントエンドにインポートしないでください。

<a id="quick-start"></a>

## 最小構成

<a id="module-dependencies"></a>

### 依存関係

| 依存先 | 用途 | 利用条件 | 初期化順序 |
| --- | --- | --- | --- |
| `@h-ai/core`、`zod` | 共通の結果型、ツール引数の検証、JSON Schema 変換を提供 | Tools とともにインストール。引数定義で `zod` を直接インポートする場合はアプリの依存に追加 | 必要に応じてツールやレジストリを作成。モジュールの初期化は不要 |
| `@h-ai/runner` | 再開可能なツール実行やバックグラウンドジョブの実行・再開を担当 | サーバーの `createService()` または `createJobTools()` を使う場合 | ホストが Runner を初期化してファクトリーに渡す。ジョブを登録する前にハンドラーを登録 |
| Runner コンテナー環境 | 文書、OCR、ブラウザーなどの独立ジョブにエンジンとイメージを提供 | 対応する `createJobTools()` のジョブを使う場合 | 実行ノードを準備してから設定済みの環境 ID をファクトリーに渡す |
| ホストのファイルアクセスインターフェース | 成果物の読み取りやバックグラウンドジョブのファイルアクセスを提供 | `createArtifactTools()` または `createJobTools()` を使う場合 | ツール作成時に認証済みの利用者とスコープに限定した `files` を渡す |

### 利用例

```sh
pnpm add @h-ai/tools @h-ai/core zod
```

通常の業務呼び出しの例です。登録したツールだけを使用し、信頼できるサーバーから本人情報を渡します。

```ts
import { tools } from '@h-ai/tools'
import { z } from 'zod'

export async function calculate(objectId: string) {
  // ホストが渡す objectId と同じ主体だけを許可する空の登録器を作る。
  const registry = tools.createRegistry({
    authorize: ({ context }) => context.objectId === objectId,
  })
  // 下の Zod 入力と加算処理から sum を定義し、この登録器に登録する。定義不正は例外、登録成功時データなし、同名登録は失敗。
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
  // 確認済みの objectId で sum(2, 3) を実行する。成功時は { total: 5 }、入力や権限が不正なら処理を実行しない。
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
  // 空でない ID を照会するツールを作り、受け取った read の HaiResult をそのまま使う。定義不正は例外。
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

Tools にモジュール単位の init/close はありません。軽量機能はルート、サーバー機能は `/server` から読み込みます。各呼び出しで HaiResult.success を確認し、失敗時は元の結果を返して、成功時だけ data を読みます。関数宣言のない例はアプリの非同期業務関数内の断片です。独立したテストデータと明示した後片付けを使います。

<a id="definitions"></a>

### 単一ツールの定義と実行：`tools.define`

入力検証と業務関数を結び付けます。定義だけでは動かず、execute で実行します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `tools.define(options)` | ツールを定義し、実行時に入力を検証する。既定のタイムアウトは `30000` ms。定義が無効なら `TypeError` | `options: DefineToolOptions<TInput, TOutput>` | `Tool<TInput, TOutput>` | `const tool = tools.define(definition)` |
| `tool.execute(input, options?)` | 入力を検証して実行する。利用者、認可、キャンセル信号、期限も指定できる | `input: unknown, options?: ToolExecutionOptions`。`input` はツールのパラメータースキーマに従います。オプションを省略すると既定の実行設定を使います。 | `Promise<HaiResult<TOutput>>` | `await tool.execute({ a: 2, b: 3 })` |
| `tool.toDefinition()` | 入力の規則を JSON Schema に変換する。変換できないときは例外 | 引数なし | `ToolDefinition` | `tool.toDefinition()` |

<a id="call-options"></a>

##### 呼び出し引数

[機能説明](tools.ja.md) · [データの帰属](../data/tools.ja.md)

`tools.define/createRegistry` は純粋な定義・ファクトリーで、モジュール YAML・環境変数・`init/close` はありません。サーバー用のファクトリーは `@h-ai/tools/server` からインポートします。各ファクトリーの前提条件は [依存関係](#module-dependencies) を参照してください。

##### 定義と実行のオプション

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

#### 利用例：単一ツールの定義と実行

定義時は handler を実行しません。execute は入力検証、認可、実行に共通の中止・時間制限を適用します。

![ツール実行：検証・認可・共通の期限](../images/function-tools-execution.ja.svg)

検証・認可に失敗したら handler に入りません。登録側と呼出側の認可は両方必要です。中止・期限切れは待機を止めますが、handler は signal に従う必要があり、外部処理は巻き戻しません。handler の値は data、resultHandler は既存の HaiResult を維持します。

```ts
// import はモジュールの先頭へ置き、残りはアプリの非同期業務関数内で実行します。失敗結果は呼び出し元へ返します。
import { z } from 'zod'
// 下記の数値 Zod ルールと加算処理で sum を定義する。実行可能なツールが返り、不正な定義は TypeError。
const tool = tools.define({
  name: 'sum', description: 'Add two numbers',
  parameters: z.object({ a: z.number(), b: z.number() }),
  handler: ({ a, b }) => ({ total: a + b }),
})
// 引数なしでメタデータと入力規則を定義に変換し、名前 sum を読む。変換できなければ例外。
tool.toDefinition().name // 'sum'; parameters are JSON Schema
// sum に数値 2 と 3 を渡す。成功時は { total: 5 }、実行失敗は 元の失敗結果を返す。
const executeResult = await tool.execute({ a: 2, b: 3 })
if (!executeResult.success)
  return executeResult
executeResult.data // { total: 5 }
// a に文字列 wrong を渡す。VALIDATION_FAILED が返り、加算処理は呼ばれない。
const invalid = await tool.execute({ a: 'wrong', b: 3 }) // success false: VALIDATION_FAILED
```

二つの数から total=5 を得て、不正な a は処理に渡しません。既存 HaiResult には resultHandler を使います。定義誤りは TypeError、実行失敗は HaiResult です。

`tool` と `registry` はファクトリーの戻り値であり、パッケージ直下の関数ではありません。登録器は他のツールを自動発見せず、`tools.define` が作成したインスタンスだけを受け付けます。手書き・コピーしたオブジェクトは拒否します。

名前は ASCII 1～64 文字で、先頭は英字、以降は英数字・アンダースコア・ハイフンです。名前、既定タイムアウト、処理関数の組み合わせが不正な場合、定義エラーとして `TypeError` を送出します。モデル用のパラメーターは JSON Schema に変換可能である必要があり、通常はオブジェクト Schema を使います。`z.date()` など表現できない型は直接使用できません。

`HaiToolsError` は `hai:tools` 名前空間の NOT_FOUND、ALREADY_REGISTERED、VALIDATION_FAILED、EXECUTION_FAILED、FORBIDDEN、TIMEOUT、CANCELLED を含みます。入力・認可・期限・キャンセルの失敗は失敗の `HaiResult` を返します。`resultHandler` は既存の業務エラーを保持し、モデル JSON の解析エラーは AI アダプターが処理します。

固定ジョブの `TIMEOUT` は `HaiToolsError.TIMEOUT`、安全でない Office 文書・プロジェクトや既知の入力拒否は `VALIDATION_FAILED` に対応します。サンドボックスや依存関係の不足、不正なジョブ出力、未知のワーカ障害は `EXECUTION_FAILED` のままとし、ユーザー入力の誤りとして扱いません。公開メッセージは翻訳済みの文言を使い、ワーカの原文を表示しません。処理とコンテナの解放が両方失敗した場合は解放エラーを主エラーとし、最初の処理エラーを安全に整形して `error.ext.operationError` に保持します。単独の失敗ではこの拡張を追加しません。

#### 開発テスト

`pnpm --filter @h-ai/tools test` はカーネルとサービス、`pnpm --filter @h-ai/tools test:jobs` はジョブプロトコルを検証します。実イメージとブラウザーの受け入れは別途環境が必要です。ユニットテストだけで実イメージを検証済みとはしません。

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
| `tools.createRegistry(options?)` | `authorize` を省略すると、登録先独自の認可条件を適用しない空の登録先を作る | `options?: ToolRegistryOptions`。省略時は空のオプションです。 | `ToolRegistryOperations` | `const registry = tools.createRegistry()` |
| `registry.register(tool)` | ツールのインスタンスを登録 | `tool: Tool<TInput, TOutput>` | `HaiResult<void>` | `registry.register(tool)` |
| `registry.registerMany(tools)` | 複数のツールを登録する。重複や無効な項目が一つでもあれば、どれも登録しない | `tools: Tool[]` | `HaiResult<void>` | `registry.registerMany([tool])` |
| `registry.replace(tool)` | 既存のツールを同名の新しい定義で置き換える。登録済みの名前が必要 | `tool: Tool<TInput, TOutput>` | `HaiResult<void>` | `registry.replace(updatedTool)` |
| `registry.unregister(name)` | 指定した名前を削除する。登録済みの場合だけ `true` | `name: string` | `boolean` | `registry.unregister('sum')` |
| `registry.get(name)` | 名前でツールを取得 | `name: string` | `Tool / undefined` | `registry.get('sum')` |
| `registry.has(name)` | 名前が登録済みか確認する | `name: string` | `boolean` | `registry.has('sum')` |
| `registry.getNames()` | 登録された名前を一覧にする | 引数なし | `string[]` | `registry.getNames()` |
| `registry.getDefinitions()` | 登録済みツールの定義を返す。入力を JSON Schema に変換できないときは例外 | 引数なし | `ToolDefinition[]` | `registry.getDefinitions()` |
| `registry.execute(name, input, options?)` | 登録済みツールを実行する。登録先と呼び出しの両方に認可条件があれば、両方を満たす必要がある | `name: string, input: unknown, options?: ToolExecutionOptions`。`input` は登録済みツールのスキーマに従います。オプションを省略すると既定の実行設定を使います。 | `Promise<HaiResult<unknown>>` | `await registry.execute('sum', { a: 2, b: 3 })` |
| `registry.executeAll(calls, options?)` | 既定では順に実行して最初の失敗で停止する。`parallel: true` では、失敗しても実行を開始した処理は取り消されない | `calls: ToolInvocation[], options?: ToolExecutionOptions & { parallel?: boolean }`。既定では順番に実行し、`parallel: true` で並行実行します。 | `Promise<HaiResult<unknown[]>>` | `await registry.executeAll([{ name: 'sum', input: { a: 2, b: 3 } }])` |
| `registry.clear()` | 登録内容を消去する。進行中の呼び出しはキャンセルしない | 引数なし | `void` | `registry.clear()` |
| `registry.size` | 登録済みの件数を取得する（プロパティ） | 无 | `number` | `registry.size` |

#### 利用例：登録・検索・一括実行

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// Continue with the sum tool from the preceding scenario.
// 信頼済みの主体 demo-user だけが実行できる空の登録器を作る。
const registry = tools.createRegistry({ authorize: ({ context }) => context.objectId === 'demo-user' })
// 上で定義した sum を登録する。成功時にデータはなく、同名ツールは失敗。
const registerResult = registry.register(tool)
if (!registerResult.success)
  return registerResult
// 空配列を渡して一括登録する。成功時にデータはなく、登録済みの sum は残る。
const registerManyResult = registry.registerMany([])
if (!registerManyResult.success)
  return registerManyResult
// no tools added
registry.size // 1
// 登録済みの sum の有無を確認する。結果は true。
registry.has('sum') // true
// 名前 sum のインスタンスを探して、引数なしで定義に変換し名前 sum を読む。登録がなければ undefined。
registry.get('sum')?.toDefinition().name // 'sum'
// 引数なしで登録名を列挙する。結果は ['sum']。
registry.getNames() // ['sum']
// 引数なしで登録済み定義を取得し、名前だけを取り出すと ['sum']。入力規則の変換不可は例外。
registry.getDefinitions().map(definition => definition.name) // ['sum']
// 信頼済み demo-user で sum に 2 と 3 を渡す。成功時は { total: 5 }、権限や入力が不正なら実行されない。
const executeResult = await registry.execute('sum', { a: 2, b: 3 }, { objectId: 'demo-user' })
if (!executeResult.success)
  return executeResult
executeResult.data // { total: 5 }
// demo-user で一件の sum(4, 1) をまとめて実行する。入力順の [{ total: 5 }] が返り、失敗は 元の失敗結果を返す。
const executeAllResult = await registry.executeAll([{ name: 'sum', input: { a: 4, b: 1 } }], { objectId: 'demo-user' })
if (!executeAllResult.success)
  return executeAllResult
executeAllResult.data // [{ total: 5 }]
// 登録済みの sum を置き換える。成功時にデータはなく、検証に失敗すれば元の登録が残る。
const replaceResult = registry.replace(tool)
if (!replaceResult.success)
  return replaceResult
// same registered name
// sum を登録解除する。今回は true、もともと登録がなければ false。
registry.unregister('sum') // true
// 解除済みの sum を一件のバッチとして再登録する。成功時データはなく、名前の衝突は失敗。
const registerManyResult2 = registry.registerMany([tool])
if (!registerManyResult2.success)
  return registerManyResult2
// 引数なしで登録器を空にする。sum は見つからなくなり、戻り値はない。
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
| `tools.createService(options)` | Runner を借用するツールサービスを作成 | `options: ToolServiceOptions`。`id`、`runner`、`createTools`、`enabled`、`authorize` は必須です。 | `HaiResult<ToolService>` | `tools.createService(options)` |
| `service.catalog(context)` | 利用可能なツールを列挙 | `context: ToolServiceContext`。アプリが信頼できるコンテキストを渡します。 | `Promise<HaiResult<ToolCatalog>>` | `await service.catalog(context)` |
| `service.submit(request, context)` | 永続ジョブを送信 | `request: ToolSubmitRequest, context: ToolServiceContext`。リクエストにツール名、入力、任意の冪等キーを含めます。コンテキストはアプリが提供します。 | `Promise<HaiResult<ToolRun>>` | `await service.submit(request, context)` |
| `service.find(idempotencyKey, context)` | 冪等キーでジョブを検索 | `idempotencyKey: string, context: ToolServiceContext` | `Promise<HaiResult<ToolRun \| undefined>>` | `await service.find(key, context)` |
| `service.inspect(receipt, context, options?)` | ジョブの状態と結果を取得 | `receipt: ToolReceipt, context: ToolServiceContext, options?: { after?: number }`。完全な受領情報を渡し、`after` で指定したイベント番号の次から取得できます。 | `Promise<HaiResult<ToolRun>>` | `await service.inspect(receipt, context)` |
| `service.cancel(receipt, context)` | ジョブの中止を要求 | `receipt: ToolReceipt, context: ToolServiceContext`。完全なタスク受領情報と、信頼できるコンテキストを渡します。 | `Promise<HaiResult<ToolRun>>` | `await service.cancel(receipt, context)` |
| `service.invoke(request, context)` | ツールを呼び出して結果を待つ | `request: ToolSubmitRequest, context: ToolServiceContext`。`submit` と同じリクエスト形式です。 | `Promise<HaiResult<RunnerJson>>` | `await service.invoke(request, context)` |
| `service.close()` | サービスと所有リソースを終了 | 引数なし | `void` | `service.close()` |

#### サービス要求・コンテキスト・イベントカーソル

| オブジェクト | 項目 | 条件と結果 |
| --- | --- | --- |
| `ToolServiceContext` | `scope`、`sessionId`、`signal`、`execution` | 信頼済みの `scope: { tenantId, userId }` は必須で、各 ID は 1〜200 文字。セッション ID（1〜200 文字）と取消信号は任意。実行の帰属には実行ノードが設定した `RunnerContext` を使用する |
| `ToolSubmitRequest` | `name`、`input`、`idempotencyKey` | 名前と入力は必須。有効な一覧から選んだツール名と、スキーマに合う JSON を渡す。任意の冪等キーは 1〜200 文字、既定は UUID。切断後に同じ操作を復元するには安定したキーを渡す |
| `ToolReceipt` | `id`、`key` | 両方必須。ID は 64 桁の十六進数で、キーは 1〜200 文字。`inspect/cancel` は両方を主体とサービスに照合する。`find` は送信時の業務冪等キーを受け付ける |
| `inspect` の `options` | `after` | 任意の 0〜100000 の整数、既定は 0。カーソルより大きな番号のイベントを最大 100 件と、現在の状態および `next` を返す |
| `ToolServiceOptions.enabled` | `groups`、`tools`、`exclude` | いずれも任意の名前配列。グループとツールの和集合から除外名を外す。空オブジェクトは全ツールを無効にする。実行ごとに認可を確認する |

イベントが 5、6、7 の場合、`inspect(receipt, context, { after: 5 })` は 6、7 を返します。次は戻り値の `next` を使います。`{ groups: ['docs'], exclude: ['docs_export'] }` を選ぶと、docs の残りの登録済みツールが対象となり、投入時は引き続き認可コールバックを通ります。

##### サービスファクトリーの引数

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

#### 利用例：復元可能な業務タスク

service を作り、catalog から選択して同じキーで submit/find、完全な receipt で inspect/cancel します。invoke は終端を待ち、close は借用 Runner を閉じません。

#### 利用例：サーバータスクサービスを作る

[Runner](runner.ja.md) をインストール・初期化して `/server` からインポートします。ホストが本人情報、有効化、認可、成果物アクセスを提供します。サービスは借りた Runner を初期化・終了しません。

```ts
import type { RunnerFunctions } from '@h-ai/runner'

import { type ToolArtifactAccess, tools } from '@h-ai/tools/server'

export function createDocumentService(runner: RunnerFunctions, files: ToolArtifactAccess) {
  // 初期化済み Runner を借りて documents サービスを作り、documents と analysis を有効にする。成功時はサービス、設定や登録の失敗はエラー。
  return tools.createService({
    id: 'documents',
    runner,
    // 現在のコンテキストとホストのファイル権限で成果物ツール群を作る。保存フックがなければ artifact_save は含まれない。
    createTools: context => tools.createArtifactTools({ context, files }),
    enabled: { groups: ['documents', 'analysis'] },
    authorize: ({ context }) => context.scope.userId.length > 0,
  })
}
```

例は信頼済みユーザーの存在だけを確認します。`files.read/publish/save` は本人、リソース、最終確定条件も検証してください。本人情報はモデル引数ではなく `ToolServiceContext.scope` に渡します。

業務結果は先に `success` を確認します。最終出力が必要な業務処理では `invoke`、長い画面操作では `submit/inspect` を使い、完全な受領情報と `queued/running/cancelling` などの実際の状態を保持します。キャンセルの応答だけではプロセス終了を証明できません。

`enabled` は必須です。指定グループと個別ツールの和集合から `exclude` を除きます。空オブジェクトはすべて無効です。`catalog` はファクトリーと有効化ルールで作成し、個々の `authorize` は呼びません。利用者別の非表示はコンテキストに応じた `createTools/enabled` で実施します。提出時と実行ノードで集合を作り直して認可するため、古いカタログから無効化を回避できません。

#### 利用例：送信後の復旧・状態確認・中止

createDocumentService の成功データ、認証済みコンテキスト、カタログから選び検証した要求を使います。同じ冪等キーで送信・検索します。中止後も実際の状態を確認し、invoke で同じ要求の結果を待ちます。

```ts
import type { ToolService, ToolServiceContext, ToolSubmitRequest } from '@h-ai/tools/server'

async function followJob(service: ToolService, context: ToolServiceContext, request: ToolSubmitRequest) {
  // 信頼済みの主体で有効な定義とグループを取得する。提出と実行時には改めて権限を確認する。
  const catalogResult = await service.catalog(context)
  if (!catalogResult.success)
    return catalogResult
  const catalog = catalogResult.data
  // catalog.tools describes what this context can submit.
  const keyed = { ...request, idempotencyKey: 'demo-operation-42' }
  // 冪等キー付きの要求をこの主体で提出する。成功時は実行状態と完全な受付、権限や提出の失敗は 元の失敗結果を返す。
  const submittedResult = await service.submit(keyed, context)
  if (!submittedResult.success)
    return submittedResult
  const submitted = submittedResult.data
  // 同じ永続キーと主体で以前の実行を探す。見つからなければ undefined で、新規タスクは作らない。
  const recoveredResult = await service.find(keyed.idempotencyKey, context)
  if (!recoveredResult.success)
    return recoveredResult
  const recovered = recoveredResult.data
  // recovered is the same logical run, or undefined if none was accepted.
  // 完全な受付と現在の主体で状態・取得可能な出力・イベントを読む。主体が合わなければ失敗。
  const currentResult = await service.inspect(submitted.receipt, context)
  if (!currentResult.success)
    return currentResult
  const current = currentResult.data
  // 同じ受付でキャンセルを要求し、実際の状態を受け取る。cancelling なら停止確認はまだ終わっていない。
  const cancellingResult = await service.cancel(submitted.receipt, context)
  if (!cancellingResult.success)
    return cancellingResult
  const cancelling = cancellingResult.data
  // current/cancelling are ToolRun values; cancellation may still be in progress.
  // 同じキーと主体で終端状態を待つ。成功時は JSON 出力、キャンセルや実行失敗はエラー。
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
| `tools.createArtifactTools(options)` | 成果物・分析ツールを作成 | `options: ArtifactToolOptions`。`context` と `files` は必須です。 | `ToolSet` | `tools.createArtifactTools({ context, files })` |
| `tools.createJobTools(options)` | 環境を割り当てた作業ツールを作成 | `options: JobToolOptions`。`context`、`files`、`runner`、`environments` は必須で、`browserProxy` は省略できます。 | `ToolSet` | `tools.createJobTools({ context, files, runner, environments })` |

#### 成果物へのアクセスとジョブ環境の項目

| オブジェクトまたはコールバック | 項目 | 条件と結果 |
| --- | --- | --- |
| `ArtifactToolOptions`、`JobToolOptions` | `context`、`files` | 信頼済みのサービスコンテキストとホストが認可する `ToolArtifactAccess` は必須 |
| `files.read` | `context`、`{ id }` | 必須。現在の主体による成果物 ID の読み取りを認可し、`data: Uint8Array` を持つファイルを返す |
| `files.publish` | `context`、`{ name, kind, mediaType, data, id? }` | 必須。公開を認可してバイト列を保存し、参照を返す。対象 ID は任意 |
| `files.save` | `context`、`{ id, baseVersion, content }` | 任意。帰属と元の版を確認してテキストを保存し、新しい参照を返す。省略時は `artifact_save` を含めない |
| `JobToolOptions` | `runner`、`environments`、`browserProxy` | 初期化済み Runner を借用する。`documents/office/ocr/browser/web/preview/video` に登録済み環境 ID を対応付ける。ネットワークを使うツールには、デプロイで管理する明示ポート付き HTTP IPv4 プロキシも必要。有効なプロキシがなければ対象ツールを一覧に含めない |

`environments: { documents: 'docs-offline' }` だけを指定すると文書グループのみ生成されます。成果物ファクトリーに `save` を追加すると `baseVersion` で本文を更新し、新しい参照を取得できます。版が競合した場合はホストのコールバックがエラーを返します。

#### 利用例：成果物・Web・文書ジョブの再利用

認証済み context、認可付き files、初期化済み Runner、信頼済み環境対応表を渡します。返った ToolSet を createService.createTools で返します。工場自体はジョブを送らず、終了処理も持ちません。

```ts

import { type JobToolOptions, type ToolSet, tools } from '@h-ai/tools/server'

function createWorkTools(options: JobToolOptions): ToolSet {
  // ホストの主体とファイル権限で成果物ツールとグループを作る。保存ツールは save がある場合だけ追加される。
  const artifacts = tools.createArtifactTools({ context: options.context, files: options.files })
  // ホストの Runner、環境割り当て、ファイル権限からジョブツール群を作る。環境がなければ該当ツールは追加されない。
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
