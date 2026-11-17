# @h-ai/scheduler 設定

[原文（中国語）](scheduler.md) · [データ構造](../data/scheduler.ja.md) · [API リファレンス](../function/scheduler.ja.md)

`_scheduler.yml` を読み込み、永続タスクを有効にする前に共有データベースを初期化します。永続化なしの設定は開発用の単一プロセスで使います。

```yaml schema=@h-ai/scheduler:SchedulerConfigSchema
tickInterval: 1000
leaseMs: 300000
nodeId: orders-scheduler-east
retentionDays: 30
```

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `enableDb` | `true` | 予定と実行状態を永続化。 |
| `tickInterval`, `leaseMs` | `1000`, `300000` | スケジューラーの確認間隔とリース（ミリ秒）。 |
| `nodeId` | UUID | ノードの識別子。省略時にプロセスが生成。 |
| `maxLogs`, `retentionDays` | 省略可 | ログを件数または日数で削除。省略した上限は適用しない。 |
