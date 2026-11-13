# @h-ai/runner

Runner はエージェントとツールのコンテナを管理します。API ノードはタスクを登録して状態を取得し、実行ノードはタスクを取得してコンテナと接続を管理します。タスク、所有権、キャンセル要求、イベントは共有データベースに保存します。認証と業務上の認可はアプリケーションが行います。

## 起動とタスクの登録

Runner より先に `@h-ai/reldb` を初期化します。単一ノードでは SQLite を使用できます。複数ノードは共有 PostgreSQL または MySQL を使用し、実行ノードごとに固定の nodeId を設定します。API ノードは `executor: false` を指定できます。以下では、データベースが起動済みで、信頼できるサーバー側ハンドラーを使用します。

```ts
import { core } from '@h-ai/core'
import { runner } from '@h-ai/runner'

const scope = { tenantId: 'studio', userId: 'alice' }
const started = await runner.init({ nodeId: 'worker-east' })
if (!started.success)
  throw new Error(started.error.message)

try {
  const registration = runner.register('report.v1', async (input, context) => {
    const published = await context.emit({ phase: 'ready' })
    if (!published.success)
      throw new Error(published.error.message)
    return { summary: input }
  })
  if (!registration.success)
    throw new Error(registration.error.message)
  const accepted = await runner.submit({
    scope,
    kind: 'report.v1',
    idempotencyKey: 'report-2026-11',
    input: 'Monthly report',
  })
  if (!accepted.success)
    throw new Error(accepted.error.message)

  const task = await runner.get(scope, accepted.data.id)
  if (!task.success)
    throw new Error(task.error.message)
  void task.data.status
}
finally {
  const closed = await runner.close()
  if (!closed.success)
    core.logger.error('Runner shutdown failed', { code: closed.error.code })
}
```

`get` は状態を取得し、`find` は主体と冪等キーから受付済みタスクを検索します。`events` はカーソルでページングし、`cancel` はキャンセル要求を登録します。コンテナの停止と後処理を確認してからキャンセル済み状態を保存します。`parentId` を指定した子タスクは接続を持つノードで実行され、専用の同時実行枠を使用します。

## コンテナ環境とリソース

`environments` には ID、取得済みのイメージダイジェスト、CPU コア数、メモリ MiB、PID 数、作業領域 MiB を指定します。`environmentId` で環境を選び、必要に応じてリソース上限を下げられます。実行ノードは、同じデータベーストランザクションでタスクを取得してリソースを確保します。

エージェントが実行枠を使用している間もツールを起動できるように、`toolCapacity` でツール専用の枠を確保します。既定値は CPU 1 コア、メモリ 1024 MiB、PID 128 個、作業領域 512 MiB です。`toolMaxRunning` の既定値は 4 です。ホストは両方の枠に対応する必要があります。信頼できる呼び出し元は `capacityClass: "tool"` を指定し、`concurrency: { key, limit }` でサービスのノード横断上限を設定できます。

ハンドラーは `context.start` でコンテナを起動し、標準ストリームと終了結果を取得します。Linux cgroup v2、`/bin/sh`、UID/GID 1000 での実行が必要です。ルートファイルシステムは読み取り専用で、`/state`、`/workspace`、`/tmp` は容量を制限した tmpfs です。起動ファイルは `/state` にコピーします。ネットワークは既定で無効です。使用する内部ネットワークは、実行エンジンで internal として設定し、信頼境界に応じたゲートウェイを用意します。

資格情報と接続は実行ノードで管理します。入力、イベント、出力はサイズ制限付き JSON とし、実行記録には業務 ID とオブジェクト参照を渡します。所有者に接続できない場合や後処理を確認できない場合は `unknown` とし、運用者が確認するまでリソースを保持します。

ツールハンドラーは `inputs` に Base64 ファイルと単純なファイル名を指定し、読み取り専用の `/input` に配置できます。コンテナの実行中に `artifact(name, maxBytes)` で `/output` の通常ファイルを取得できます。入力の合計と単一の出力はそれぞれ 50 MiB 以内で、作業領域の上限も適用されます。成果物の取得にはイメージに `/usr/bin/python3` が必要です。

元の実行ノード上の信頼できる管理エンドポイントは `runner.reconcileUnknown(scope, id, { operatorId, reason })` を呼び出せます。Runner は記録済みのエンジンとコンテナを確認し、コンテナが削除され、作業ディレクトリを後処理できた場合に実行枠と再利用キーを解放します。担当者の判断を記録し、元の `unknown` に `reconciledAt` を追加します。信頼できるコンテナの受付情報がなければ実行枠を保持します。

## 開発とテスト

```bash
pnpm --filter @h-ai/runner typecheck
pnpm --filter @h-ai/runner lint
pnpm --filter @h-ai/runner build
pnpm --filter @h-ai/runner test
```

テストは実際の SQLite、PostgreSQL、MySQL と Docker/Podman コンテナを使用します。`HAI_TEST_CONTAINER_ENGINE` でエンジンを選びます。PostgreSQL と MySQL のテストは、エンジンの Docker 互換 API に Testcontainers で接続します。

## ライセンス

Apache-2.0
