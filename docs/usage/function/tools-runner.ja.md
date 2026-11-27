# @h-ai/tools-runner API リファレンス

[简体中文](tools-runner.md) · [English](tools-runner.en.md)

Tools Runner はツールを Runner の永続キューに接続します。アプリが初期化済みの Runner、ツールセット、認可を渡します。クライアントは受領情報で状態の確認、イベントの再取得、キャンセルができます。直接実行には [Tools](tools.ja.md) を使用します。

[モジュール README](../../../packages/tools-runner/README.ja.md) · [設定](../configuration/tools-runner.ja.md) · [データの保存先](../data/tools-runner.ja.md)

`@h-ai/tools/server` から移行するには、`@h-ai/tools-runner` の `toolsRunner` を import し、`createService()` と `createJobTools()` を呼び出します。同じサービス ID、入力、冪等キー、受領情報で Runner の既存ジョブを参照できます。

<a id="module-dependencies"></a>

## 依存関係

| 依存先 | 用途 | 利用条件 | 初期化順序 |
| --- | --- | --- | --- |
| Node.js | サービスとコンテナージョブのファクトリーを実行 | サーバープロセス | Node.js アプリでアダプターを読み込む |
| `@h-ai/core`、`zod` | 共通の結果、言語、入力検証 | アダプターとともにインストール | アプリが直接 import するものは明示的に追加 |
| `@h-ai/tools` | ツールを定義、検証、実行 | すべてのサービス | ツールセットと認可を提供 |
| `@h-ai/reldb`、`@h-ai/runner` | ジョブを保存、取得、実行 | すべてのサービス | RelDB、Runner の順に初期化してからサービスを作成 |
| ホストのファイル操作とコンテナー環境 | 許可されたファイルの読み込みと固定イメージの実行 | コンテナージョブを使う場合 | 環境とファイル操作を準備してからジョブツールを作成 |

<a id="quick-start"></a>

## クイックスタート

<a id="service-example"></a>

Node プロジェクトに依存関係を追加し、次のコードを `sum-service.mts` として保存します。この例では SQLite のインメモリーデータベースと Runner が同じプロセスで動作します。デモではアプリが `demo/alice` を信頼できる実行主体として渡します。実際のサービスではセッションや認証情報から主体を取得してください。

```sh
pnpm add --allow-build=better-sqlite3 @h-ai/core @h-ai/reldb @h-ai/runner @h-ai/tools @h-ai/tools-runner zod@^4
node sum-service.mts
node sum-service.mts --receipts
```

`--allow-build=better-sqlite3` で pnpm に SQLite のネイティブバインディングのインストールを許可します。すでに許可済みのプロジェクトでは既存の設定を使えます。

<!-- example: tools-service -->

```ts
import type { HaiResult } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { runner } from '@h-ai/runner'
import { tools } from '@h-ai/tools'
import { toolsRunner } from '@h-ai/tools-runner'
import { z } from 'zod'
import process from 'node:process'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(`${result.error.code} ${result.error.message}`)
  return result.data
}

const receiptsOnly = process.argv.includes('--receipts')
const context = { scope: { tenantId: 'demo', userId: 'alice' } }
const request = {
  name: 'sum',
  input: { a: 2, b: 3 },
  idempotencyKey: 'sum-2-plus-3',
}
const worker = runner.create()

// このプロセスのデモ用データベースを初期化する。
value(await reldb.init({ type: 'sqlite', database: ':memory:' }))
try {
  // 通常モードではタスクを取得する。受領情報モードでは受理だけを行う。
  value(await worker.init({ nodeId: 'sum-demo', executor: !receiptsOnly }))
  try {
    const sum = tools.define({
      name: 'sum',
      description: 'Add two numbers',
      parameters: z.object({ a: z.number(), b: z.number() }),
      handler: ({ a, b }) => a + b,
    })
    // sum を登録して有効にし、デモの主体にだけ許可する。
    const service = value(toolsRunner.createService({
      id: 'sum-demo',
      runner: worker,
      createTools: () => ({ tools: [sum] }),
      enabled: { tools: ['sum'] },
      authorize: ({ context: { scope }, name }) =>
        scope.tenantId === 'demo' && scope.userId === 'alice' && name === 'sum',
    }))
    try {
      // demo/alice として一覧を取得すると、sum の定義と空の groups が返る。コンテキストが無効なら失敗。
      const catalog = value(await service.catalog(context))
      process.stdout.write(`catalog: ${catalog.tools.map(tool => tool.name).join(', ')}\n`)

      if (!receiptsOnly) {
        // demo/alice として sum(2, 3) を送信し、完了まで待つ。成功時は 5、認可拒否やタスク失敗時はエラーが返る。
        const total = value(await service.invoke(request, context))
        process.stdout.write(`sum: ${total}\n`)
      }
      else {
        // 同じ求和リクエストを送信する。受理されると queued の状態と id、key を含む受領情報が返る。
        // 入力検証や認可に失敗するとエラーが返る。
        const submitted = value(await service.submit(request, context))
        // 同じ主体と冪等キーで ToolRun を取得する。この例ではまだ queued。該当なしは成功時の undefined で示す。
        // キーが無効、またはストレージの検索に失敗した場合、value() がエラーを送出する。
        const recovered = value(await service.find(request.idempotencyKey, context))
        if (recovered?.receipt.id !== submitted.receipt.id)
          throw new Error('Expected the existing sum receipt')

        // 完全な受領情報でカーソル 0 から読む。結果は status: 'queued'、events: []、next: 0。
        // 受領情報が無効、または現在の主体とサービスでタスクが見つからなければ失敗する。
        const current = value(await service.inspect(recovered.receipt, context))
        // 同じ受領情報で中止を要求する。未取得のタスクは cancelled、実行中は先に cancelling が返る場合がある。
        // 受領情報の検証や Runner での中止要求に失敗するとエラーが返る。
        value(await service.cancel(recovered.receipt, context))
        // current.next（0）から続けて読む。終了状態は cancelled、events: []、next: 0。取得に失敗するとエラーが返る。
        const final = value(await service.inspect(recovered.receipt, context, { after: current.next }))
        process.stdout.write(`status: ${current.status} -> ${final.status}\n`)
        process.stdout.write(`next: ${final.next}\n`)
      }
    }
    finally {
      service.close()
    }
  }
  finally {
    value(await worker.close())
  }
}
finally {
  value(await reldb.close())
}
```

最初の実行では `catalog: sum` と `sum: 5` が表示されます。`enabled` で `sum` を公開し、`authorize` が送信時と実行時に、デモ主体による `sum` の呼び出しだけを許可します。主体を `bob` に変更すると、カタログには引き続き `sum` が表示されますが、`invoke()` はハンドラーの実行前に `FORBIDDEN` を返します。

2 回目は API 専用の Runner を使い、同じタスクを `queued` に留めます。冪等キーでタスクを検索し、完全な受領情報で中止を要求すると、`status: queued -> cancelled` と `next: 0` が表示されます。このツールはイベントを発行しません。実行中のタスクでは `cancel()` がまず `cancelling` を返す場合があります。`inspect()` で終了状態を確認してください。二つのコマンドはそれぞれ新しいインメモリーデータベースを使います。再起動後にタスクを検索するには、[永続的な Runner データベース](../configuration/runner.ja.md) を設定し、キーを保存してください。

<a id="api-reference"></a>

## API リファレンス

<a id="services"></a>

### 復元可能な業務タスク：`toolsRunner.createService`

ツールサービスはアプリのプロセス内にあるオブジェクトです。カタログの作成、入力検証、認可を行い、Runner に処理を渡します。Runner はタスクと結果を RelDB に記録します。HTTP ルートや CLI などの呼び出し窓口はホストが用意します。

```text
アプリ → service.submit()
  ↓ 入力検証と認可
Runner がタスクを保存して受領情報を返す
  ↓ 実行ノードで認可を再確認
ツールを実行、Runner が終了状態を保存
  ↓
service.inspect() で状態と結果を取得
```

結果を待てる場合は、送信と待機をまとめた `service.invoke()` を使います。先に応答を返して後で状態を調べる場合は、`submit()` で完全な受領情報を保存します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `toolsRunner.createService(options)` | Runner を借用するツールサービスを作成 | `options: ToolServiceOptions`。`id`、`runner`、`createTools`、`enabled`、`authorize` は必須です。 | `HaiResult<ToolService>` | `toolsRunner.createService(options)` |
| `service.catalog(context)` | 利用可能なツールを列挙 | `context: ToolServiceContext`。アプリが信頼できるコンテキストを渡します。 | `Promise<HaiResult<ToolCatalog>>` | `await service.catalog(context)` |
| `service.submit(request, context)` | 永続ジョブを送信します。同じジョブを再送すると、既存の状態と記録済みの失敗理由を返します。 | `request: ToolSubmitRequest, context: ToolServiceContext`。リクエストにツール名、入力、任意の冪等キーを含めます。コンテキストはアプリが提供します。 | `Promise<HaiResult<ToolRun>>` | `await service.submit(request, context)` |
| `service.find(idempotencyKey, context)` | 冪等キーでジョブを検索 | `idempotencyKey: string, context: ToolServiceContext` | `Promise<HaiResult<ToolRun \| undefined>>` | `await service.find(key, context)` |
| `service.inspect(receipt, context, options?)` | ジョブの状態と結果を取得 | `receipt: ToolReceipt, context: ToolServiceContext, options?: { after?: number }`。完全な受領情報を渡し、`after` で指定したイベント番号の次から取得できます。 | `Promise<HaiResult<ToolRun>>` | `await service.inspect(receipt, context)` |
| `service.cancel(receipt, context)` | ジョブの中止を要求 | `receipt: ToolReceipt, context: ToolServiceContext`。完全なタスク受領情報と、信頼できるコンテキストを渡します。 | `Promise<HaiResult<ToolRun>>` | `await service.cancel(receipt, context)` |
| `service.invoke(request, context)` | ツールを呼び出して結果を待つ | `request: ToolSubmitRequest, context: ToolServiceContext`。`submit` と同じリクエスト形式です。 | `Promise<HaiResult<RunnerJson>>` | `await service.invoke(request, context)` |
| `service.close()` | サービスのハンドラーを登録解除します。Runner はホストが閉じます。 | 引数なし | `void` | `service.close()` |

#### サービス要求・コンテキスト・イベントカーソル

| オブジェクト | 項目 | 条件と結果 |
| --- | --- | --- |
| `ToolServiceContext` | `scope`, `sessionId`, `signal` | 認証済みの `scope` と、任意の `sessionId`、`signal` を渡します。主体の各 ID とセッション ID は 1〜200 文字です。サービスは呼び出し側から渡された `execution` を使用しません。 |
| `ToolSubmitRequest` | `name`、`input`、`idempotencyKey` | 名前と入力は必須。有効な一覧から選んだツール名と、スキーマに合う JSON を渡す。任意の冪等キーは 1〜200 文字、既定は UUID。切断後に同じ操作を復元するには安定したキーを渡す |
| `ToolReceipt` | `id`、`key` | 両方必須。ID は 64 桁の十六進数で、キーは 1〜200 文字。`inspect/cancel` は両方を主体とサービスに照合する。`find` は送信時の業務冪等キーを受け付ける |
| `inspect` の `options` | `after` | 任意の 0〜100000 の整数、既定は 0。カーソルより大きな番号のイベントを最大 100 件と、現在の状態および `next` を返す |
| `ToolServiceOptions.enabled` | `groups`、`tools`、`exclude` | いずれも任意の名前配列。グループとツールの和集合から除外名を外す。空オブジェクトは全ツールを無効にする。実行ごとに認可を確認する |

`ToolServiceContext.execution` は成果物ツールなどに実行 ID、進捗の記録、任意の `maxResultBytes` を提供します。Runner から渡された JSON 結果のバイト上限に合わせ、`artifact_read` はページを分けて返します。コンテナーファクトリーは `RunnerToolServiceContext` から実行ハンドル全体を取得します。 [成果物のページ単位の読み取り](tools.ja.md#artifact-byte-limit)

イベントが 5、6、7 の場合、`inspect(receipt, context, { after: 5 })` は 6、7 を返します。次は戻り値の `next` を使います。`{ groups: ['docs'], exclude: ['docs_export'] }` を選ぶと、docs の残りの登録済みツールが対象となり、投入時は引き続き認可コールバックを通ります。

##### サービスファクトリーの引数

| フィールド | 必須・既定値 | 用途 |
| --- | --- | --- |
| `id` | 必須、英数字・アンダースコア・点・ハイフンの 1～60 文字 | Runner 型 `hai.tools.<id>.v1`。同じサービスのノード間で統一 |
| `runner` | 必須 | 初期化済み Runner。サービスはライフサイクルを所有しない |
| `createTools` | 必須 | 信頼済み `RunnerToolServiceContext` から `RunnerToolSet` または Promise を返します。実行ノードでは実際の Runner コンテキストで再構築するため、コンテナー用の処理で `execution.start` を利用できます |
| `enabled` | 必須 | `ToolSelection` またはコンテキスト関数。グループとツールの和集合から `exclude` を除く。`{}` はすべて無効 |
| `authorize` | 必須 | `{ context, name, input, phase }`。`phase` は `submit` または `execute` で、両方の許可が必要です。実行段階の `context.signal` にはツールの期限が反映されます。 |
| `runTimeoutMs` | 300000 ミリ秒 | リクエストの準備と Runner の実行それぞれの上限。整数 1～86400000。 |
| `queueTimeoutMs` | 300000 ミリ秒 | 待機期限。整数 1～86400000 |

`RunnerToolSet` は `tools`、任意の `groups: { id, title, tools }[]` と `environments: Record<toolName, environmentId>` を含みます。環境割り当ては Runner 環境を指定し、実行ノードでも再確認します。`ToolSelection` の `groups/tools/exclude` は名前の配列です。

`service.submit/invoke` は同一ユーザー操作の idempotencyKey を維持します。受付不明時は新しいキーで重複提出せず `service.find(key, context)` で取得します。カタログ無効化後も本人の旧タスクは照会でき、本人・サービスの検証は維持します。

`submit()` は永続化を開始する前まで、キャンセルシグナルとリクエスト期限に従います。書き込み開始後は Runner の結果を待ち、受理された場合は受領情報を返します。書き込み中にキャンセルされて Runner がタスクを受理した場合、`invoke()` は `CANCELLED` と完全な受領情報を `error.ext.receipt` に返します。Runner が受理しなかった場合は、そのエラーを返します。サービスがキーを生成したタスクには中止を要求します。呼び出し元がキーを指定した場合は、実行済みのタスクとキーを共有する可能性があるため、受領情報で状態を確認してから中止を判断できます。

サービスは初回送信時にフレームワークが対応するリクエスト言語を保存します。実行ノードはその言語でエラーイベントを生成し、同じキーの再試行でも最初の言語を使います。言語が記録されていない既存タスクは実行ノードの既定言語で動作します。Tools と Runner は対応するリリースを同時にデプロイします。既存タスクの移行は不要です。

##### 受領情報、状態、失敗理由

`ToolCatalog` は `tools: ToolDefinition[]` と `groups: ToolGroup[]` を返します。カタログは `createTools` と `enabled` で決まります。ユーザーによって表示するツールを制限する場合はここで絞り込みます。送信と実行の認可は別途行われます。

`ToolRun` には完全な `receipt`、`status`、任意の `output` と `failure`、および `events` と `next` が含まれます。`inspect(..., { after: next })` で次のページを読みます。`submit` はその時点の状態を返し、イベントは `inspect` で取得します。

| 状態 | 呼び出し元で行うこと |
| --- | --- |
| `queued`、`running`、`cancelling` | 受領情報を保存して状態を再確認します。`cancelling` の間は後処理が続いている場合があります。 |
| `succeeded` | `output` を読みます。ハンドラーに戻り値がない場合、サービスは JSON の `null` を返します。 |
| `failed`、`cancelled`、`unknown` | `failure` とイベントがあれば確認します。`unknown` は Runner が結果を確認できない状態です。書き込みを再実行する前に業務結果を確認してください。 |

`success: false` は入力不備、認可拒否、競合、期限切れなどの API 失敗を示します。`submit/find/inspect/cancel` は API として成功しても、タスクが `failed` の場合があります。`failure` は Runner の失敗分類で、`tool-error` イベントにはツールのエラーコード、安全なメッセージ、HTTP 状態、トレース ID が含まれます。`invoke()` で待機したタスクが失敗すると、失敗した `HaiResult` が返ります。[Runner の状態とタスク検索](runner.ja.md#tasks) を参照してください。

同じサービスの各ノードでは、同じ ID、選択設定、環境の割り当てを使い、Runner データベースを共有します。API ノードには `executor: false` を指定できます。実行ノードの ID は一意で再起動後も同じ値を使います。終了時はサービス、Runner、RelDB の順に閉じます。

更新時も同じサービス ID、環境定義、データベースを使うと、保存済みの受領情報で照会できます。ローリング更新では新旧の実行ノードに異なる ID を割り当てます。Runner の停止は実行中のジョブをキャンセルするため、旧ノードで動くツールと子ジョブの完了を待ってから停止してください。

<a id="job-tools"></a>

### ツールサービスでコンテナージョブを実行する

文書の抽出や Web プレビューを独立したコンテナーで実行する場合は、`toolsRunner.createJobTools()` で固定ジョブを Runner の環境に割り当て、`createTools` から返します。Runner はサービスが受理したタスクに対してコンテナーを起動します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `toolsRunner.createJobTools(options)` | コンテナー実行先を割り当てたツールを定義 | `options: JobToolOptions`。`context`、`files`、`runner`、`environments` は必須。`browserProxy` は任意 | ツール、グループ、環境の対応を含む `RunnerToolSet` | `toolsRunner.createJobTools({ context, files, runner, environments })` |
| `service.invoke({ name: 'documents_extract', input }, context)` | 許可されたファイルのテキストを抽出 | `input: { fileId: string }`。ファイル ID はホストのファイル一覧から取得 | 成功値は `{ text }`。ファイル読み取り、認可、実行の失敗は `HaiResult` のエラー | `await service.invoke({ name: 'documents_extract', input: { fileId } }, context)` |

##### ファクトリーの引数

| 項目 | 必須または既定値 | 用途 |
| --- | --- | --- |
| `context`、`files` | 必須 | 信頼できる主体と、[成果物のファイル操作](tools.ja.md#artifact-jobs)で使うホスト側の `ToolArtifactAccess` を渡す |
| `runner` | 必須 | 初期化済みの Runner。実行ノードにコンテナー環境を登録する |
| `environments` | 必須 | 次の表のキーと登録済みの環境 ID を対応付ける。割り当てたジョブだけがツールセットに入る |
| `browserProxy` | 省略可。`browser` と `web` の登録には必要 | ホストが管理する HTTP IPv4 プロキシ。ホストが `HAI_TOOL_BROWSER_PROXY` としてコンテナーに渡す |

| 環境キー | ツール | Runner ケイパビリティ | ネットワーク |
| --- | --- | --- | --- |
| `documents` | `documents_extract`、`documents_generate` | `documents.extract`、`documents.generate` | `offline` |
| `office` | `office_convert`、`office_recalculate` | `office.convert`、`office.recalculate` | `offline` |
| `ocr` | `ocr_recognize` | `ocr.recognize` | `offline` |
| `browser` | `browser_navigate` | `browser.navigate` | `internal` と管理されたプロキシ |
| `web` | `web_capture` | `web.capture` | `internal` と管理されたプロキシ |
| `preview` | `preview_build` | `preview.build` | `offline` |
| `video` | `video_render` | `video.render` | `offline` |

環境 ID は実行先を決め、サービスの `enabled.tools` または `enabled.groups` は呼び出せるツールを決めます。Office と OCR は `documents` グループ、ブラウザーとプレビューは `web` グループに含まれます。[Runner の環境設定](../configuration/runner.ja.md#configuration-fields)

`browserProxy` は `http://<IPv4>:<port>` 形式で、ポートは 1～65535、末尾のスラッシュは任意です。認証情報、パス、クエリ、フラグメントは指定しません。`0.0.0.0`、`127.0.0.0/8`、`169.254.0.0/16`、`224.0.0.0/4` は使えません。`browser_navigate` と `web_capture` の入力 URL は最大 2048 Unicode 文字で、HTTPS、ASCII DNS ホスト名、既定のポートを使用します。条件を満たさない入力は `VALIDATION_FAILED` になります。

Runner の送信、各イベント、最終出力はそれぞれ JSON 512 KiB が上限です。作業ファイルの上限は 50 MiB で、コンテナーへの入力には環境の `scratchMiB` の制約も適用されます。動画とブラウザーのメモリー、PID、ディスク容量の要件と、文書生成など各操作の入出力上限はジョブガイドを参照してください。[ジョブガイド（中国語）](../../../packages/tools/jobs/README.md) · [Tools のデータ上限](../data/tools-runner.ja.md#size-and-retention)

<a id="managed-job-example"></a>

#### 利用例：許可された文書からテキストを抽出する

リポジトリのルートで Podman 用の `documents` イメージをビルドします。Runner に渡す値は、ビルド済みのイメージの SHA-256 ID です。

```sh
podman build -f packages/tools/jobs/documents/Dockerfile \
  -t localhost/hai-tools-documents:local packages/tools/jobs
```

Node 26 のプロジェクトで依存関係を追加し、次のコードを `managed-example.mts` として保存します。デモのホストは `demo/alice` が読み取れるテキストを一件用意します。コンテナーにはファイル ID から解決した内容が渡されます。

```sh
pnpm add --allow-build=better-sqlite3 @h-ai/core @h-ai/reldb @h-ai/runner @h-ai/tools @h-ai/tools-runner
image=$(podman image inspect --format '{{.Id}}' localhost/hai-tools-documents:local)
node managed-example.mts "sha256:${image#sha256:}"
```

<!-- example: tools-managed-job -->

```ts
import type { HaiResult } from '@h-ai/core'
import type { RunnerScope } from '@h-ai/runner'
import type { ToolArtifactAccess } from '@h-ai/tools/server'
import process from 'node:process'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { runner } from '@h-ai/runner'
import { HaiToolsError } from '@h-ai/tools'
import { toolsRunner } from '@h-ai/tools-runner'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.data
}

const image = process.argv[2]
if (!image)
  throw new Error('Pass the local documents image ID with its sha256: prefix.')

const jobRunner = runner.create()
const scope = { tenantId: 'demo', userId: 'alice' }
const file = {
  id: 'release-checklist',
  name: 'checklist.txt',
  mediaType: 'text/plain',
  data: new TextEncoder().encode('Release checklist'),
}
const canRead = (caller: RunnerScope) => caller.tenantId === scope.tenantId && caller.userId === scope.userId
const files: ToolArtifactAccess = {
  async read(context, { id }) {
    if (context.signal?.aborted)
      return core.err(HaiToolsError.CANCELLED, 'File read cancelled')
    return canRead(context.scope) && id === file.id
      ? core.ok(file)
      : core.err(HaiToolsError.FORBIDDEN, 'File access denied')
  },
  async publish() {
    return core.err(HaiToolsError.FORBIDDEN, 'This text-only example does not publish files')
  },
}

// 今回のタスクを SQLite のインメモリーデータベースに保存する。初期化の失敗時は value が例外を送出する。
value(await reldb.init({ type: 'sqlite', database: ':memory:' }))
try {
  // Podman を使う Runner を起動し、docs-offline を登録する。環境設定が不正なら実行を中断する。
  value(await jobRunner.init({
    engine: 'podman',
    nodeId: 'documents-demo',
    environments: [{
      id: 'docs-offline',
      image,
      capabilities: ['documents.extract'],
      networkPolicy: 'offline',
      resources: { cpu: 0.5, memoryMiB: 192, pids: 32, scratchMiB: 24 },
    }],
  }))

  // documents_extract のみを有効にする。成功時はサービスを取得し、設定や登録の失敗時は例外を送出する。
  const service = value(toolsRunner.createService({
    id: 'checklist',
    runner: jobRunner,
    enabled: { tools: ['documents_extract'] },
    authorize: ({ context, name }) => name === 'documents_extract' && canRead(context.scope),
    // documents を docs-offline に割り当て、処理の定義と環境の対応を ToolSet として返す。
    createTools: context => toolsRunner.createJobTools({
      context,
      files,
      runner: jobRunner,
      environments: { documents: 'docs-offline' },
    }),
  }))
  try {
    // ファイル ID を送信して完了を待つ。成功時は { text: 'Release checklist' } を得る。認可やジョブの失敗時は例外を送出する。
    const result = value(await service.invoke({
      name: 'documents_extract',
      input: { fileId: file.id },
    }, { scope }))
    process.stdout.write(JSON.stringify(result) + '\n')
  }
  finally {
    // サービスのハンドラーを登録解除する。戻り値は void。
    service.close()
  }
}
finally {
  try {
    // Runner を閉じてリソースの解放を待つ。成功時にデータはなく、後処理の失敗時は例外を送出する。
    value(await jobRunner.close())
  }
  finally {
    // Runner の終了に失敗した場合もデモ用データベースを閉じる。成功時にデータはない。
    value(await reldb.close())
  }
}
```

完了すると標準出力に `{"text":"Release checklist"}` が表示されます。ホストでファイルを認可し、サービスが `documents_extract` を受理し、Runner の `docs-offline` 環境で処理した結果です。先に受付情報を返す必要があれば、同じリクエストを `service.submit()` に渡し、[完全な受付情報で状態を確認](#service-example)します。

固定ジョブの期限切れは `TIMEOUT`、不正なファイルや既知の入力拒否は `VALIDATION_FAILED`、無効な出力やワーカー障害は `EXECUTION_FAILED` になります。固定ジョブはコンテナーの後処理を確認してから成果物を公開します。直接のツール結果で処理と後処理の両方が失敗した場合、後処理のエラーを返し、先に発生したエラーの安全な概要は `error.ext.operationError` に残ります。

<a id="从项目构建网页预览"></a>
<a id="web-preview"></a>
<a id="プロジェクトから-web-プレビューを構築"></a>

#### 利用例：プロジェクトから Web プレビューを作る

[文書ジョブの例](#managed-job-example)を使います。以下の設定で文書抽出をプレビュー構築に切り替え、`try` 内のツール呼び出しを置き換えます。

| 準備する項目 | この例で使う値 |
| --- | --- |
| Runner 環境 | ID は `preview-local`、ケイパビリティは `preview.build`。プレビュー用イメージを指定して、ネットワークは `offline` にする |
| ファクトリーの環境割り当て | `environments: { preview: 'preview-local' }` |
| ツールの有効化と認可 | `enabled: { tools: ['preview_build'] }`。認可コールバックで信頼済みの主体にこのツールを許可する |
| ファイルアクセスと公開 | ホストで `uploaded-project` をアップロード済みの認可された ZIP に対応付け、生成した HTML を `files.publish()` で保存する |

<!-- example: tools-web-preview -->

```ts
// 前の例の service、scope、value を使う。
// 成功時は data.artifacts に HTML の参照が入る。権限やビルドの失敗時は value が対応する例外を送出する。
const preview = value(await service.invoke({
  name: 'preview_build',
  input: { fileId: 'uploaded-project' },
}, { scope }))
process.stdout.write(`${JSON.stringify(preview)}\n`)
```

`artifacts[0].id` を使って、ホストから `text/html` の成果物を取得できます。ZIP のルートに `index.html` を置きます。ジョブガイドでは、ローカルモジュールを含む ZIP の作成、コンテナーの実行、サイズと時間の上限を確認できます。 [ZIP を用意して HTML を生成する（中国語）](../../../packages/tools/jobs/README.md#构建多文件网页预览)

<a id="从网址生成可编辑介绍视频"></a>
<a id="website-video"></a>
<a id="web-サイトから編集可能な紹介動画を作成"></a>

#### 利用例：URL から編集可能な紹介動画を作る

サイトの紹介動画を作るには、`ai.tools.createBuiltinTools({ context, files, executeJob })` が返す `website_video` を `video` グループに含めます。信頼できる `executeJob` コールバックは、同じ認可済みツールサービスの `web_capture` と `video_render` に接続します。これら 2 つのジョブも全体設定で有効にしてください。Hai Agent は `workbench.selection.groups` と `workbench.selection.tools` の和集合に `exclude` を適用します。`web` と `video` の両グループを選択するか、`website_video`、`web_capture`、`video_render` の各ツールを選択してください。タスクごとの認可にも全体設定の除外が適用されます。

LLM、WAV を返せる音声合成プロバイダー、両方のジョブ環境、`browserProxy` を設定します。長い処理では、ツールサービスの `runTimeoutMs` に `1200000`（20 分）を設定できます。オーケストレーションタスクは Runner の既定の実行枠を使い、Web キャプチャとレンダリングは割り当てたツール環境で実行されます。デプロイ先で実際のモデルと HyperFrames レンダラーを検証してください。

HTTPS の `url` を渡します。`goal`、`durationSeconds`（6～30 秒、既定は 15 秒）、`width` と `height`（既定は 1280 × 720）、`language`（既定は `zh-CN`）、`voice`、`model`、`brandColor` も指定できます。幅と高さは偶数で、縦横比は 16:9、9:16、1:1 のいずれか、総画素数は 1920 × 1080 以下です。モデルは実際に取得した Web ページの内容から台本と絵コンテを作り、音声合成がシーンごとに WAV を生成し、レンダラーが組み立てたプロジェクトから MP4 を出力します。

結果は `sourceUrl`、`captureId`、`scriptId`、`storyboardId`、`audioIds`、`projectId`、`subtitlesId`、`coverId`、`videoId`、`durationSeconds`、`artifacts` を返します。参照を使って、台本、デザイン、JSON と編集可能な Markdown の絵コンテ、シーンごとの WAV、SRT 字幕、実際のサイトから取得したカバー画像、プロジェクト ZIP、ワークフローマニフェスト、MP4 を開けます。

同じ URL のキャプチャを新しい実行で再利用するには、その `captureId` を渡します。内容を修正する場合は Markdown の絵コンテを編集し、`storyboardId` と `audioIds` を指定します。`audioText` とナレーションが一致するシーンは元の音声を使います。プロジェクト ZIP を `video_render` に渡して再レンダリングすることもできます。字幕は文単位です。ナレーションが指定時間に収まらない場合は、音声を切り詰めずに処理が失敗します。
