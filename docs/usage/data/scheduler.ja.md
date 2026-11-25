# @h-ai/scheduler データ構造

[简体中文](scheduler.md) · [English](scheduler.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/scheduler.ja.md) · [API リファレンス](../function/scheduler.ja.md)

Scheduler のノードはタスク定義と実行の受領情報を共有データベースに保存します。たとえば日次レポートの定期実行と手動実行は同じ実行枠を使い、管理者は各試行の結果を調べられます。

<a id="tables"></a>

<a id="database"></a>

## データベース

永続化を有効にすると、Scheduler は予定、実行の占有、結果を [RelDB](reldb.ja.md) に保存します。タスクの時刻は日時、実行とログの時刻は Unix ミリ秒で示します。

モジュールは 3 テーブルを使用します。

| テーブル | 用途 |
| --- | --- |
| [`hai_scheduler_tasks`](#table-hai-scheduler-tasks) | タスクの実行予定、ハンドラー、引数を確認します。 |
| [`hai_scheduler_executions`](#table-hai-scheduler-executions) | 起動ごとの取得、実行、照合をノード間で調整します。 |
| [`hai_scheduler_logs`](#table-hai-scheduler-logs) | 実行ごとの結果、所要時間、詳細を確認します。 |

<a id="table-hai-scheduler-tasks"></a>

### `hai_scheduler_tasks`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `INTEGER` | 不可 | — | タスク行の自動採番主キー。 | `1` |
| `task_id` | `TEXT` | 不可 | — | アプリがタスクを検索する一意の ID。 | `daily-report` |
| `task_name` | `TEXT` | 不可 | — | タスクの表示名。 | `Daily report` |
| `description` | `TEXT` | 可 | — | タスクの説明。 | `NULL` |
| `cron` | `TEXT` | 不可 | — | Cron の予定式。 | `0 0 * * *` |
| `timezone` | `TEXT` | 可 | — | IANA タイムゾーン。省略時は UTC で予定を計算します。 | `UTC` |
| `enabled` | `BOOLEAN` | 不可 | `true` | 定期実行が有効かどうか。 | `true` |
| `idempotent` | `BOOLEAN` | 不可 | `false` | タスクを安全に再実行できることを示すアプリの宣言。 | `true` |
| `delete_after_run` | `BOOLEAN` | 不可 | `false` | 実行後にタスクを削除するかどうか。 | `false` |
| `retry` | `JSON` | 可 | — | タスクの再試行設定。 | `{"maxAttempts":2,"backoffMs":[45000]}` |
| `params` | `JSON` | 可 | — | タスクのハンドラーに渡す引数。 | `{"reportId":"report-42"}` |
| `handler` | `JSON` | 可 | — | 永続化するハンドラーの記述。 | `NULL` |
| `created_at` | `TIMESTAMP` | 可 | — | タスクの登録時刻。 | `2026-11-17T00:00:00Z` |
| `updated_at` | `TIMESTAMP` | 可 | — | タスクの最終更新時刻。 | `2026-11-17T00:00:00Z` |

<a id="example-data"></a>


#### 例 · どの作業をいつ実行するか

再起動後も計画を復元するための定義です。

```json
{
  "id": 1,
  "task_id": "daily-report",
  "task_name": "Daily report",
  "cron": "0 0 * * *",
  "timezone": "UTC",
  "enabled": true,
  "idempotent": true,
  "delete_after_run": false,
  "retry": { "maxAttempts": 2, "backoffMs": [45000] },
  "params": {
    "reportId": "report-42"
  }
}
```

daily-report は UTC 毎日0時です。idempotent:true だけで外部副作用の一度限り実行を保証しません。

<a id="table-hai-scheduler-executions"></a>

### `hai_scheduler_executions`

**一回の起動につき台帳に一行を保存し、実行終了後も保持します。** `occurrence_id` はその行の固定 ID で、`owner` は現在の取得トークンです。成功、失敗、または確定したスキップでは `active_task` を解放します。`unknown` の場合は運用者が結果を確認するまで枠を保持します。保持設定による削除はログテーブルが対象です。台帳は同じキーでの再照会とログ補完に引き続き使われます。

<a id="occurrence-identity"></a>

#### 実行 ID の生成と引き継ぎ

**新しい起動の ID を計算します。** `daily-report` の実行時刻が `2026-11-17T00:00:00Z` の場合、各ノードは DB 時刻から分番号 `29914560` を求めます。`["daily-report","scheduled","29914560"]` を JSON にして SHA-256 でハッシュ化します。得られた ID `8012c99d…aaed96` を `X` とします。同じ分を見た二つのノードは同じ `X` を計算し、DB の一意制約により作成される行は一つです。手動実行も同じ手順で、起動種別は `manual`、キーは指定された `idempotencyKey` または新しい UUID です。

**取得後は台帳から ID を読み取ります。** この例のタスクは `idempotent: true` を宣言しています。リースは 30 秒、試行は最大二回、再試行までの待機は 45 秒です。時刻は UTC です。

| 時刻 | 起きたこと | 同じ行 `X` の変化 |
| --- | --- | --- |
| 00:00:00 | ノード A が取得し、実行を開始 | A の取得トークンを `owner` に入れて `X` を作成。試行開始時に `attempt_count` を 1 にする |
| 00:00:10 | A がリースを更新 | 取得時に返された `X` で行を特定し、`leased_until` を 00:00:40 に延長 |
| 00:00:20 | 最初の試行が失敗し、保存後に A が停止 | 行 `X` に失敗ログと次に試行できる時刻 00:01:05 を保存 |
| 00:01:00 | ノード B が失効したリースを検出 | 期限切れの行から `X` を読み、`owner` を B の取得トークンに更新。分が変わっても引き継ぎには `X` を使う |
| 00:01:05 | B が二回目の試行を開始して成功 | `X` の試行回数を 2 にし、`success` を記録してタスク枠を解放 |

リース更新、再試行、終了処理は、取得した `row.occurrenceId` を SQL の `WHERE occurrence_id = ?` に渡します。DB は現在の `owner`、状態、リースも確認します。引き継ぎ後に A が `X` を持っていても、古いトークンではその行を更新できません。外部サービスは `X` を副作用の永続的な重複排除に使えます。

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `sequence` | `INTEGER` | 不可 | — | 実行行の自動採番主キー。 | `42` |
| `occurrence_id` | `TEXT` | 不可 | — | 同じ実行を検索する一意の起動 ID。 | `8012c99d724db341a30565a0f440a11198a4a43e6b28c9251ab191e8beaaed96` |
| `task_id` | `TEXT` | 不可 | — | 対応するタスク ID。 | `daily-report` |
| `active_task` | `TEXT` | 可 | — | 実行が占有しているタスク ID。一つの行だけが同じ値を持てます。 | `daily-report` |
| `status` | `TEXT` | 不可 | — | 今回の実行状態。 | `running` |
| `owner` | `TEXT` | 可 | — | 実行を取得したノードの識別子。 | `node-1:<claim-token>` |
| `snapshot` | `JSON` | 不可 | — | 最初の取得時のタスク定義。永続化された定義には内部行 ID も入り、削除後に同じタスク ID で再登録した定義を区別します。 | `{"id":"daily-report"}` |
| `trigger_json` | `JSON` | 不可 | — | 起動方法と出所。例は抜粋。 | `{"type":"scheduled","source":null,"minute":29914560}` |
| `log_json` | `JSON` | 可 | — | 確定した受領情報。再試行待ちの間は DB 時刻で最短の再試行時刻を保存します。 | `{"retryAt":1794873665000}` |
| `logs_json` | `JSON` | 可 | — | 完了した試行のログ。各ログは `result` を持ち、記録できる結果がない場合は `null` を保存します。引き継ぎ時にもログを保持し、最終確定後にログテーブルを補完できます。 | `NULL` |
| `log_persistence` | `TEXT` | 不可 | — | 実行ログの永続化状態。 | `unconfirmed` |
| `leased_until` | `BIGINT` | 不可 | — | 現在の取得者が処理できる期限。 | `1794873630000` |
| `attempt_count` | `BIGINT` | 不可 | — | これまでの試行回数。 | `1` |
| `max_attempts` | `BIGINT` | 不可 | — | 今回の起動での試行回数上限。 | `2` |
| `updated_at` | `BIGINT` | 不可 | — | 実行状態の最終更新時刻。 | `1794873600000` |
| `created_at` | `BIGINT` | 不可 | — | 起動記録の登録時刻。 | `1794873600000` |
| `idempotent` | `BOOLEAN` | 不可 | — | 起動時点で安全に再実行できるとタスクが宣言していたかどうか。 | `true` |

<a id="今回の起動が実行中か"></a>

#### 例 · 今回の起動が実行中か

定時・手動の各起動を記録し、重複実行を防ぎます。

```json
{
  "sequence": 42,
  "occurrence_id": "8012c99d724db341a30565a0f440a11198a4a43e6b28c9251ab191e8beaaed96",
  "task_id": "daily-report",
  "active_task": "daily-report",
  "status": "running",
  "owner": "node-1:<claim-token>",
  "leased_until": 1794873630000,
  "attempt_count": 1,
  "max_attempts": 2
}
```

node-1 が daily-report を実行中です。資格の期限切れは外部操作の未実行を意味しません。

<a id="table-hai-scheduler-logs"></a>

### `hai_scheduler_logs`

**ログから台帳への対応は `occurrence_id` による多対一です。** 上の例では、台帳は `attempt_count = 2` の `success` 一行です。ログ反映後は同じ `X` に別々のログ ID を持つ二行が対応し、状態はそれぞれ `failed` と `success` です。実行中やログ補完待ちにはログがまだない場合があります。取得できなかった観測ログには台帳行がない場合があるため、外部キーはありません。

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | ログの主キー。 | `10000000-0000-4000-8000-000000000042` |
| `occurrence_id` | `TEXT` | 可 | — | ログに対応する起動 ID。 | `8012c99d724db341a30565a0f440a11198a4a43e6b28c9251ab191e8beaaed96` |
| `task_id` | `TEXT` | 不可 | — | 実行したタスクの ID。 | `daily-report` |
| `task_name` | `TEXT` | 不可 | — | 実行時のタスク表示名。 | `Daily report` |
| `task_type` | `TEXT` | 不可 | — | タスクの種類。 | `hook` |
| `trigger_type` | `TEXT` | 不可 | — | 定期または手動の起動方法。 | `scheduled` |
| `trigger_source` | `TEXT` | 可 | — | 具体的な起動元。 | `NULL` |
| `status` | `TEXT` | 不可 | — | ログが記録する実行結果。 | `success` |
| `payload` | `JSON` | 不可 | — | 実行ログの詳細。例は抜粋。 | `{"status":"success"}` |
| `started_at` | `BIGINT` | 不可 | — | 今回の試行の開始時刻。 | `1794873665000` |
| `finished_at` | `BIGINT` | 不可 | — | 今回の試行の完了時刻。 | `1794873665125` |
| `duration` | `INTEGER` | 不可 | — | 実行時間。単位はミリ秒。 | `125` |

定期実行と手動実行は同じ一意の `active_task` で排他を取ります。リースが切れ、外部処理の完了が不明なら、照合まで占有を保ちます。ログを削除しても解除されません。Redis キーは作らず、ローカルタイマーは確認を起動するだけで、担当と期限はデータベースで判断します。

テーブル定義は [タスク](../../../packages/scheduler/src/repositories/scheduler-repository-task.ts)、[実行](../../../packages/scheduler/src/repositories/scheduler-repository-execution.ts)、[ログ](../../../packages/scheduler/src/repositories/scheduler-repository-log.ts)のテーブル定義を参照してください。

<a id="人が確認する実行履歴"></a>

#### 例 · 人が確認する実行履歴

結果や所要時間を管理画面で確認する履歴です。

```json
{
  "id": "10000000-0000-4000-8000-000000000042",
  "occurrence_id": "8012c99d724db341a30565a0f440a11198a4a43e6b28c9251ab191e8beaaed96",
  "task_id": "daily-report",
  "task_name": "Daily report",
  "status": "success",
  "duration": 125
}
```

B の二回目の試行です。00:01:05 に開始し、125 ミリ秒後に成功しました。ログには固有の `id` があり、`occurrence_id` で台帳の行 `X` を参照します。
