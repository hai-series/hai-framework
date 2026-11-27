# @h-ai/runner API リファレンス

[简体中文](runner.md) · [English](runner.en.md)

Runner は Node.js サービスに永続ジョブキューを提供します。ジョブを投入すると実行 ID が発行され、バックグラウンドのハンドラーがジョブを取得して進捗と結果を記録します。接続が切れても、元の実行 ID や冪等キーで照会を再開できます。単一プロセスでは信頼済みの TypeScript や JavaScript のハンドラーを直接実行できます。プロセスを隔離するジョブにはコンテナー環境を設定します。

まず [1 つのプロセスでレポートを投入して実行](#quick-start)し、次に同じハンドラーを [API ノードと実行ノードに分けて実行](#two-node-example)します。実行方法を選ぶには、[通常ジョブ、制御ジョブ、ツールジョブ](#task-kinds)を参照してください。

[モジュール README](../../../packages/runner/README.ja.md) · [設定](../configuration/runner.ja.md) · [データ構造](../data/runner.ja.md)

<a id="module-dependencies"></a>

## 依存関係

| 依存先 | 用途 | 利用条件 | 初期化順序 |
| --- | --- | --- | --- |
| Node.js | サーバー API、ハンドラー、コンテナーのストリームを扱う | すべてのノードで必要。対応バージョンは各メジャーバージョンの 22.23.4、24.22.1、26.12.1 以降 | Node.js アプリケーションで Runner をインストールして import |
| `@h-ai/reldb` | ジョブ、イベント、実行の所有者を保存 | すべてのノードで必要。単一プロセスでは SQLite、複数プロセスでは同じ PostgreSQL または MySQL データベースを使用 | RelDB の初期化後に Runner を起動。Runner の終了を確認してから RelDB を終了 |
| Podman または Docker | リソースを制限してコンテナーを起動 | コンテナーを実行するノードで必要。ホストが Linux cgroup v2 と CPU、メモリ、プロセス数の制限をサポートしていること | エンジンと固定イメージを用意してから実行環境を登録 |

`@h-ai/core` は Runner の依存関係としてインストールされます。設定オブジェクトを直接渡すか、ホストで Core を使って YAML を読み込みます。ホストは呼び出し元を認証し、各ジョブの権限を確認します。[設定の読み込み](../configuration/runner.ja.md#configuration-entry)

<a id="quick-start"></a>

## クイックスタート

1 つの Node.js プロセスで月次レポートを投入して実行します。最初にジョブが待機キューに入ったことを示す受領情報が出力され、次にレポート結果と進捗イベントが 1 件表示されます。インメモリ SQLite を使うため、データベースサーバーの起動は不要です。

#### 1. 依存関係をインストールする

Node.js プロジェクトのディレクトリに 2 つのパッケージをインストールします。この後に作るファイルも同じ場所に保存します。

```sh
pnpm add @h-ai/runner @h-ai/reldb
```

#### 2. レポートのハンドラーを用意する

以下を `report.mjs` として保存します。投入側は `reportKind` でジョブ種別を指定し、実行側は同じ値で `buildReport` を登録します。この例のハンドラーは固定のレポート件数を返します。

```js
export const reportKind = 'report.v1'

/** @type {import('@h-ai/runner').RunnerHandler} */
export const buildReport = async (input, context) => {
  // input は runner.submit の input フィールドです。検証に失敗するとジョブは failed になります。
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.month !== 'string')
    throw new TypeError('Expected a report month')

  // 現在のジョブの進捗を永続イベントとして保存します。投入側は runner.events で取得します。
  const recorded = await context.emit({ phase: 'reading' })
  if (!recorded.success)
    throw new Error(recorded.error.message)

  // 返された JSON がジョブの output になります。成功後に runner.get で確認できます。
  return { month: input.month, rows: 120 }
}
```

#### 3. ジョブを投入して結果を読む

以下を `report-demo.mjs` として保存します。1 つのプロセスで両方の役割を担当します。ハンドラーを登録してから、2026 年 11 月分の月次レポートを投入します。

```js
import { setTimeout as delay } from 'node:timers/promises'
import { reldb } from '@h-ai/reldb'
import { runner } from '@h-ai/runner'
import { buildReport, reportKind } from './report.mjs'

// ジョブとイベントは RelDB に保存します。先にこのプロセス専用のインメモリデータベースを開きます。
const database = await reldb.init({ type: 'sqlite', database: ':memory:' })
if (!database.success)
  throw new Error(database.error.message)

try {
  // Runner を起動してテーブルを準備します。executor の既定値は true で、このプロセスがジョブを取得できます。
  const started = await runner.init({ nodeId: 'report-local' })
  if (!started.success)
    throw new Error(started.error.message)

  // 投入時と同じ kind でハンドラーを登録します。登録に成功してからこの種別のジョブを投入します。
  const registered = runner.register(reportKind, buildReport)
  if (!registered.success)
    throw new Error(registered.error.message)

  // 認証済みユーザーを模擬します。実際のサービスでは、信頼できるログイン情報から両方の値を取得します。
  const scope = { tenantId: 'demo', userId: 'alice' }
  // idempotencyKey はこのレポートを識別します。同じスコープ、種別、入力で再投入すると同じ ID が返ります。
  const submitted = await runner.submit({
    scope,
    kind: reportKind,
    idempotencyKey: 'report-2026-11',
    input: { month: '2026-11' },
  })
  if (!submitted.success)
    throw new Error(submitted.error.message)

  // 後から照会するために受領情報の id を使います。queued は保存済みで取得待ちの状態です。
  const { id, status } = submitted.data
  process.stdout.write(JSON.stringify({ id, status }) + '\n')

  const deadline = Date.now() + 5_000
  for (;;) {
    // 元のスコープと受領情報の ID で照会します。success は取得の成否、status はジョブの状態です。
    const task = await runner.get(scope, id)
    if (!task.success)
      throw new Error(task.error.message)

    if (task.data.status === 'succeeded') {
      // 連番 0 の次から最初のページを取得します。このハンドラーが保存するイベントの連番は 1 です。
      const events = await runner.events(scope, id, 0, 20)
      if (!events.success)
        throw new Error(events.error.message)
      process.stdout.write(JSON.stringify({
        id,
        status: task.data.status,
        output: task.data.output,
        events: events.data.map(({ sequence, data }) => ({ sequence, data })),
      }) + '\n')
      break
    }

    // queued と running では待機を続けます。それ以外では待機を終了し、失敗理由または状態を表示します。
    if (task.data.status !== 'queued' && task.data.status !== 'running')
      throw new Error(task.data.failure ?? task.data.status)
    if (Date.now() >= deadline)
      throw new Error('Timed out waiting for the report')
    await delay(50)
  }
}
finally {
  // 終了時は取得を停止し、ハンドラーを解除してローカルの実行を後処理します。確認してからデータベースを閉じます。
  const closed = await runner.close()
  if (!closed.success) {
    process.stderr.write(closed.error.message + '\n')
    process.exitCode = 1
  }
  else {
    const released = await reldb.close()
    if (!released.success) {
      process.stderr.write(released.error.message + '\n')
      process.exitCode = 1
    }
  }
}
```

#### 4. 実行して出力を確認する

```sh
node report-demo.mjs
```

起動ログに続いて次の 2 行が表示されます。`<ID>` はどちらも同じ 64 桁の十六進数です。2 行目の `output` はハンドラーの戻り値で、連番 1 のイベントは `context.emit` が保存したものです。

```text
{"id":"<ID>","status":"queued"}
{"id":"<ID>","status":"succeeded","output":{"month":"2026-11","rows":120},"events":[{"sequence":1,"data":{"phase":"reading"}}]}
```

例の終了時にインメモリデータベースは解放されます。別プロセスに実行を任せる場合や、API プロセスの再起動後も結果を照会する場合は、共有データベースを使います。[2 ノードで実行する例](#two-node-example)

<a id="api-reference"></a>

## API リファレンス

<a id="nodes"></a>

### ノードを起動してハンドラーを登録する

1 つのプロセスで投入と実行を兼ねられます。個別にスケールさせる場合は、リクエストを受け付けるプロセスで `executor: false` を設定します。実行プロセスはハンドラーを登録してジョブを取得します。実行ノードごとに固有の `nodeId` を割り当て、再起動後も同じ値を使います。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `runner.create()` | ライフサイクルが独立したインスタンスを生成 | 引数なし。同じプロセス内の RelDB 接続を共有 | `RunnerFunctions`。起動には `init` を呼び出す | `const api = runner.create()` |
| `RunnerConfigSchema.safeParse(input)` | ホストが読み込んだ設定を検証 | YAML またはアプリケーションコードから取得した設定オブジェクト | Zod の結果。成功時の `data` に既定値を補い、失敗時の `error.issues` に該当する項目を表示 | `RunnerConfigSchema.safeParse({ nodeId: 'reports-api' })` |
| `runner.init(config)` | 永続テーブルを初期化してノードを起動 | `config: RunnerConfigInput`。`nodeId` は必須、`executor` の既定値は `true`。[設定一覧](../configuration/runner.ja.md#configuration-fields) | `Promise<HaiResult<void>>`。設定、データベース、重複起動によるエラーでは初期化を中止 | `await runner.init({ nodeId: 'reports-api', executor: false })` |
| `runner.isExecutor` | このインスタンスが実行を担当しているかを確認 | 読み取り専用プロパティ | `boolean`。未初期化、終了処理中、または投入のみのノードでは `false` | `const canExecute = runner.isExecutor` |
| `runner.register(kind, handler)` | ジョブ種別に信頼済みハンドラーを割り当てる | `kind` は 1～100 文字。`handler(input, context)` が入力を検証し、非同期で JSON を返す | `HaiResult<() => void>`。実行ノードでの重複種別は `CONFLICT`。成功値の関数でこの登録を解除できる | `runner.register('report.v1', async input => input)` |
| `runner.environment(id)` | 設定済みのコンテナー環境を確認 | `id` は設定で登録した環境 ID | `HaiResult<RunnerEnvironment>`。未登録の場合は `NOT_FOUND` | `runner.environment('alpine-offline')` |
| `context.emit(data)` | 現在のジョブの進捗を保存 | `data: RunnerJson`。各イベントは最大 512 KiB で、件数制限とジョブあたり合計 16 MiB の上限を適用 | `Promise<HaiResult<void>>`。成功したイベントは連番順に取得可能。リース喪失、期限切れ、上限超過時は失敗 | `await context.emit({ phase: 'reading' })` |
| `runner.close()` | 取得を停止し、ローカルジョブのリソース解放を待つ | 引数なし。終了処理の期限は `closeTimeoutMs` | `Promise<HaiResult<void>>`。後処理を確認できない場合は `CLEANUP_UNCONFIRMED` | `await runner.close()` |

ハンドラーでは `context.id` が実行 ID、`scope` が元のリクエストのスコープ、`owner` がノード ID とプロセスの起動世代です。`parentId` と `locale` は投入記録から取得します。時間のかかる処理や I/O の中断には `context.signal` を使います。API ノードでも共通の起動処理で `register` を呼び出せます。ハンドラーは実行ノードで動作します。

<a id="two-node-example"></a>

#### 利用例：投入と実行を別プロセスに分ける

2 つのターミナルで別々のデプロイを再現します。API ノードは PostgreSQL にジョブを投入し、状態を照会します。実行ノードは同じデータベースをポーリングして `report.v1` を取得し、レポートのハンドラーを実行して結果とイベントを書き戻します。ジョブの受け渡しはデータベースを通じて行います。

| ノード | 起動方法 | 担当する操作 |
| --- | --- | --- |
| API ノード `report-api` | リクエストごとに起動するコマンド。`executor: false` | `submit` でジョブを保存して実行 ID を取得。別の `status` コマンドで同じスコープと ID を使って `get`、`events` を呼び出す |
| 実行ノード `report-worker` | 常駐プロセス。`executor: true` | `register` で `report.v1` を登録し、共有データベースから取得して実行 |

ジョブは次の 3 ステップを経由します。矢印は共有データベースの読み書きの方向を表します。

```text
API submit → PostgreSQL   レポート要求を保存し、ID を返す
Worker     ↔ PostgreSQL   ジョブを取得し、進捗と結果を書き込む
API status ← PostgreSQL   元のスコープと ID で進捗と結果を取得する
```

**1. 共有データベースを用意します。** 両方のターミナルでクイックスタートのプロジェクトディレクトリを開きます。インストール済みのパッケージと `report.mjs` を使います。接続可能な PostgreSQL を用意し、接続ユーザーに対象スキーマでテーブルとインデックスを作成し、レコードを読み書きする権限を付与します。実際の接続設定を `.env.local` に保存し、バージョン管理の対象から外します。別々のマシンで動かす場合は、両方から接続可能なアドレスを設定し、同じデータベースとスキーマに接続します。

```dotenv
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=runner_demo
PGUSER=runner_demo
PGPASSWORD=データベースのパスワードを入力
```

以下を `report-db.mjs` として保存します。両方のスクリプトはこの設定でデータベースを開きます。終了時は Runner がジョブの取得を停止し、ローカルの後処理を確認してから接続を閉じます。

```js
import { reldb } from '@h-ai/reldb'
import { runner } from '@h-ai/runner'

export async function openReportDatabase() {
  // 両プロセスで共用する環境ファイルから接続設定を読み取ります。
  const { PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } = process.env
  if (!PGHOST || !PGDATABASE || !PGUSER)
    throw new Error('Set PGHOST, PGDATABASE and PGUSER before starting')

  // RelDB が接続を検証します。接続できない場合は、どちらのスクリプトも runner.init を呼び出しません。
  const opened = await reldb.init({
    type: 'postgresql',
    host: PGHOST,
    port: Number(PGPORT ?? '5432'),
    database: PGDATABASE,
    user: PGUSER,
    password: PGPASSWORD,
  })
  if (!opened.success)
    throw new Error(opened.error.message)
}

export async function closeReportNode() {
  // 後処理を確認できない場合は RelDB を開いたままにし、呼び出し側でエラーの報告と再試行を行います。
  const stopped = await runner.close()
  if (!stopped.success)
    return stopped

  // Runner はデータベースの使用を終了しています。データベースを閉じられない場合はエラーを通知します。
  const released = await reldb.close()
  if (!released.success)
    throw new Error(released.error.message)
  return stopped
}
```

**2. 実行スクリプトを `report-worker.mjs` として保存します。** このスクリプトが使うのはジョブ種別とハンドラーです。`report-worker ready for report.v1` と表示されると、もう一方のターミナルから投入したジョブを取得できる状態です。

```js
import { setTimeout as delay } from 'node:timers/promises'
import { runner } from '@h-ai/runner'
import { closeReportNode, openReportDatabase } from './report-db.mjs'
import { buildReport, reportKind } from './report.mjs'

await openReportDatabase()
let stopping = false
const requestStop = () => { stopping = true }
process.on('SIGINT', requestStop)
process.on('SIGTERM', requestStop)

try {
  // 実行ノードに安定した ID を割り当てます。起動に成功してからハンドラーを登録し、ready を表示します。
  const started = await runner.init({ nodeId: 'report-worker', executor: true })
  if (!started.success)
    throw new Error(started.error.message)

  // kind が report.v1 と一致するジョブがこのハンドラーに渡されます。
  const registered = runner.register(reportKind, buildReport)
  if (!registered.success)
    throw new Error(registered.error.message)
  process.stdout.write('report-worker ready for report.v1\n')

  for (;;) {
    // Runner のポーリングタイマーだけでは Node.js は常駐しません。通常のタイマーで独立したプロセスを維持します。
    while (!stopping)
      await delay(100)

    // Ctrl+C または SIGTERM で終了処理を開始します。後処理を確認できない場合はプロセスと接続を維持して、再度シグナルを待ちます。
    stopping = false
    const closed = await closeReportNode()
    if (closed.success)
      break
    process.stderr.write(closed.error.message + '\n')
  }
}
catch (error) {
  // 起動や実行に失敗した場合も後処理を試み、元のエラーを Node.js に送ります。
  const closed = await closeReportNode()
  if (!closed.success)
    process.stderr.write(closed.error.message + '\n')
  throw error
}
finally {
  process.off('SIGINT', requestStop)
  process.off('SIGTERM', requestStop)
}
```

**3. 投入スクリプトを `report-api.mjs` として保存します。** `submit` は月次レポートを共有データベースに書き込んで終了します。`status <ID>` を実行するたびに新しいプロセスで状態を照会します。両方のコマンドで同じサンプルの `scope` を使います。

```js
import { runner } from '@h-ai/runner'
import { closeReportNode, openReportDatabase } from './report-db.mjs'
import { reportKind } from './report.mjs'

const [command, id = ''] = process.argv.slice(2)
if (command !== 'submit' && (command !== 'status' || !id))
  throw new Error('Usage: report-api.mjs submit | status <ID>')

await openReportDatabase()
try {
  // 投入や照会の API だけを有効にします。このプロセスはジョブを取得しません。
  const started = await runner.init({ nodeId: 'report-api', executor: false })
  if (!started.success)
    throw new Error(started.error.message)

  const scope = { tenantId: 'demo', userId: 'alice' }
  if (command === 'submit') {
    // 実行側は reportKind の種別と照合します。同じコマンドを再実行すると同じ ID が返ります。
    const submitted = await runner.submit({
      scope,
      kind: reportKind,
      idempotencyKey: 'report-2026-11',
      input: { month: '2026-11' },
    })
    if (!submitted.success)
      throw new Error(submitted.error.message)
    process.stdout.write(JSON.stringify({ id: submitted.data.id, status: submitted.data.status }) + '\n')
  }
  else {
    // 元のスコープとコマンドラインの ID で照会します。取得できたら status を確認します。
    const task = await runner.get(scope, id)
    if (!task.success)
      throw new Error(task.error.message)

    // 永続化されたイベントを取得します。ジョブが待機中の間は空のリストです。
    const events = await runner.events(scope, id, 0, 20)
    if (!events.success)
      throw new Error(events.error.message)
    process.stdout.write(JSON.stringify({
      id,
      status: task.data.status,
      owner: task.data.owner?.nodeId,
      output: task.data.output,
      failure: task.data.failure,
      events: events.data.map(({ sequence, data }) => ({ sequence, data })),
    }) + '\n')
  }
}
finally {
  // この API プロセスの Runner と RelDB を閉じます。投入したジョブは共有データベースに残ります。
  const closed = await closeReportNode()
  if (!closed.success)
    throw new Error(closed.error.message)
}
```

**4. 投入から結果まで確認します。** 新しく用意したデータベースを使い、実行ノードは停止したままにします。ターミナル A でジョブを投入し、受領情報の `id` をコピーします。以降のコマンドにある `<ID>` をその値に置き換えてください。

```sh
node --env-file=.env.local report-api.mjs submit
node --env-file=.env.local report-api.mjs status "<ID>"
```

投入コマンドは `{"id":"<ID>","status":"queued"}` を出力します。投入コマンドの終了後も、照会コマンドは `queued` と `events: []` を返します。ジョブは PostgreSQL に保存され、取得を待っています。

ターミナル B で実行ノードを起動し、そのまま動かします。

```sh
node --env-file=.env.local report-worker.mjs
```

`report-worker ready for report.v1` が表示されたら、ターミナル A で同じ ID を照会します。`queued` や `running` が表示された場合は、少し待ってから再度照会してください。

```sh
node --env-file=.env.local report-api.mjs status "<ID>"
```

```text
{"id":"<ID>","status":"succeeded","owner":"report-worker","output":{"month":"2026-11","rows":120},"events":[{"sequence":1,"data":{"phase":"reading"}}]}
```

`owner` から、ターミナル B のノードがレポートを実行したことを確認できます。`submit` を再実行すると、元の ID と現在の状態が返ります。ジョブが成功したらターミナル B で Ctrl+C を押し、ターミナル A で同じ照会コマンドを実行します。停止後も結果を照会できます。実行ノードの終了時、Runner はそのノードで実行中のハンドラーにキャンセルを通知します。待機状態が続く場合は、両プロセスが同じデータベースとスキーマに接続していること、実行ノードの準備ができていること、登録した種別と投入した `kind` が一致することを確認してください。

Web API では 2 つのコマンドを `POST /reports` と `GET /reports/{id}` に対応させます。作成ルートは認証済みの呼び出し元から `scope` を取得し、指定されたレポート対象月を `input` に渡して、投入成功時に HTTP 202 と `{ id, status }` を返します。照会ルートは現在の認証済みユーザーから `scope` を取得し直し、パスの `id` で状態とイベントを読み取ります。実行側は同じ常駐スクリプトで PostgreSQL からジョブを取得します。

<a id="tasks"></a>

### ジョブを投入し、進捗を再開してキャンセルする

受領情報の実行 ID を業務レコードとともに保存します。クライアントとの接続が切れた後も、サーバーは業務上の冪等キーで元の実行 ID を取得し、同じスコープで状態とイベントを照会できます。

<a id="task-kinds"></a>

#### ジョブの実行方法を選ぶ

`submit` が新しいジョブを受け付けると、実行レコードが作成されます。まず `kind` で対応するハンドラーを選びます。月次レポートの生成なら `report.v1` です。次に、どの実行枠を使うか、実行中の特定のプロセスに処理を届ける必要があるかを決めます。

| 用語 | 投入方法 | 利用場面 |
| --- | --- | --- |
| 通常ジョブ | `capacityClass` と `parentId` を省略 | レポート生成やファイル出力など、単独で完結する処理。条件に合う実行ノードが通常の実行枠で取得 |
| 親ジョブ | 本来の用途に合わせて投入し、受領情報の `id` を保存 | 接続やプロセスを維持するジョブ。別のジョブがその ID を `parentId` に指定したとき、親ジョブになる |
| 制御子ジョブ | 同一スコープの実行中のジョブ ID を `parentId` に指定し、`capacityClass` は既定値を使用 | 元のプロセスで稼働中のセッションにメッセージを送る場合。親と同じノード、同じ起動世代で実行され、独自の受領情報を持つ。`maxControlRunning` の対象 |
| ツールジョブ | 信頼済みサービスが `capacityClass: 'tool'` を指定 | レポートなどで通常の実行枠が埋まってもツールを実行できるよう、個別にリソースと同時実行枠を確保。`toolMaxRunning` と `toolCapacity` を使用 |

コンテナーの利用は独立した選択です。プロセスを隔離する場合は `environmentId` を指定します。通常ジョブでもコンテナーを使えます。進捗の確認や実行全体のキャンセルには、下の `get`、`events`、`cancel` を使います。

Tools のカタログと認可を使うアプリは、[Tools Runner](tools-runner.ja.md) で永続ジョブを投入し、Runner のキュー、コンテナー、実行枠を利用できます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `runner.submit(request)` | ジョブを永続化して受け付ける | `request: RunnerSubmit`。`scope`、`kind`、`input` は必須 | `Promise<HaiResult<RunnerExecution>>`。新規ジョブは `queued`。同じキーでの再投入では元のジョブの状態を返す場合がある | `await runner.submit({ scope, kind: 'report.v1', input: { month: '2026-11' } })` |
| `runner.find(scope, kind, key)` | 業務上の冪等キーで実行 ID を復元 | `scope: RunnerScope`、`kind: string`、初回投入時の `idempotencyKey` | `Promise<HaiResult<RunnerExecution \| undefined>>`。該当なしは未作成または削除済みの場合がある | `await runner.find(scope, 'report.v1', 'report-2026-11')` |
| `runner.get(scope, id)` | 現在の状態と結果を照会 | 元のスコープと受領情報の 64 桁の十六進数の実行 ID | `Promise<HaiResult<RunnerExecution>>`。このスコープで参照できない場合は `NOT_FOUND` | `await runner.get(scope, id)` |
| `runner.events(scope, id, after?, limit?)` | 永続化したイベントの続きから取得 | スコープと実行 ID。`after` は 0 以上の安全な整数で既定値は `0`。その連番より後を取得。`limit` は 1～100 で既定値は `100` | `Promise<HaiResult<RunnerEvent[]>>`。成功時に空のページが返れば、現在は追加のイベントなし | `await runner.events(scope, id, 1, 20)` |
| `runner.cancel(scope, id)` | キャンセル要求を永続化 | 元のスコープと実行 ID | `Promise<HaiResult<RunnerExecution>>`。待機中のジョブは直接 `cancelled` になり、実行中のジョブは通常まず `cancelling` になる | `await runner.cancel(scope, id)` |

##### 投入時の項目

| 項目 | 必須条件・既定値・用途 |
| --- | --- |
| `scope` | 必須。`{ tenantId, userId }` の各 ID は 1～200 文字。サーバー側で認証済みの情報から取得し、照会やキャンセルごとに権限を確認 |
| `kind` | 必須。英数字、アンダースコア、ピリオド、ハイフンで 1～100 文字。実行ノードは登録済みハンドラーと照合 |
| `input` | 必須の JSON。入力が不要なジョブでは `null` を指定。投入データ全体と成功時の業務結果はそれぞれ最大 512 KiB |
| `idempotencyKey` | 任意、1～200 文字。同じスコープ、種別、キーで同一リクエストを投入すると同じ実行 ID を返す。業務入力など識別に使う項目を変更すると `CONFLICT` |
| `reuseKey` | 任意、1～200 文字。信頼済みサービスで既存の予約を再利用。投入に成功すると、併せて指定した新しい冪等キーも記録。照合前の `unknown` は再利用キーを保持する場合がある |
| `locale` | 任意の 1～64 文字の言語タグ。先頭部分は半角英字、ハイフンに続く部分は半角英数字。ハンドラーは `context.locale` から取得。再投入しても初回の記録を使用 |
| `environmentId` | 任意のコンテナー環境 ID。省略時はホストでハンドラーを実行。指定する場合は API ノードと実行ノードで同じ環境を登録 |
| `resources` | 任意。`cpu`、`memoryMiB`、`pids`、`scratchMiB` のうち指定した項目を上書き。コンテナー環境の上限以内とし、`pids` は 2 以上。ホストジョブで上書きを指定した場合、省略した項目の既定値は CPU 1 コア、メモリ 64 MiB、16 プロセス、一時領域 16 MiB |
| `nodeId` | 任意の対象ノード。省略時は条件を満たす実行ノードが取得可能 |
| `parentId` | 任意。同じスコープの実行中の親ジョブ ID。制御ジョブは親と同じノード、同じ実行世代で処理。`capacityClass: 'default'` を使用し、`nodeId`、`environmentId`、`resources`、`reuseKey`、`concurrency` を省略 |
| `capacityClass` | 任意。既定値は `default`。信頼済みサービスでは別の同時実行枠とリソース枠を使う `tool` を選択可能 |
| `concurrency` | 任意の `{ key, limit }`。同じ種別とキーにノード横断の同時実行上限を適用。`limit` は 1～1000 の整数。稼働中の上限が異なる場合は小さい値を使用 |
| `warmPool` | 任意の `true`。`tool` を使用して登録済みのプールの環境、種別、同時実行設定に揃える。個別のリソース上書きは省略 |
| `queueTimeoutMs`、`runTimeoutMs` | 任意。キューへの永続化、ジョブの取得からそれぞれ計測。単位はミリ秒、範囲は 1～86400000、既定値はいずれも 300000 |

#### 利用例：再接続後に同じ月次レポートの続きを取得する

呼び出し元がレポートの冪等キーを保存し、イベントを読む前に接続が切れたとします。例のレポートを投入してから、同じデータベースに接続した初期化済み API ノードで以下を実行します。実際のサービスでは認証済みの呼び出し元から `scope` を取得し、最後に受け取った連番を呼び出し元側で保持します。この例は固定のテスト用スコープを使います。

```ts
import { runner, type RunnerScope } from '@h-ai/runner'

async function resumeReport(scope: RunnerScope, after = 0) {
  // 初回投入時の scope、kind、冪等キーで実行 ID を復元します。data が undefined なら、復元できる記録はありません。
  const found = await runner.find(scope, 'report.v1', 'report-2026-11')
  if (!found.success)
    throw new Error(found.error.message)
  if (!found.data)
    return undefined

  // このカーソルより後のイベントを最大 20 件取得します。ページが空ならカーソルを維持します。
  const latest = await runner.events(scope, found.data.id, after, 20)
  if (!latest.success)
    throw new Error(latest.error.message)
  return {
    id: found.data.id,
    status: found.data.status,
    output: found.data.output,
    events: latest.data.map(({ sequence, data }) => ({ sequence, data })),
    after: latest.data.at(-1)?.sequence ?? after,
  }
}

const scope = { tenantId: 'demo', userId: 'alice' }
// 最初は 0 を渡します。例のレポートが完了していれば、reading イベントとレポート結果が含まれます。
const firstPage = await resumeReport(scope, 0)
if (firstPage) {
  process.stdout.write(JSON.stringify(firstPage) + '\n')
  // 前のページの after で再開します。イベントは 1 件なので 2 ページ目は空です。
  const nextPage = await resumeReport(scope, firstPage.after)
  process.stdout.write(JSON.stringify(nextPage) + '\n')
}
```

この例では `firstPage.after` は `1` で、`events` に `{"sequence":1,"data":{"phase":"reading"}}` が含まれます。次の照会で `events: []` が返り、カーソルは `1` のままです。実行記録が見つからない場合は、元のスコープ、ジョブ種別、キーと保持期間を確認してください。記録の削除後はキーを再利用できます。より長期間の重複排除はアプリケーションが管理します。

先に業務レコードを保存する場合は、業務トランザクションをコミットしてから、レコードの安定した ID を `idempotencyKey` として渡します。投入が途中で中断されたら、実行 ID が未登録のレコードを走査して同じキーで再投入します。レポートの公開時は業務システムで所有者を確認し、重複した書き込みを防ぎます。

#### 利用例：待機中のレポートプレビューをキャンセルする

初期化済み API ノードで次のコードを実行します。この例の実行ノードでは `report.v1` だけを登録しているため、`report.preview.v1` は待機中のままです。本番では同じ取消 API で、待機中または実行中のジョブをキャンセルできます。

```ts
import { runner, type RunnerScope } from '@h-ai/runner'

async function cancelPreview(scope: RunnerScope) {
  // ハンドラー未登録のプレビュージョブを保存します。失敗時はキャンセルに使える受領情報がありません。
  const preview = await runner.submit({
    scope,
    kind: 'report.preview.v1',
    input: { month: '2026-11' },
  })
  if (!preview.success)
    return preview
  // 元のスコープと受領情報の実行 ID でキャンセルします。この例では cancelled が返ります。
  const requested = await runner.cancel(scope, preview.data.id)
  if (!requested.success)
    return requested
  // 現在の状態を照会します。実行が始まっていた場合は状態が確定するまで照会します。
  return await runner.get(scope, preview.data.id)
}

const scope = { tenantId: 'demo', userId: 'alice' }
const result = await cancelPreview(scope)
if (!result.success)
  throw new Error(result.error.message)
process.stdout.write(JSON.stringify({ id: result.data.id, status: result.data.status }) + '\n')
```

次の図は、同じジョブの共有データベース上の状態を示します。`queued` は投入の受理を示します。`cancelling` の間は実行側が停止要求を処理しています。リースを失った場合や後処理を確認できない場合は `unknown` になります。外部に生じた結果とリソース予約を照合してください。

![Runner がジョブを永続化し、取得、停止、手動照合する際の状態](../images/function-runner-states.ja.svg)

レポートプレビューは `queued` から `cancelled` に移ります。実行中のジョブで `cancelling` が返ったら、`cancelled`、別の終了状態、または `unknown` になるまで照会します。項目、状態の意味、保持期間は[実行記録](../data/runner.ja.md#table-hai-runner-executions)を参照してください。

<a id="利用例親ジョブの実行ノードに制御リクエストを送る"></a>
<a id="parent-control"></a>

#### 利用例：実行中のセッションに次のメッセージを送る

次のメッセージを別の API プロセスが受け取ることがあります。エージェントなどの対話型プログラムへの接続は、起動した実行プロセスに残っています。Runner は `parentId` を使って、その接続を持つプロセスにメッセージを届けます。同じノード ID で再起動しても、その接続は引き継げません。Hai の管理対象 ACP でも、プロンプトやセッション終了の要求をこの方法で元のプロセスに届けます。[管理対象 ACP のセッション](../development/ai-acp.md)

| 担当 | 操作 |
| --- | --- |
| 元の実行プロセス | 親ジョブが接続を開き、`context.id` をキーにプロセス内に保存して、親ジョブの終了時に削除。その接続へのメッセージを同じ実行プロセスで処理 |
| API プロセス | アプリのセッション記録から親ジョブの受領 ID を取得し、親と同じ認可済みスコープでメッセージジョブを投入。新しい受領 ID を使って、このメッセージへの応答を照会 |

既存のセッションプロトコルを Runner につなぐ例です。実行プロセスで `runner.init` の後に `registerSessionMessages(connections)` を呼びます。親ジョブは接続の確立後に `connections.set(context.id, connection)` で接続を登録し、進捗イベントで受付可能になったことを API に伝えます。`finally` で接続を削除します。`connection.send` はアプリが実装するメソッドで、接続にメッセージを送り、応答を返します。

```ts
import { runner } from '@h-ai/runner'

type SessionConnection = { send: (message: string, signal: AbortSignal) => Promise<string> }

function registerSessionMessages(connections: ReadonlyMap<string, SessionConnection>) {
  // メッセージ処理を登録します。親ジョブの実行プロセスで接続を取得します。
  const registered = runner.register('session.message.v1', async (input, context) => {
    if (typeof input !== 'string' || !context.parentId)
      throw new Error('Expected a message and a parent execution')
    const connection = connections.get(context.parentId)
    if (!connection)
      throw new Error('Session connection is closed')

    // キャンセルのシグナルをセッションに渡します。応答がこの子ジョブの出力になります。
    const reply = await connection.send(input, context.signal)
    return { reply }
  })
  if (!registered.success)
    throw new Error(registered.error.message)
  return registered.data
}
```

API プロセスは次の投入関数を呼びます。アプリのセッション記録から親 ID を取得し、続く照会には今回発行された受領 ID を使います。

```ts
import { runner, type RunnerScope } from '@h-ai/runner'

async function submitSessionMessage(scope: RunnerScope, parentId: string, message: string) {
  // 実行中の元プロセスにメッセージを届けます。親が終了済みの場合は CONFLICT になります。
  const submitted = await runner.submit({ scope, parentId, kind: 'session.message.v1', input: message })
  if (!submitted.success)
    throw new Error(submitted.error.message)

  // 受領 ID はこのメッセージのものです。元のセッションの識別には引き続き親 ID を使います。
  return submitted.data.id
}
```

例えば `next` を送り、セッションから `ready` が返るとします。子ジョブの成功後に新しい受領 ID で `runner.get` を呼ぶと、`output: { reply: 'ready' }` を取得できます。親がすでに終了していれば投入は `CONFLICT` を返し、子の待機中に親が終了すれば子の状態は `cancelled` になり、`failure` は `parent-ended` です。記録済みの進捗を表示するには `events`、親ジョブ全体を停止するには親の ID でキャンセルを呼びます。

<a id="containers"></a>

### 隔離コンテナーでジョブを実行する

投入側は `runner.submit` の `environmentId` で設定済みの環境を選びます。実行側はハンドラー内で `context.start({ command, args })` を呼び、読み書きできる `child` を取得します。コマンドは信頼済みハンドラーが選びます。既定ではオフライン、ルートファイルシステムは読み取り専用、実行ユーザーは UID と GID 1000 です。[コンテナーの設定例](../configuration/runner.ja.md#container-example)

| 取得したい内容 | 実行側で行うこと | 投入側での確認方法 |
| --- | --- | --- |
| コマンドの短い出力 | `child.stdout` を読み、終了コードを確認して JSON を返す | `runner.get` で `output` を取得 |
| 生成ファイルを 1 つ | `/output` に書き込み、終了前に `child.artifact` で取得 | 短いテキストを返すか、大きなファイルを認可済みストレージに保存して参照を返す |
| スクリプトが変更した複数のファイル | `workspace` を初期化し、終了前に `child.snapshot` で作業領域を取得 | ハンドラーが返す内容や参照を取得 |

`child.wait()` は終了状態を返します。`child.close()` はコンテナーを停止し、一時ファイルを解放するため、各例では `finally` で呼びます。ストリームやファイルはハンドラーが明示的に読みます。再接続後に読み取る進捗は `context.emit` で記録します。[ストリームデータの保存範囲](../data/runner.ja.md#ai-sse)

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `context.start(launch)` | 割り当てられた環境でプロセスを 1 つ起動 | `launch: RunnerLaunch`。ジョブごとに最大 1 回 | `Promise<HaiResult<RunnerProcess>>`。環境の未指定、無効な引数、リース喪失、エンジンの起動エラー時に失敗 | `await context.start({ command: '/bin/sh', args: ['-c', 'printf ready'] })` |
| `child.stdin`、`child.stdout`、`child.stderr` | 標準ストリームを読み書き | 返されたハンドルの Node.js ストリーム | 順に `Writable`、`Readable`、`Readable` | `child.stdin.end()`、`child.stderr.resume()` |
| `child.wait()` | 接続先プロセスの終了を待機 | 引数なし | `Promise<{ code, signal }>`。終了コード `0` は正常終了 | `const exit = await child.wait()` |
| `child.artifact(name, maxBytes)` | 稼働中のコンテナーから成果物を読み取る | `name` は `/output` の階層なしのファイル名。`maxBytes` は 1 バイト～50 MiB の整数 | `Promise<HaiResult<string>>`。成功時は Base64。コンテナー停止、通常ファイル以外、上限超過の場合は失敗 | `await child.artifact('report.txt', 64)` |
| `child.snapshot(maxBytes)` | 稼働中のコンテナーの書き込み可能なワークスペースを取得 | `maxBytes` はワークスペースの容量内の正の整数。起動時の `workspace` とイメージ内の Node.js が必要 | `Promise<HaiResult<Record<string, string>>>`。相対パスと Base64 内容の対応表 | `await child.snapshot(1024 * 1024)` |
| `child.close()` | コンテナーとローカルの一時ファイルを削除 | 引数なし | `Promise<HaiResult<void>>`。解放を確認できない場合は `CLEANUP_UNCONFIRMED`。再試行可能 | `await child.close()` |

<a id="起動とウォームプールの項目"></a>

##### コンテナー起動の項目

| 項目 | 必須条件・既定値・用途 |
| --- | --- |
| `command`、`args` | `command` は必須。空文字や先頭のハイフンは不可。`args` の既定値は空配列で最大 128 項目。シェルが不要なら実行ファイルと引数を直接渡す |
| `cwd` | 既定値は `/workspace`。正規化された配下のディレクトリを指定可能 |
| `env`、`files` | 既定値はそれぞれ空のオブジェクト。`env` は最大 128 項目でコンテナープロセスに渡す。`files` は階層なしのテキストファイル最大 32 件で、起動時に `/state` にコピー |
| `inputs` | 任意。階層なしの Base64 ファイル最大 8 件を `/input` に読み取り専用で配置。空の表でも `/input` と `/output` を確保。復号後の上限は 50 MiB と `scratchMiB` をバイト換算した値の小さい方。入力付きの起動と事前起動には一時領域が 4 MiB 以上必要 |
| `workspace`、`workspaceExecutables` | 任意。新規起動時に相対 POSIX パスと Base64 内容から専用ワークスペースを初期化。通常ファイル 512 件、50 MiB、ワークスペース容量の各上限を適用。実行可能パスは `workspace` に含まれ、重複不可。スナップショットは内容を返す |

##### 例を実行する前の準備

コンテナーエンジンと実行環境 ID を設定し、その設定で Runner を初期化します。実行ノードで `runner.init` が成功してから、以下のハンドラーを登録します。単一プロセスで検証する場合は、同じスクリプトで続けて投入できます。別プロセスでは API ノードが投入し、両方に同じ実行環境を設定します。[コンテナーの設定例](../configuration/runner.ja.md#container-example)

標準ストリームには `alpine-offline`、成果物の取得と事前起動には `/usr/bin/python3` を備えた `python-offline`、スナップショットには `node` を備えた `node-offline` を設定します。実際のファイルはホストが認可します。ハンドラーは `context.scope` で権限を再確認し、ホストが選んだストレージに成果物を保存します。

<a id="container-command-example"></a>

#### 利用例：固定コマンドを実行して標準出力を読む

実行側で `alpine-offline` 環境と次のハンドラーを登録します。ハンドラーは標準出力を `{ text }` にまとめ、投入側は受領 ID でこの JSON を照会します。

```ts
import { runner } from '@h-ai/runner'

function registerContainerReport() {
  // この種別を登録する前に、起動に使う実行環境を確認します。
  const environment = runner.environment('alpine-offline')
  if (!environment.success)
    return environment

  // 固定コマンドのハンドラーを登録します。成功時は登録解除関数を取得できます。
  return runner.register('report.banner.v1', async (_input, context) => {
    // 割り当てられたイメージで文字列を出力します。起動に成功すると標準ストリームを使えます。
    const launched = await context.start({ command: '/bin/sh', args: ['-c', 'printf report-ready'] })
    if (!launched.success)
      throw new Error(launched.error.message)
    const child = launched.data
    child.stdin.end()
    child.stderr.resume()
    try {
      let text = ''
      for await (const chunk of child.stdout)
        text += String(chunk)
      // 標準出力と終了コードで、コマンドが完了したことを確認します。
      const exit = await child.wait()
      if (exit.code !== 0)
        throw new Error('Report command failed')
      return { text }
    }
    finally {
      // コンテナーと一時ファイルの削除を確認します。後処理を確認できない場合は Runner が再確認します。
      const stopped = await child.close()
      if (!stopped.success)
        throw new Error(stopped.error.message)
    }
  })
}

const registered = registerContainerReport()
if (!registered.success)
  throw new Error(registered.error.message)
```

初期化済み API ノードからジョブを投入します。この例はクイックスタートのスコープを使います。単一プロセスで検証するときに `scope` をすでに宣言している場合は、その値を使います。

```ts
import { runner } from '@h-ai/runner'

const scope = { tenantId: 'demo', userId: 'alice' }
// 登録済みの実行環境とジョブ種別を選びます。受領情報の ID で status の例を使い、結果を照会できます。
const submitted = await runner.submit({
  scope,
  kind: 'report.banner.v1',
  environmentId: 'alpine-offline',
  input: null,
})
if (!submitted.success)
  throw new Error(submitted.error.message)
process.stdout.write(JSON.stringify({ id: submitted.data.id, status: submitted.data.status }) + '\n')
```

受領情報の ID と元のスコープで照会します。成功時の出力は `{"text":"report-ready"}` です。ジョブ種別、環境、リソースの条件を満たすノードがなければ、待機状態が続きます。条件を満たすノードが取得した後、ローカルにイメージがなければ、ハンドラーの `context.start` で起動に失敗します。

<a id="artifact-example"></a>

#### 利用例：コンテナーからレポート成果物を取得する

投入側は `python-offline` を選びます。実行側が元ファイルを `/input` に置き、コマンドが `/output/report.txt` を生成します。`ready` を出力した後、コマンドは `read` で待機します。その間にハンドラーがファイルを取得し、標準入力を閉じてコマンドを終了させます。以下のハンドラーを実行側で登録します。

```ts
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { runner } from '@h-ai/runner'

// デモ用の固定ファイルコピーを登録します。実際のハンドラーはスコープに基づいて認可済みの入力を取得します。
const copy = runner.register('report.copy.v1', async (_input, context) => {
  // 読み取り専用のサンプルをコピーし、準備完了を通知して標準入力が閉じるまで待機します。
  const launched = await context.start({
    command: '/bin/sh',
    args: ['-ec', 'cat /input/source.txt > /output/report.txt\nprintf ready\nread -r done || true'],
    inputs: { 'source.txt': Buffer.from('example report').toString('base64') },
  })
  if (!launched.success)
    throw new Error(launched.error.message)
  const child = launched.data
  child.stderr.resume()
  try {
    const ready = once(child.stdout, 'data', { signal: context.signal })
    child.stdout.resume()
    // 準備完了または早期終了を待ちます。ファイル生成前に終了した場合は終了状態を報告します。
    await Promise.race([
      ready,
      child.wait().then(({ code, signal }) => { throw new Error(`Copy exited before ready: ${code ?? signal}`) }),
    ])
    // プロセスの終了前に生成済みファイルを最大 64 バイト読み取ります。
    const file = await child.artifact('report.txt', 64)
    if (!file.success)
      throw new Error(file.error.message)
    child.stdin.end()
    // コマンドの終了を待ちます。終了コードが 0 以外の場合はハンドラーの失敗として扱います。
    const exit = await child.wait()
    if (exit.code !== 0)
      throw new Error('Copy failed')
    return { text: Buffer.from(file.data, 'base64').toString('utf8') }
  }
  finally {
    // コンテナーと一時ファイルを削除します。後処理に失敗した場合は照合用の証拠を保持します。
    const stopped = await child.close()
    if (!stopped.success)
      throw new Error(stopped.error.message)
  }
})
if (!copy.success)
  throw new Error(copy.error.message)
```

前の例の投入コードを使い、`kind` を `report.copy.v1`、`environmentId` を `python-offline` に変更します。`input: null` はそのまま使います。受領情報の ID で照会すると、成功時の出力は `{"text":"example report"}` です。本番のハンドラーは通常、認可済み成果物の参照を返します。

<a id="snapshot-example"></a>

#### 利用例：プロジェクトスクリプトを実行してワークスペースを確認する

投入側は `node-offline` を選びます。実行側は専用の `/workspace` にスクリプトを配置して実行します。スクリプトが終了してもシェルは `read` で待機するため、その間にスナップショットを取れます。まず実行側で以下のハンドラーを登録します。

```ts
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { runner } from '@h-ai/runner'

// 新規コンテナーでワークスペースを確認するジョブを登録します。実行するスクリプトはアプリで選び、登録に成功してからこの種別を有効にします。
const registered = runner.register('report.inspect.v1', async (_input, context) => {
  // 初期ワークスペースのスクリプトを実行します。report.txt を生成した後はスナップショットを取得するまで待機します。
  const launched = await context.start({
    command: '/bin/sh',
    args: ['-ec', './scripts/check.sh\nread -r done || true'],
    workspace: {
      'scripts/check.sh': Buffer.from('#!/bin/sh\nprintf checked > report.txt\nprintf ready\n').toString('base64'),
    },
    workspaceExecutables: ['scripts/check.sh'],
  })
  if (!launched.success)
    throw new Error(launched.error.message)
  const child = launched.data
  child.stderr.resume()
  try {
    const ready = once(child.stdout, 'data', { signal: context.signal })
    child.stdout.resume()
    // スクリプトの準備完了を待ちます。通知前に終了した場合も処理します。
    await Promise.race([
      ready,
      child.wait().then(({ code, signal }) => { throw new Error(`Workspace check exited before ready: ${code ?? signal}`) }),
    ])
    // 稼働中の Node.js イメージから、上限の範囲内で相対パスと Base64 内容を取得します。
    const files = await child.snapshot(1024 * 1024)
    if (!files.success)
      throw new Error(files.error.message)
    const report = files.data['report.txt']
    if (!report)
      throw new Error('Missing report.txt')
    child.stdin.end()
    // コマンドが正常終了したことを確認してから、スナップショットで読んだテキストを返します。
    const exit = await child.wait()
    if (exit.code !== 0)
      throw new Error('Workspace check failed')
    return { text: Buffer.from(report, 'base64').toString('utf8') }
  }
  finally {
    // 今回の実行で使用したコンテナーと一時ディレクトリを削除します。
    const stopped = await child.close()
    if (!stopped.success)
      throw new Error(stopped.error.message)
  }
})
if (!registered.success)
  throw new Error(registered.error.message)
```

[固定コマンドの例](#container-command-example)の投入コードを使い、`kind` を `report.inspect.v1`、`environmentId` を `node-offline` に変更します。`input: null` はそのまま使います。受領情報の ID で照会すると、成功時の出力は `{"text":"checked"}` です。コンテナーの削除時にワークスペースも削除されるため、必要なファイル内容はスナップショットから保存してください。

<a id="warm-pool"></a>

### 頻繁に使うツールのコンテナーを事前に起動する

頻繁に投入するコピージョブでは、起動処理の一部を先に済ませられます。実行ノードが空のコンテナーを準備し、条件の合うジョブが届いたら今回の入力を書き込んでハンドラーに渡します。各コンテナーは 1 件に割り当て、使用後に片付けます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `runner.registerWarmPool(pool)` | 使い切りのウォームプールを登録 | `pool: RunnerWarmPool`。実行ノードでは先にハンドラーを登録。オフラインで入出力領域を確保できる環境が必要 | `HaiResult<() => void>`。成功値の関数で登録を解除し、ローカルの未割り当てコンテナーを回収 | `runner.registerWarmPool({ key: 'report-copy', kind: 'report.copy.v1', environmentId: 'python-offline', minReady: 1, maxRunning: 2, maxTotal: 3 })` |

##### ウォームプールの項目

| 項目 | 必須条件・既定値・用途 |
| --- | --- |
| `pool.key`、`pool.kind`、`pool.environmentId` | 必須のプールキー、ジョブ種別、オフライン環境 ID。API ノードと実行ノードで環境と容量上限を揃える |
| `pool.minReady`、`pool.maxRunning`、`pool.maxTotal` | 必須の整数。準備済みの目標数は 0～1000、実行数と合計の上限は 1～1000。最初の 2 項目は合計上限以下。合計には起動中、準備済み、実行中、後処理中、照合待ちを含む |

#### 利用例：繰り返し実行するコピージョブ用のウォームプールを用意する

[レポート成果物を取得するハンドラー](#artifact-example)を再利用します。実行側は先に `report.copy.v1` を登録します。次に両側でキー、ジョブ種別、環境、同時実行上限を揃えてプールを登録します。コンテナーを準備して取得するのは実行側です。ハンドラーでは `inputs` と既定の作業ディレクトリを使い、`env` と `files` は空のまま、作業領域の初期ファイルは渡しません。[ツール用の実行枠の設定](../configuration/runner.ja.md#tool-capacity-example)

```ts
import { runner } from '@h-ai/runner'

// Python 環境の使い切りウォームプールを登録してから、warmPool 付きのジョブを投入します。
const pool = runner.registerWarmPool({
  key: 'report-copy',
  kind: 'report.copy.v1',
  environmentId: 'python-offline',
  minReady: 1,
  maxRunning: 2,
  maxTotal: 3,
})
if (!pool.success)
  throw new Error(pool.error.message)
```

実行側はプール登録までを行います。投入側はツール用の実行枠と同じプールキーを指定します。`concurrency.limit` はプールの `maxRunning` と揃えます。

```ts
import { runner, type RunnerScope } from '@h-ai/runner'

async function queueCopy(scope: RunnerScope) {
  // プールの同時実行キーと上限に揃えます。受理後は実行ノードがコンテナーを割り当てます。
  return await runner.submit({
    scope,
    kind: 'report.copy.v1',
    environmentId: 'python-offline',
    capacityClass: 'tool',
    concurrency: { key: 'report-copy', limit: 2 },
    warmPool: true,
    input: null,
  })
}

const submitted = await queueCopy({ tenantId: 'demo', userId: 'alice' })
if (!submitted.success)
  throw new Error(submitted.error.message)
process.stdout.write(JSON.stringify({ id: submitted.data.id, status: submitted.data.status }) + '\n')
```

受領情報の ID でコピージョブを照会します。成功時の出力は `{"text":"example report"}` です。このプールは準備済み 1 件を目標とし、稼働中のジョブは最大 2 件、合計は最大 3 件です。適合する事前起動コンテナーがなければ、使用可能な枠の範囲で新規起動して同じ結果を得られます。`minReady` のみを変更しても、すでに待機中のジョブを取得できます。この種別の受け付けを止めるときは `pool.data()` を呼び出してローカルの未割り当てコンテナーを回収します。割り当て済みのジョブは終了処理まで続行します。

<a id="reconciliation"></a>

### 元の実行ノードで結果不明のジョブを照合する

ジョブが `unknown` の場合は、業務システムがすでにレポートを保存または公開したかを確認し、再実行の要否を判断します。次に元ノードのプロセスと一時領域が片付いたかを確認し、Runner の実行枠を解放できるかを判断します。`reconcileUnknown` は後者のための API です。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `runner.reconcileUnknown(scope, id, review)` | 元の実行ノードでリソースの後処理を確認し記録 | 元のスコープと実行 ID。`review: RunnerReconciliation` に認可済み担当者と記録理由を指定 | `Promise<HaiResult<RunnerExecution>>`。成功時は状態 `unknown` を保ち、`reconciledAt` を記録して予約を解放。証拠不足や後処理中は失敗 | `await runner.reconcileUnknown(scope, id, { operatorId: 'ops-1', reason: 'INC-47 container removed' })` |

##### 照合項目と確認事項

| 項目 | 用途 |
| --- | --- |
| `operatorId` | 必須。認可済みの運用入口で取得した 1～100 文字の識別子 |
| `reason` | 必須。前後の空白を除いて空でなく、最大 300 文字。チケットと確認内容を記録。改行や NUL 文字は不可 |
| `hostResourcesStopped` | 任意の `true`。ホストハンドラーのリソースが停止したこと、または完全な ID を取得できなかったコンテナーの作成要求が元のエンジンで完了したことを確認 |

- 完全なコンテナー ID がある場合は、元のノードでコンテナーの停止と削除を確認します。Runner は元のエンジンとコンテナーの識別情報を照合し、一時ファイルを確認して削除します。
- 完全な ID がない場合、Runner は記録済みの作成試行と検証可能な一時ファイルの受領情報を確認します。それでも ID が見つからない場合は、元のエンジンで作成要求が完了したことを確認してから `hostResourcesStopped: true` を渡します。Runner は作成試行と一時ファイルの識別情報も確認します。
- ホストで実行したジョブは、アプリケーションリソースの停止を確認します。Runner は元の Linux プロセスの識別情報と終了を確認します。制御ジョブでは、親が確定済みまたは照合済みであることも必要です。証拠が不足している間は予約を保持します。

#### 利用例：元のコンテナーが削除されたことを記録する

1. 初回投入時のスコープと受領 ID で `runner.get(scope, id)` を呼びます。`unknown` を確認し、`owner.nodeId` から元の実行ノードを特定します。
2. 認可済みの運用インターフェースで `container_json.id` の完全な ID を取得し、元ノードでコンテナーが停止・削除されたことを確認します。[実行レコード](../data/runner.ja.md#table-hai-runner-executions)
3. 元ノードの Runner で次の関数を呼びます。手順 1 のスコープと ID、認証された担当者 ID、実際のチケットと証拠を指定します。完全な ID が得られない場合は上の確認手順に従います。

```ts
import { runner, type RunnerScope } from '@h-ai/runner'

async function recordContainerCleanup(scope: RunnerScope, id: string, operatorId: string) {
  // INC-47 で確認したコンテナーの削除を記録します。成功時は unknown の受領情報と reconciledAt が返ります。
  const verified = await runner.reconcileUnknown(scope, id, {
    operatorId,
    reason: 'INC-47 container removed',
  })
  if (!verified.success)
    return verified
  return { status: verified.data.status, reconciledAt: verified.data.reconciledAt }
}
```

成功時の受領情報には `status: 'unknown'` と `reconciledAt` が入り、ジョブが予約していた容量を再利用できます。失敗時は予約を保持します。エラーに沿って元のノードと後処理の証拠を再確認してください。レポートの再実行を決める前に、業務システムで元の結果を保存または公開したかを確認し、業務上の冪等ルールに従います。

## エラー処理

`HaiResult.success` は API 呼び出しが成功したかを示します。`get()` の成功時に `failed` のジョブが返る場合や、`cancel()` の成功時にまだ `cancelling` の場合があります。パッケージは `HaiRunnerError` でエラーコードを公開します。

| エラー | 発生条件と対処 |
| --- | --- |
| `NOT_INITIALIZED` | インスタンスの起動前か、終了処理中に利用できない操作 |
| `ALREADY_INITIALIZED` | インスタンスが起動済み、起動中、または終了処理中 |
| `INVALID` | 引数、ファイルパス、容量の組み合わせ、起動設定が無効。該当する項目を確認 |
| `NOT_FOUND` | 環境が未登録か、スコープから対象の実行を参照できない |
| `CONFLICT` | 冪等キーが別のリクエストで使用済み、重複登録、親ジョブを利用できない、または照合条件が変化 |
| `UNAVAILABLE` | 依存先、実行エンジン、永続ストレージが利用不可。原因を解消し、元の冪等キーから復元 |
| `CAPACITY` | キューが満杯か、要求したリソースが許容上限を超過 |
| `LEASE_LOST` | 実行リースが無効か、イベント書き込みが件数またはバイト数の上限を超過。ジョブの状態とイベントの上限を確認。リースを失った場合は外部への結果の公開を停止 |
| `CLEANUP_UNCONFIRMED` | 後処理の期限を超過したか、リソース停止を確認できない。ジョブの状態を確認し、必要なら元のノードで照合 |
