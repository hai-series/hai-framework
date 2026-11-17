# @h-ai/runner データ構造

<!-- translation: partial -->

[原文（中国語）](runner.md) · [設定](../configuration/runner.ja.md) · [API リファレンス](../function/runner.ja.md)

同じ Runner の各ノードでデータベースを共有します。ジョブの所有権はリースと世代で確認します。実行の所有ノードは Redis では決まりません。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `hai_runner_executions` | ID、スコープ、種別、要求・再利用キー、検証済みの入力と環境、状態、所有・固定ノードの世代、リース・待機・実行期限、リソース上限、結果とコンテナ情報、照合・予熱状態。再利用キーは NULL 可。 |
| `hai_runner_events` | `id` が主キー。`execution_id`、`sequence_number`、`event_json`、`created_at`。実行 ID と順序で取得。 |
| `hai_runner_gate` | 単一行 `id=1`。`revision` は 0 から始まり、共有容量のトランザクションで更新。 |

フィールド制約・既定値・保存期間の詳細は[中国語リファレンス](runner.md)に掲載しています。
