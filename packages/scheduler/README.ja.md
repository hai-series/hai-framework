# @h-ai/scheduler

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

`scheduler` は cron スケジュールに従って JavaScript の処理や HTTP API を実行します。タスク設定と実行ログをデータベースに保存し、実行前後にアプリが指定した処理も呼び出せます。

## クイックスタート

### 依存関係

- `@h-ai/reldb`：先に共有 DB を初期化し、タスク・journal・リースを保存します。`enableDb` は true のみです。

```ts
import { reldb } from '@h-ai/reldb'
import { scheduler } from '@h-ai/scheduler'

await reldb.init({ type: 'sqlite', database: './scheduler.db' })

await scheduler.init({
  enableDb: true,
  maxLogs: 1000,
  retentionDays: 30,
  hooks: {
    onTaskStart(event) {
      void event
    },
  },
})

await scheduler.register({
  id: 'health-check',
  name: '健康检查',
  description: '每 5 分钟执行一次系统健康检查',
  cron: '*/5 * * * *',
  params: { channel: 'ops' },
  handler: {
    kind: 'api',
    url: 'https://api.example.com/health',
    method: 'GET',
    timeout: 10000,
  },
})

await scheduler.register({
  id: 'cleanup',
  name: '清理过期数据',
  description: '每日凌晨执行过期数据清理',
  cron: '0 2 * * *',
  deleteAfterRun: true,
  params: { source: 'nightly' },
  handler: {
    kind: 'js',
    code: '(context) => ({ taskId: context.taskId, params: context.params })',
  },
})

scheduler.start()

const manualResult = await scheduler.trigger('cleanup', { source: 'admin-console' })
const logs = await scheduler.getLogs({
  triggerType: 'manual',
  triggerSource: 'admin-console',
  startedAfter: Date.now() - 24 * 60 * 60 * 1000,
})

scheduler.stop()
await scheduler.close()
```

## 設定一覧

生成したプロジェクトでは、タスクを探す間隔と実行権の有効期間を `config/_scheduler.yml` に記述します。アプリの起動コードがファイルを読み込み、設定オブジェクトを `scheduler.init(config)` に渡します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/scheduler.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/scheduler.md)（中国語）を参照してください。

- `scheduler.init` / `scheduler.close` / `scheduler.config` / `scheduler.isInitialized` / `scheduler.isRunning` / `scheduler.start` / `scheduler.stop` — 設定と状態を確認し、タスクの検索を開始・停止し、終了時にリソースを解放する
- `scheduler.register` / `scheduler.updateTask` / `scheduler.unregister` / `scheduler.refreshTasks` / `scheduler.tasks` — タスクを登録・更新・削除し、データベースから再読み込みして現在の一覧を表示する
- `scheduler.trigger` / `scheduler.getLogs` / `scheduler.setHooks` / `scheduler.clearHooks` / `scheduler.hooks` / `scheduler.execution` — タスクを即時実行し、ログを確認し、コールバックを設定し、実行中の情報を取得する

## データ構造

タスク、実行ログ、分散リース、復旧状態については[データ構造](../../docs/usage/data/scheduler.md)（中国語）を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/scheduler test
```

宣言の JSDoc 例は実在する公開入口から import します。内部リポジトリ、runner、コンパイラ、cron ツールは「模块内部上下文」と明記し、パッケージルートの公開 API を意味しません。HaiResult、明示的な取消しの reject、close の Promise<void> を区別し、業務 status とログ persistence も別に確認します。ログ修復で業務を再実行しません。保守時は `node scripts/check-module-jsdoc.mjs --package scheduler` で宣言網羅性と実際の型を検証します。例のコンパイルは共有 DB・独立プロセス検証を代替しません。

## ライセンス

Apache-2.0
