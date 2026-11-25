# @h-ai/runner データ構造

[简体中文](runner.md) · [English](runner.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/runner.ja.md) · [API リファレンス](../function/runner.ja.md)

コンテナジョブを送信すると、Runner は状態、実行リソースの予算、進捗イベントを保存します。クライアントは再接続後も元の実行 ID で続きを取得できます。

<a id="tables"></a>

<a id="database"></a>

## データベース

Runner はタスク、資源上限、実行イベントを共有 [RelDB](reldb.ja.md) に保存します。各ノードはデータベースの時計で期限を判断します。

初期化時に存在しないテーブルを作成し、既存のテーブルに必要な列があることを確認します。必要な列が欠けている場合は初期化に失敗します。

モジュールは 3 テーブルを使用します。

| テーブル | 用途 |
| --- | --- |
| [`hai_runner_executions`](#table-hai-runner-executions) | タスクの状態、担当、資源上限、結果を管理します。 |
| [`hai_runner_events`](#table-hai-runner-events) | 進捗と出力を順番に読み、再接続後も続きを取得できます。 |
| [`hai_runner_gate`](#table-hai-runner-gate) | 共有容量を確認するトランザクションを調整します。 |

<a id="table-hai-runner-executions"></a>

### `hai_runner_executions`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | 実行の主キー。 | `execution-42` |
| `scope_key` | `TEXT` | 不可 | — | タスクが属する権限範囲のキー。 | `<scope-key>` |
| `reuse_key` | `TEXT` | 可 | — | 同じタスクを再提出したときに既存の実行を探す一意の再利用キー。 | `NULL` |
| `request_key` | `TEXT` | 不可 | — | リクエストのパラメーターを照合するキー。 | `<request-key>` |
| `kind` | `TEXT` | 不可 | — | 登録済みのタスク種別。 | `hai.tools.example.v1` |
| `request_json` | `JSON` | 可 | — | タスクの入力、範囲、環境、資源、期限。例は抜粋。 | `{"input":{"orderId":"order-42"}}` |
| `environment_key` | `TEXT` | 可 | — | コンテナタスクに選択した実行環境。 | `NULL` |
| `state` | `TEXT` | 不可 | — | 現在の実行状態。 | `queued` |
| `reason` | `TEXT` | 可 | — | 失敗または中止の理由。 | `NULL` |
| `owner_node` | `TEXT` | 可 | — | 実行を取得したノードの ID。 | `null` |
| `owner_generation` | `TEXT` | 可 | — | 実行を取得したノードの起動を識別する値。 | `null` |
| `owner_process_json` | `JSON` | 可 | — | タスクを担当するローカルプロセスの識別情報。 | `NULL` |
| `pinned_node` | `TEXT` | 可 | — | タスクを実行できる指定ノード。 | `NULL` |
| `pinned_generation` | `TEXT` | 可 | — | タスクを実行できる指定ノードの起動世代。 | `NULL` |
| `parent_id` | `TEXT` | 可 | — | 親実行の ID。 | `NULL` |
| `leased_until` | `BIGINT` | 不可 | — | 現在の実行リースの期限。 | `0` |
| `queue_until` | `BIGINT` | 不可 | — | キュー内のタスクを取得できる期限。 | `1794873660000` |
| `run_until` | `BIGINT` | 不可 | — | 実行開始後の期限。 | `0` |
| `event_sequence` | `BIGINT` | 不可 | — | 最新イベントの順序番号。未発生時は `0`。 | `0` |
| `event_bytes` | `BIGINT` | 不可 | `0` | 保存済みイベントのバイト数。 | `0` |
| `cpu_milli` | `BIGINT` | 不可 | — | CPU 上限。単位はミリコア。 | `1000` |
| `memory_mib` | `BIGINT` | 不可 | — | メモリー上限。単位は MiB。 | `256` |
| `pids` | `BIGINT` | 不可 | — | プロセス数の上限。 | `64` |
| `scratch_mib` | `BIGINT` | 不可 | — | 一時領域の上限。単位は MiB。 | `64` |
| `result_json` | `JSON` | 可 | — | 実行出力。成功時の結果は `value` に保存します。 | `NULL` |
| `created_at` | `BIGINT` | 不可 | — | キュー登録時刻。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 実行記録の最終更新時刻。 | `1794873600000` |
| `container_json` | `JSON` | 可 | — | 削除や照合に使うコンテナの識別情報。 | `NULL` |
| `reconciliation_json` | `JSON` | 可 | — | 照合後に記録した処理結果。 | `NULL` |
| `reconciled_at` | `BIGINT` | 可 | — | 照合結果の記録時刻。 | `NULL` |
| `capacity_class` | `TEXT` | 不可 | — | タスクが使用する実行容量の種別。 | `tool` |
| `concurrency_key` | `TEXT` | 可 | — | 並列制限に使うグループキー。 | `NULL` |
| `concurrency_limit` | `BIGINT` | 不可 | — | グループで同時に実行できるタスク数。 | `1` |
| `pool_fingerprint` | `TEXT` | 可 | — | 事前起動プールの照合用識別子。 | `NULL` |
| `pool_limit` | `BIGINT` | 可 | — | 事前起動プールの容量上限。 | `NULL` |
| `warm_state` | `TEXT` | 可 | — | 事前起動コンテナの準備状態とタスクへの引き渡し状況。 | `NULL` |

時刻は Unix ミリ秒です。キュー、ノードのリース、範囲と容量、並列グループ、親実行、削除、各期限にインデックスがあります。

<a id="example-data"></a>

<a id="待機中実行中の作業"></a>

#### 例 · 待機中・実行中の作業

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

<a id="events"></a>

<a id="table-hai-runner-events"></a>

### `hai_runner_events`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | イベントの主キー。 | `event-42` |
| `execution_id` | `TEXT` | 不可 | — | イベントを発行した実行の ID。 | `execution-42` |
| `sequence_number` | `BIGINT` | 不可 | — | 同じ実行内でのイベントの順序。 | `1` |
| `event_json` | `JSON` | 可 | — | タスクが発行したイベントデータ。`value` に保存します。 | `{"value":{"type":"progress"}}` |
| `created_at` | `BIGINT` | 不可 | — | イベントの書き込み時刻。 | `1794873600000` |

実行 ID とイベントの順序で検索できます。

<a id="作業中の順序付きメッセージ"></a>

#### 例 · 作業中の順序付きメッセージ

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

<a id="table-hai-runner-gate"></a>

### `hai_runner_gate`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `BIGINT` | 不可 | — | 初期化時に書き込む一行の固定主キー。 | `1` |
| `revision` | `BIGINT` | 不可 | — | 初期値として `0` が入り、容量のトランザクションが同時確認を調整するために更新します。 | `1` |

完了記録は通常 7 日後に削除します。元のジョブが完了したか分からない場合は照合まで保存します。Redis キーは作りません。実行ノードはローカルのプロセスやコンテナを管理し、他ノードはデータベースを参照します。

<a id="複数ノードの資源確認を調整"></a>

#### 例 · 複数ノードの資源確認を調整

同じ空き容量を各ノードが重複使用しないよう確認を調整します。

```json
{
  "id": 1,
  "revision": 1
}
```

id:1 の1行だけで、revision は実行件数や永久所有者を表しません。
