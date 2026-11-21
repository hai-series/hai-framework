# @h-ai/scheduler 設定

[原文（中国語）](scheduler.md) · [データ構造](../data/scheduler.ja.md) · [API リファレンス](../function/scheduler.ja.md)

`_scheduler.yml` を読み込み、永続タスクを有効にする前に共有データベースを初期化します。永続化なしの設定は開発用の単一プロセスで使います。

## 設定例

```yaml schema=@h-ai/scheduler:SchedulerConfigSchema
tickInterval: 1000
leaseMs: 300000
nodeId: orders-scheduler-east
retentionDays: 30
```

### 開発環境の実行履歴を少量に抑える

`config/_scheduler.yml` に記述します。実行履歴は最大 200 件、保存期間は 7 日です。2 つの制限はそれぞれ適用されます。タスク名、Cron、タイムゾーン、処理関数はアプリから登録します。

```yaml schema=@h-ai/scheduler:SchedulerConfigSchema
nodeId: orders-dev
tickInterval: 1000
maxLogs: 200
retentionDays: 7
```

### 複数プロセスでスケジュール用 DB を共有する

各プロセスは同じ DB に接続し、`nodeId` は別々にします。別ノードなら `orders-scheduler-west` などを指定します。実行待ちは 1 秒ごとに確認します。60 秒のリースは実行権の期限であり、タスクのタイムアウトでも外部処理の取り消しでもありません。

```yaml schema=@h-ai/scheduler:SchedulerConfigSchema
nodeId: orders-scheduler-east
enableDb: true
tickInterval: 1000
leaseMs: 60000
retentionDays: 30
```

## 設定一覧


| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `enableDb` | `true` | 予定と実行状態を永続化。 |
| `tickInterval`, `leaseMs` | `1000`, `300000` | スケジューラーの確認間隔とリース（ミリ秒）。 |
| `nodeId` | UUID | ノードの識別子。省略時にプロセスが生成。 |
| `maxLogs`, `retentionDays` | 省略可 | ログを件数または日数で削除。省略した上限は適用しない。 |
