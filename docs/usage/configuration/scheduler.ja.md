# @h-ai/scheduler 設定

[原文（中国語）](scheduler.md) · [データ構造](../data/scheduler.ja.md) · [API リファレンス](../function/scheduler.ja.md)

## 設定の読み込み

`config/_scheduler.yml` を読み込み、Scheduler の初期化前に RelDB に接続します。Scheduler にはデータベースが必要です。同じ環境の各スケジューラープロセスは同じデータベースを使用します。

## 設定一覧


| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `enableDb` | `true` | タスクの予定と実行状態をデータベースに保存します。指定できる値は `true` です。 |
| `tickInterval` | `1000` | 実行待ちを確認する間隔。100〜2147483647 ミリ秒の整数。 |
| `leaseMs` | `300000`（5 分） | 取得または更新のたびに、現在のノードが実行権を保持できる時間。1000〜86400000 ミリ秒の整数。 |
| `nodeId` | UUID | ノードの識別子。省略時にプロセスが生成。 |
| `maxLogs`, `retentionDays` | 省略可 | ログを件数または日数で削除。省略した上限は適用しない。 |

<a id="execution-lease"></a>

### 実行リースのしくみ

共有データベースには、各実行の担当ノードと実行権の期限が記録されます。`leaseMs: 60000` の場合、ノードは取得時に 60 秒の実行権を得ます。処理中は約 20 秒ごとに更新し、更新が成功するたびにその時点から 60 秒後まで期限が延びます。

ノードが更新できなくなると、他のノードは最後のリースが失効した後のスキャンでその実行を確認します。開始前のタスクは再取得できます。開始済みのタスクを引き継げるのは、冪等性が宣言され、試行回数が残っている場合です。それ以外は `unknown` となり、外部での結果を確認します。実行権を失ったノードは最終結果を確定できません。

たとえば 12:00:00 に取得し、12:00:20 の更新後にノードが停止すると、条件を満たした実行は 12:01:20 以降に引き継げます。リースを短くすると停止を早く検出できる一方、DB の一時的な障害やプロセスの停止でも実行権を失いやすくなります。更新が続く限り、タスクはリース期間を超えて実行できます。API と JavaScript ハンドラーの各試行の制限時間は、それぞれの `timeout` で設定します。

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

各プロセスは同じ DB に接続し、`nodeId` は別々にします。別ノードなら `orders-scheduler-west` などを指定します。実行待ちを 1 秒ごとに確認し、上記の 60 秒リースで実行担当を調整します。

```yaml schema=@h-ai/scheduler:SchedulerConfigSchema
nodeId: orders-scheduler-east
enableDb: true
tickInterval: 1000
leaseMs: 60000
retentionDays: 30
```
