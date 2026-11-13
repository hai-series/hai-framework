# @h-ai/runner

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークホーム](../../README.ja.md) · [リレーショナルデータベース](../reldb/README.ja.md) · [AI エージェント](../ai/README.ja.md)

Runner は Node.js のサーバー側で管理対象の Agent Worker とツールジョブを実行します。API ノードは投入、照会、キャンセル要求を受け付けます。実行ノードはジョブを取得し、コンテナを所有します。ジョブ、リース、イベント、実行結果はリレーショナルデータベースで共有します。

## クイックスタート

```sh
pnpm add @h-ai/runner @h-ai/reldb
```

RelDB を起動してから Runner を起動します。次の Node.js 用例は SQLite と信頼済みのサーバーハンドラーだけで動作します。アプリは `tenantId` と `userId` を認証済みの主体から取得し、Runner を呼ぶ前に業務権限を確認します。

```ts
import { setTimeout as delay } from 'node:timers/promises' // 上限付きのポーリングに使う。
import { reldb } from '@h-ai/reldb' // Runner が使用するリレーショナルデータベース。
import { runner } from '@h-ai/runner' // プロセス内で共有する Runner インスタンス。

const database = await reldb.init({ type: 'sqlite', database: ':memory:' }) // 成功時は { success: true, data: undefined }。
if (!database.success)
  throw new Error(database.error.message) // DB を利用できないときは起動を中止する。

try {
  const started = await runner.init({ nodeId: 'worker-east' }) // 既定は実行役割で、成功すると isExecutor は true。
  if (!started.success)
    throw new Error(started.error.message) // ジョブを投入せずに起動を中止する。

  const registration = runner.register('report.v1', async (input, context) => { // 成功時は登録解除関数を返す。
    if (typeof input !== 'string')
      throw new TypeError('Expected report title') // ハンドラーで業務入力を検証する。
    const event = await context.emit({ phase: 'ready' }) // 成功すると番号 1 のイベントを他ノードから読める。
    if (!event.success)
      throw new Error(event.error.message) // イベント保存に失敗したら処理を中止する。
    return { title: input } // ジョブが成功した場合の output になる。
  })
  if (!registration.success)
    throw new Error(registration.error.message) // 重複登録は失敗する。

  const scope = { tenantId: 'studio', userId: 'alice' } // 例の主体。本番ではサーバー認証から取得する。
  const accepted = await runner.submit({
    scope,
    kind: 'report.v1',
    idempotencyKey: 'report-nov',
    input: 'Monthly report'
  }) // queued 状態とジョブ id を含む受付票を返す。
  if (!accepted.success)
    throw new Error(accepted.error.message) // 失敗時に受付票は得られない。

  const deadline = Date.now() + 5_000 // この例では最大 5 秒待つ。
  let completed = false // 成功した終端状態を取得すると true にする。
  while (Date.now() < deadline) {
    const task = await runner.get(scope, accepted.data.id) // 同じ主体で状態と結果を読む。
    if (!task.success)
      throw new Error(task.error.message) // 照会に失敗したら中止する。
    if (task.data.status === 'succeeded') {
      process.stdout.write(`${JSON.stringify(task.data.output)}\n`) // {"title":"Monthly report"} を出力する。
      completed = true
      break
    }
    if (task.data.status !== 'queued' && task.data.status !== 'running')
      throw new Error(task.data.failure ?? task.data.status) // ジョブの失敗と照会の失敗は別に扱う。
    await delay(100) // 100 ms 待って undefined を返す。
  }
  if (!completed)
    throw new Error('Timed out waiting for the report') // タイムアウトを報告し、終了時にローカルジョブの停止を試みる。
  registration.data() // ハンドラーを登録解除し、undefined を返す。
}
finally {
  try {
    const closed = await runner.close() // 新規取得を止め、ローカルジョブをキャンセルし、後片付けを確認する。
    if (!closed.success) {
      process.stderr.write(`${closed.error.message}\n`) // 後片付け未確認を報告し、調査用に DB 接続を維持する。
      process.exitCode = 1
    }
    else {
      const released = await reldb.close() // DB 接続を閉じる。成功時は { success: true, data: undefined }。
      if (!released.success) {
        process.stderr.write(`${released.error.message}\n`)
        process.exitCode = 1
      }
    }
  }
  catch (cause) {
    process.stderr.write(`${String(cause)}\n`) // 元のジョブ例外を維持する。
    process.exitCode = 1
  }
}
```

## 機能

| 機能                   | 用途                                                               | 公開 API                                                             |
| ---------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| ノードのライフサイクル | API ノードと実行ノードを起動し、環境を確認する                     | `init`、`close`、`isExecutor`、`environment`、`createRunner`         |
| ジョブとイベント       | 永続投入、冪等な受付票復元、照会、キャンセル、イベントのページ取得 | `register`、`submit`、`find`、`get`、`events`、`cancel`              |
| コンテナとファイル     | 固定イメージの実行、標準ストリーム、認可された成果物の取得         | `context.start`、`context.emit`、`process.wait`、`artifact`、`close` |
| 子ジョブと事前起動     | 親と同じノードに制御を渡し、ツール容量を確保する                   | `submit({ parentId })`、`registerWarmPool`                           |
| 結果不明のジョブの確認 | コンテナまたはホストプロセスの終了を確認し、担当者と理由を記録する | `reconcileUnknown`                                                   |

### ノードの役割を設定し、実行環境を調べる

単一プロセスでは `runner` を使えます。`createRunner()` は依存関係の注入やテストで分離できる独立インスタンスを返します。複数ノードの本番環境では PostgreSQL または MySQL を共有し、環境定義と同時実行上限を揃えます。実行ノードの ID は一意で、再起動しても維持します。下の例では RelDB の起動後、実行ノードに取得済みの OCI イメージ ID またはマニフェストダイジェストを `imageId` として渡します。

```ts
import type { RunnerConfigInput } from '@h-ai/runner' // 両方のノード役割に共通する設定を型検査する。
import { createRunner, RunnerConfigSchema } from '@h-ai/runner' // インスタンス生成と設定の事前検証に使用する。

function prepareApi(imageId: string) {
  const settings: RunnerConfigInput = {
    nodeId: 'api-east', // ノード ID。実行ノードには別の ID を割り当てる。
    executor: false, // ジョブの投入、照会、キャンセルを担当する。
    environments: [
      {
        id: 'docs', // 投入時の environmentId。
        image: imageId, // 実行ノードに取得済みの固定ダイジェスト。
        capabilities: ['documents.extract'], // 呼び出し側の環境選択に利用できる。
        resources: {
          cpu: 1,
          memoryMiB: 256,
          pids: 64,
          scratchMiB: 64
        }, // 環境が許可する上限。
      }
    ],
  }
  return RunnerConfigSchema.safeParse(settings) // 成功時の data には既定値 podman と offline が入る。
}

async function startApi(imageId: string) {
  const settings = prepareApi(imageId) // リソース設定やダイジェストが不正な場合は Zod のエラーを返す。
  if (!settings.success)
    throw new Error(settings.error.message)
  const api = createRunner() // 新規インスタンス。起動前は isExecutor が false。
  const started = await api.init(settings.data) // 成功時の data は undefined。
  if (!started.success)
    throw new Error(started.error.message)
  const docs = api.environment('docs') // 成功時に設定のコピーを返し、data.image は imageId と一致する。
  if (!docs.success)
    throw new Error(docs.error.message)
  return api // 終了時は api.close() の成功を確認してから RelDB を閉じる。
}
```

実行ノードでは `executor: true` で起動し、`register(kind, handler)` で信頼済みのハンドラーを登録します。API ノードでも同じ初期化コードを使用でき、`register` は何もしない登録解除関数を返します。`environment(id)` で不明な ID を指定すると `NOT_FOUND` を返します。

### ジョブの復元、イベントの取得、キャンセル

同じ主体、ジョブ種別、冪等キーで同じ内容を再投入すると元の受付票を返します。内容が変わると `CONFLICT` を返します。信頼済みサービスは `reuseKey` を使って、ユーザーの Worker などの稼働中の実行を再利用できます。`find` に渡すのは冪等キーです。再利用キーはサービスで管理します。次の関数には認証済みの主体と、既存の `report.v1` の受付票に対応する冪等キーを渡します。

```ts
import type { RunnerScope } from '@h-ai/runner' // tenantId と userId を含む主体。
import { runner } from '@h-ai/runner' // ジョブが保存されたデータベースに接続済みのインスタンス。

async function cancelReport(scope: RunnerScope, key: string) {
  const found = await runner.find(scope, 'report.v1', key) // 元の受付票。未登録の場合は成功結果の data が undefined。
  if (!found.success || !found.data)
    return found // エラーまたは未登録をそのまま返す。
  const id = found.data.id // イベント取得、照会、キャンセルに同じジョブ id を使う。
  const page = await runner.events(scope, id, 0, 20) // sequence > 0 の先頭 20 件。空ページは []。
  if (!page.success)
    return page // 照会エラーをそのまま返す。
  const after = page.data.at(-1)?.sequence ?? 0 // 次のページに最後のイベント番号を渡す。
  const next = await runner.events(scope, id, after, 20) // カーソルより後のイベントを順序どおり最大 20 件取得する。
  if (!next.success)
    return next
  const cancelled = await runner.cancel(scope, id) // 待機中は cancelled。実行中は通常、先に cancelling になる。
  if (!cancelled.success)
    return cancelled
  return runner.get(scope, id) // 現在の状態を読み、必要なら停止を確認するまでポーリングする。
}
```

終端状態のジョブをキャンセルすると現在の状態を返します。`events` の既定値は `after: 0`、`limit: 100` で、件数の範囲は `1–100` です。投入内容、イベント 1 件、出力はそれぞれ JSON で最大 512 KiB です。イベントの合計は実行ごとに 16 MiB までで、件数は `maxEvents` でも制限します。大きなファイルや資格情報には業務上のオブジェクト参照または実行ノードのシークレット管理を利用してください。

実行ノードはデータベースの時刻を使い、`retentionMs`（既定は 7 日）を過ぎた終端ジョブ、確認済みの結果不明ジョブとそのイベントを分割して削除します。未確認の `unknown` と子ジョブの記録が残る親は保持します。削除後は `find` で見つからず、`get` と `events` は `NOT_FOUND` を返します。期限後は同じ冪等キーで再投入できます。保持期間内に再試行し、長期間の外部操作の重複防止はアプリで管理してください。

### 分離したコンテナの起動、ファイル入力と成果物の取得

実行ノードには Linux cgroup v2、CPU・メモリ・PID を制限できる Podman または Docker、取得済みの固定イメージが必要です。イメージは `/bin/sh` を備え、UID/GID 1000 で動作し、独自のイメージボリュームを宣言しないでください。既定はオフラインで、ルートファイルシステムは読み取り専用です。`/state`、`/workspace`、`/tmp` はサイズを制限した一時ファイルシステムです。ネットワークを使う場合は `networkPolicy: 'internal'` と、エンジンが確認できる内部ネットワーク名を設定します。信頼境界と外部通信の制限はデプロイ側で設定します。

次の例は `docs` 環境が登録済みで、イメージに `cat` と `/usr/bin/python3` があることを前提にします。入力は固定のテストデータです。実際のファイルは実行ノードで `context.scope` を使って認可済みファイル ID を再確認し、成果物を保存した後は業務上の ID を返します。

```ts
import { Buffer } from 'node:buffer' // 入力のエンコードと返されたファイルのデコードに使う。
import { once } from 'node:events' // 標準出力から成果物の準備通知を待つ。
import { core } from '@h-ai/core' // 後片付け未確認をログに残す。
import { runner } from '@h-ai/runner' // 実行ノード上で利用する。

const registration = runner.register('copy.v1', async (_input, context) => { // 登録解除関数を返す。処理はリース所有者が行う。
  const launched = await context.start({
    command: '/bin/sh', // 固定イメージ内の信頼済みの入口。
    args: ['-ec', 'cat /input/source.txt > /output/result.txt; printf ready; read -r done || true'], // 準備完了を通知し、stdin が閉じられるまで待つ。
    inputs: {
      'source.txt': Buffer.from('hello').toString('base64')
    }, // 内容が hello の読み取り専用ファイル /input/source.txt。
  }) // 成功時は stdin、stdout、stderr、wait、artifact、close を持つハンドルを返す。
  if (!launched.success)
    throw new Error(launched.error.message)
  const process = launched.data // コンテナ終了前に成果物を取得する。
  try {
    process.stderr.resume() // stderr が満杯になって子プロセスを止めないように消費する。
    await once(process.stdout, 'data', { signal: context.signal }) // 固定コマンドの準備通知を受け取る。
    const artifact = await process.artifact('result.txt', 64) // 成功時は { success: true, data: 'aGVsbG8=' }。
    if (!artifact.success)
      throw new Error(artifact.error.message)
    process.stdin.end() // stdin を閉じ、コマンドを終了させる。
    const exit = await process.wait() // 例の正常終了は { code: 0, signal: null }。
    if (exit.code !== 0)
      throw new Error('Copy failed')
    return {
      text: Buffer.from(artifact.data, 'base64').toString('utf8')
    } // 例の出力は { text: 'hello' }。
  }
  finally {
    const stopped = await process.close() // 成功時はコンテナ削除を確認し、data は undefined。
    if (!stopped.success)
      core.logger.error('Container cleanup unconfirmed', { code: stopped.error.code }) // ハンドラー終了後に Runner が結果を確認する。
  }
})
if (!registration.success)
  throw new Error(registration.error.message)
```

`{ scope, kind: 'copy.v1', input: null, environmentId: 'docs' }` を投入して待機列に追加します。`context.start` はジョブごとに 1 回呼び出せます。`files` は起動時にテキストファイルを `/state` に置き、`env` はコンテナプロセスに渡します。`cwd` の既定は `/workspace` です。`inputs` は平坦なファイル名で最大 8 件、合計は 50 MiB と `scratchMiB` の小さいほうまでです。`artifact` は実行中のコンテナの `/output` から通常ファイルを読み、指定した `maxBytes` と 50 MiB の上限を適用します。ダウンロードを許可する前に成果物の所有権を確認します。

### 子ジョブのルーティング、ツールの上限と事前起動

同じ主体の実行中のジョブを `parentId` で指定すると、子ジョブを親と同じノードと実行世代に渡します。開いている接続への制御に使います。`maxControlRunning` は制御ジョブの同時実行上限です。`capacityClass: 'tool'` はツール専用のリソースを使い、`concurrency: { key, limit }` は同じ種別とサービスキーのジョブの全ノード上限を設定します。

```ts
import type { RunnerScope } from '@h-ai/runner' // 認証済みの主体、または信頼済みの親ハンドラーから取得する。
import { runner } from '@h-ai/runner' // 共有データベースに接続済みのインスタンス。

async function sendControl(scope: RunnerScope, parentId: string) {
  return runner.submit({
    scope,
    parentId,
    kind: 'worker.control',
    input: { operation: 'status' }
  }) // queued の受付票、親が終了済みか主体が違うときは競合エラー。
}

function registerCopyPool() {
  return runner.registerWarmPool({
    key: 'docs-copy',
    kind: 'copy.v1',
    environmentId: 'docs',
    minReady: 1,
    maxRunning: 2,
    maxTotal: 3
  }) // 成功時は登録解除関数。実行ノードでは copy.v1 を先に登録する。
}

async function queuePrewarmedCopy(scope: RunnerScope) {
  return runner.submit({
    scope,
    kind: 'copy.v1',
    input: null,
    environmentId: 'docs',
    capacityClass: 'tool',
    warmPool: true,
    concurrency: { key: 'docs-copy', limit: 2 }
  }) // queued の受付票。実行ノードが使い捨てコンテナを割り当てる。
}
```

`worker.control` はアプリが実行ノードで登録します。起動時に `registerCopyPool()` を 1 回呼んで `success` を確認し、API ノードと実行ノードで同じ値を使用します。事前起動コンテナはジョブを 1 回だけ処理し、ジョブ取得後にユーザーファイルを受け取ります。`maxTotal` は準備中、待機中、稼働中、後片付け中、未確認を含みます。`maxRunning` は稼働ジョブの上限です。事前起動には `/usr/bin/python3` とオフライン環境が必要です。起動時には `inputs` を渡し、作業ディレクトリを `/workspace`、`env` と `files` を空にします。プールの利用を終了するにはジョブの受付を止め、登録解除関数を呼んでローカルの未取得コンテナを解放します。

### 結果不明の実行を確認する

リースを失った場合や後片付けを確認できない場合、リソースを確保したまま状態が `unknown` になることがあります。実際のコンテナと外部への影響を確認し、元の実行ノードで管理 API を呼びます。Runner はエンジンの識別情報、コンテナ削除、ローカル作業領域の解放を検証し、監査記録を保存します。

コンテナを使わない信頼済みの処理では、アプリが管理するリソースの終了を運用者が確認し、`hostResourcesStopped: true` を渡します。Runner は同一 Linux ホスト、同一起動セッション、同一 PID 名前空間で元のプロセスの終了を確認します。制御用の子ジョブでは、親が終端状態または確認済みである必要があります。プロセスの記録がない旧ジョブや、コンテナの証拠がないコンテナジョブの容量は保持されます。

```ts
import type { RunnerScope } from '@h-ai/runner' // ジョブの所有情報と認証済みの管理セッションから取得する。
import { runner } from '@h-ai/runner' // 元の実行ノード上のインスタンスを使う。

async function reconcile(scope: RunnerScope, id: string) {
  const checked = await runner.reconcileUnknown(scope, id, { operatorId: 'ops-1', reason: 'INC-47: container cleanup verified' }) // 成功時は unknown の受付票に reconciledAt が付く。
  if (!checked.success)
    return checked // 実行中、証拠不足、エンジン不一致のときはエラーと確保容量を維持する。
  return checked // 実行予算と再利用キーを解放する。外部への影響はアプリで確認する。
}

async function reconcileHost(scope: RunnerScope, id: string) {
  const checked = await runner.reconcileUnknown(scope, id, { operatorId: 'ops-1', reason: 'INC-48: host resources verified', hostResourcesStopped: true }) // 運用者の確認結果を渡し、成功時は reconciledAt が付いた unknown の受付票を取得する。
  if (!checked.success)
    return checked // 元プロセスの稼働、未確認の親、ローカル証拠の不足がある場合は容量を保持する。
  return checked // リソースを解放し、外部への影響はアプリで確認する。
}
```

## 設定

ホストがデプロイ設定を読み込み、オブジェクトを `runner.init(config)` に渡します。`RunnerConfigSchema.safeParse(config)` で起動前に検証できます。時間単位はミリ秒です。通常処理とツール処理の両方の予算をホストに確保します。

| フィールド                                              | 既定値                                      | 用途                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `nodeId`                                                | 必須                                        | 再起動後も同じノード ID                                                                                                          |
| `executor`、`engine`                                    | `true`、`podman`                            | ノードの役割とエンジン。`docker` も選択可                                                                                        |
| `capacity`                                              | `4 CPU / 4096 MiB / 512 PID / 2048 MiB`     | 通常処理用の CPU、メモリ、PID、一時領域                                                                                          |
| `toolCapacity`、`toolMaxRunning`                        | `1 CPU / 1024 MiB / 128 PID / 512 MiB`、`4` | ノードごとのツール専用予算と同時実行数                                                                                           |
| `maxRunning`、`maxRunningPerScope`、`maxControlRunning` | `8`、`4`、`8`                               | ノードの通常実行、主体、ノードの制御ジョブの同時実行上限                                                                         |
| `maxQueued`、`maxEvents`                                | `5000`、`10000`                             | 通常処理と制御処理それぞれの待機列上限、実行ごとの保存イベント数                                                                 |
| `retentionMs`                                           | `604800000`                                 | 終端ジョブとイベントの保持期間。1 時間から 365 日。同じデプロイ内で全ノードに同じ値を設定する                                    |
| `leaseMs`、`pollMs`、`closeTimeoutMs`                   | `10000`、`50`、`20000`                      | リース、ポーリング、終了待ち。`pollMs × 3` は `leaseMs` より小さくする                                                           |
| `environments`                                          | `[]`                                        | 環境 ID、固定イメージ、リソース、任意の `architecture` と `capabilities`。既定は `offline`。`internal` の場合は `network` が必須 |

`resources` で環境の上限より低い値を要求できます。`queueTimeoutMs` と `runTimeoutMs` の既定値はいずれも `300000` です。信頼済みサービスでは `nodeId` でノードを固定するか、`parentId` で実行中の親に関連付けます。事前起動ジョブは登録済み環境のリソース値を使います。

## エラー処理

`result.success` を確認してから `data` または `error` を参照します。初期化、不正な入力、不在、競合、容量不足、リース喪失、後片付け未確認のエラーは `HaiRunnerError` が定義します。ハンドラーが失敗した場合は、成功した `get()` の `status: 'failed'` と `failure` から確認できます。`cancel()` の成功は要求の受理を表します。停止の確認にはジョブの状態を読みます。`close()` が後片付けを確認できない場合は、調査や再試行に使う DB 接続を維持します。

## 開発とテスト

リポジトリのルートで実行します。PowerShell では `pnpm.cmd` を使います。SQLite でジョブの流れ、PostgreSQL と MySQL で共有所有権、Podman/Docker でコンテナの実制限、キャンセルと成果物を検証します。`HAI_TEST_CONTAINER_ENGINE` でコンテナエンジンを選択します。DB テストでは Docker 互換の Testcontainers 接続先も必要です。`HAI_TEST_RUNNER_ARTIFACT_IMAGE` に構築済みのテスト用イメージを指定すると、成果物とノード間事前起動のテストを有効化できます。

```sh
pnpm --filter @h-ai/runner typecheck
pnpm --filter @h-ai/runner lint
pnpm --filter @h-ai/runner build
pnpm --filter @h-ai/runner test
```

## ライセンス

Apache-2.0
