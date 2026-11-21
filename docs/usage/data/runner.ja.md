# @h-ai/runner データ構造

[原文（中国語）](runner.md) · [設定](../configuration/runner.ja.md) · [API リファレンス](../function/runner.ja.md)

<a id="example-data"></a>

## それぞれの記録の役割

### 待機中・実行中の作業

対応する構造：`hai_runner_executions`。

作業内容・担当・資源・状態を保存してノード間で協調します。

```json
{
  "id": "execution-42",
  "kind": "hai.tools.example.v1",
  "state": "queued",
  "owner_node": null,
  "owner_generation": null,
  "cpu_milli": 1000,
  "memory_mib": 256,
  "pids": 64,
  "scratch_mib": 64,
  "created_at": 1794873600000,
  "updated_at": 1794873600000,
  "event_sequence": 0,
  "event_bytes": 0
}
```

タスクレコードの項目の抜粋です。`execution-42` は `queued` のため担当は未定で、資源上限は 1 CPU、256 MiB RAM、64 プロセス、64 MiB 一時領域です。イベントはまだ記録されていません。`created_at` と `updated_at` は Unix ミリ秒です。

### 作業中の順序付きメッセージ

対応する構造：`hai_runner_events`。

進捗や出力を順に保存し、切断後も続きから読めるようにします。

```json
{
  "id": "event-42",
  "execution_id": "execution-42",
  "sequence_number": 1,
  "created_at": 1794873600000
}
```

execution-42 の第1イベントです。本文 event_json は省略しています。

### 複数ノードの資源確認を調整

対応する構造：`hai_runner_gate`。

同じ空き容量を各ノードが重複使用しないよう確認を調整します。

```json
{
  "id": 1,
  "revision": 1
}
```

id:1 の1行だけで、revision は実行件数や永久所有者を表しません。

## 項目・保存・削除のリファレンス

<a id="tables"></a>

### データベースのテーブル

ノード間で担当と期限を共有するため、共通の RelDB を使います。時刻は Unix ミリ秒で書き込みにはデータベースの時計を使います。型はバックエンド変換前の RelDB の定義です。

#### `hai_runner_executions`

| フィールドまたはテーブル | 構造と意味 |
| --- | --- |
| `id`, `scope_key`, `kind` | 必須のテキスト。実行の主キー、認可の範囲、登録済みタスク種別。 |
| `request_key`, `reuse_key` | テキストのリクエスト照合値と、NULL を許す一意の再利用キー。 |
| `request_json`, `environment_key` | 検証済み入力、範囲、環境、上限、タイムアウトの JSON スナップショットと、任意のテキスト環境 ID。 |
| `state`, `reason` | 必須のテキスト状態と、NULL を許す理由。 |
| `owner_node`, `owner_generation`, `owner_process_json` | 担当ノードと起動世代（テキスト）、プロセス識別情報（JSON）。いずれも NULL 可。 |
| `pinned_node`, `pinned_generation`, `parent_id` | タスクの実行を限定するノードと起動世代、親実行 ID。NULL を許すテキストです。 |
| `leased_until`, `queue_until`, `run_until` | 必須の整数。リース、待機、実行の期限。 |
| `event_sequence`, `event_bytes` | 必須の整数。イベント位置と記録済みのバイト数。`event_bytes` の SQL 既定値は `0`。 |
| `cpu_milli`, `memory_mib`, `pids`, `scratch_mib` | 必須の整数。CPU ミリコア、メモリ MiB、プロセス数、一時領域の MiB。 |
| `result_json`, `container_json`, `reconciliation_json` | 結果、コンテナの識別情報と状態、運用者の照合記録。NULL を許す JSON です。 |
| `created_at`, `updated_at`, `reconciled_at` | 整数の作成・更新・照合時刻。照合時刻は NULL 可。 |
| `capacity_class`, `concurrency_key`, `concurrency_limit` | 必須のテキスト容量区分、NULL を許すテキスト並列グループ、必須の整数上限。 |
| `pool_fingerprint`, `pool_limit`, `warm_state` | 任意の予備コンテナプール ID（テキスト）、容量（整数）、準備状態（テキスト）。 |

キュー、リース、範囲と容量、並列グループ、親実行、期限、削除処理用のインデックスがあります。SQL の既定値は記載した項目にのみあります。

<a id="events"></a>

### イベント・容量・削除処理

| フィールドまたはテーブル | 構造と意味 |
| --- | --- |
| `hai_runner_events` | 文字列の主キー `id` と実行 ID `execution_id`、整数の `sequence_number` と `created_at`、JSON `event_json`。実行 ID と連番で索引を持ちます。 |
| `hai_runner_gate` | 整数の単一主キー `id=1` と整数 `revision`（初期 `0`）。共有リソースを更新するトランザクション内で revision が変わります。 |

完了記録は通常 7 日後に削除します。元のジョブが完了したか分からない場合は照合まで保存します。Redis キーは作りません。実行ノードはローカルのプロセスやコンテナを管理し、他ノードはデータベースを参照します。
