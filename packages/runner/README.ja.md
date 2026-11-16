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

## 設定一覧

`runner.init()` でノードの役割、実行設定、タスクの保持期間を指定します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/runner.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/runner.md)（中国語）を参照してください。

- `init` / `close` / `environment` / `isExecutor` — ノードの役割と実行環境の構成
- `register` / `registerWarmPool` / `submit` — 実行処理とウォームプールの登録、ジョブ投入
- `find` / `get` / `events` / `cancel` / `reconcileUnknown` — ジョブ検索、イベントの取得、キャンセル、結果不明時の照合

## データ構造

永続タスク、実行リース、イベント、ワークスペース、コンテナ成果物については[データ構造](../../docs/usage/data/runner.md)（中国語）を参照してください。

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
