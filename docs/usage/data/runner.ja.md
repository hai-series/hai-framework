# @h-ai/runner データ構造

[简体中文](runner.md) · [English](runner.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/runner.ja.md) · [API リファレンス](../function/runner.ja.md)

Alice が `demo` テナントで 2026 年 11 月分のレポートを作成します。API ノードは送信内容を保存し、実行 ID を返します。実行ノードはジョブを取得し、進捗と最終結果を記録します。ページの接続が切れても、同じスコープと実行 ID で最後に読んだイベントの次から再開できます。このレポートはホスト側のハンドラーで動作し、コンテナーや親実行を必要としません。

<a id="report-receipt"></a>

## レポートの受付結果から進捗を確認する

サーバーを初期化し、実行ノードに `report.v1` を登録してから、以下のコードを実行します。例では認証結果からサーバーが取得するスコープを固定値で示します。ページから再試行するときは同じ業務の冪等キーを使います。 [クイックスタートとハンドラーの例](../function/runner.ja.md#quick-start)

```ts
import { runner } from '@h-ai/runner'

const scope = { tenantId: 'demo', userId: 'alice' }
// サンプルの主体で月次レポートを送信します。成功すると実行 ID を含む受付結果を取得できます。
const accepted = await runner.submit({
  scope,
  kind: 'report.v1',
  input: { month: '2026-11' },
  idempotencyKey: 'report-2026-11',
  reuseKey: 'monthly-report-2026-11',
  locale: 'en-US',
})
if (!accepted.success)
  throw new Error(accepted.error.message)
const id = accepted.data.id
```

初回の送信が `success: true` を返すと、`data` に次の受付結果が入ります。`queued` はデータベースにジョブが保存された状態です。ハンドラーが正常に戻ると、Runner が出力を確定します。以下の時刻はデータベースが記録する Unix ミリ秒の例です。

```json
{
  "id": "11dd5ca46347e93111bd771e6bd59e04d4f9c8b4ba9f2b545313eebfc8da83fd",
  "status": "queued",
  "createdAt": 1796083200000,
  "updatedAt": 1796083200000
}
```

最新の受付結果は `runner.get(scope, id)` で読みます。成功したら `data.status` でレポートの進捗を判断します。ノード ID と起動世代の両方が保存されると `owner` が返ります。コンテナージョブには `environmentId`、照合済みの不明ジョブには `reconciledAt` も含まれます。

| `status` | 読み取れる内容 | 次の操作 |
| --- | --- | --- |
| `queued` | 受理された実行 ID と時刻。出力とイベントはこれから記録されます。 | ID を保存して定期的に状態を確認するか、`runner.cancel(scope, id)` で待機中のジョブを取り消します。 |
| `running` | 現在の担当ノードと、すでに確定したイベント。 | イベントをページ単位で読み、最終結果を確認します。 |
| `cancelling` | 停止要求と、それまでに確定したイベント。`failure` にタイムアウトや親の終了が記録されることがあります。 | 停止と後処理を待ちます。その間も容量を使用します。 |
| `succeeded` | レポートの結果が `output` に入ります。例は `{"month":"2026-11","rows":120}` です。ハンドラーが JSON の `null` を返すと `output` も `null` になります。 | 結果を利用し、業務上必要なら別途保存します。 |
| `failed` | `queue-timeout`、`run-timeout`、`handler-failed` などの理由と、確定済みのイベント。 | 理由と業務処理への影響を確認し、新しい実行を開始するか判断します。 |
| `cancelled` | ジョブは終了済みです。確定済みのイベントは引き続き読めます。制御用の子ジョブでは `parent-ended` が記録されることがあります。 | 状態の定期確認を終了し、必要に応じて記録を保持します。 |
| `unknown` | `owner-lost` または `cleanup-unconfirmed`。`reconciledAt` はリソースの停止を照合した時刻です。業務結果は別途確認が必要です。 | ID を保持し、元の実行ノードで運用担当者がリソースを確認して解放します。 |

<a id="tables"></a>
<a id="database"></a>

## データベース

Runner は共有 RelDB の次の 4 テーブルを使います。初期化時に不足するテーブルとインデックスを作成し、既存のテーブルに必須列が揃っていることを確認します。必須列が欠けていると初期化に失敗します。以下の型は RelDB の論理型です。時刻と期限はデータベースの時計に基づく Unix ミリ秒です。`—` はデータベースの既定値が宣言されていないことを表し、送信時や取得時にアプリケーションが書き込む値は説明欄に示します。 [RelDB のデータ構造](reldb.ja.md)

| テーブル | 用途 |
| --- | --- |
| [`hai_runner_executions`](#table-hai-runner-executions) | 実行ごとの入力、状態、担当、容量、出力、照合記録を保存します。 |
| [`hai_runner_events`](#table-hai-runner-events) | 確定した進捗を実行と連番ごとに保存します。 |
| [`hai_runner_idempotency`](#table-hai-runner-idempotency) | 実行の再利用時に受け付けた追加の業務冪等キーを保存します。 |
| [`hai_runner_gate`](#table-hai-runner-gate) | 整合性のある確認と更新が必要なトランザクションを直列化します。 |

<a id="table-hai-runner-executions"></a>

### `hai_runner_executions`

| 項目 | 型 | NULL 可 | DB の既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | 実行の主キー。業務冪等キーが指定された場合は、スコープ、ジョブ種別、キーから生成します。 | `<report-id>` |
| `scope_key` | `TEXT` | 可 | — | テナント ID とユーザー ID のハッシュ。参照や更新の範囲を限定します。 | `<scope-hash>` |
| `reuse_key` | `TEXT` | 可 | — | スコープ、ジョブ種別、再利用キーのハッシュ。値がある場合は一意で、終了確定または照合時に解放します。 | `<reuse-hash>` |
| `request_key` | `TEXT` | 不可 | — | 冪等キーや再利用キーを使った再送時に、業務内容を照合するためのフィンガープリント。 | `<request-hash>` |
| `kind` | `TEXT` | 不可 | — | 実行ノードに登録したハンドラーの種別。 | `report.v1` |
| `request_json` | `JSON` | 可 | — | スコープ、入力、実行タイムアウトと、任意の言語、実行環境、有効なリソース設定を保存したスナップショット。 | `{"input":{"month":"2026-11"},"locale":"en-US"}`（抜粋） |
| `environment_key` | `TEXT` | 可 | — | コンテナー環境のスナップショットのハッシュ。実行可能なノードの照合に使います。 | `NULL` |
| `state` | `TEXT` | 不可 | — | 実行状態。受付結果の `status` に対応し、新規のジョブには `queued` を書き込みます。 | `queued` |
| `reason` | `TEXT` | 可 | — | 失敗、停止、リース失効の理由。受付結果では `failure` に対応します。 | `run-timeout` |
| `owner_node` | `TEXT` | 可 | — | ジョブを取得した実行ノード。 | `reports-01` |
| `owner_generation` | `TEXT` | 可 | — | ジョブを取得したノードの起動世代。 | `<generation-uuid>` |
| `owner_process_json` | `JSON` | 可 | — | ホスト実行の取得時に保存可能な、元の PID、ホストの証明、起動プロセスの識別情報。 | `{"pid":4121,"hostKey":"<host-hash>","started":"312345"}` |
| `pinned_node` | `TEXT` | 可 | — | 明示的に指定された実行先、または親ジョブから引き継いだノード。 | `NULL` |
| `pinned_generation` | `TEXT` | 可 | — | 制御用の子ジョブが親から引き継いだ実行先の起動世代。 | `NULL` |
| `parent_id` | `TEXT` | 可 | — | 制御用の子ジョブに対応する親実行の ID。Runner がアプリケーション側で関連を管理します。 | `NULL` |
| `leased_until` | `BIGINT` | 不可 | — | 現在の所有者のリース期限。受付時に `0` を書き込み、取得後に設定して更新します。 | `0` |
| `queue_until` | `BIGINT` | 不可 | — | 受付時に `queueTimeoutMs` から計算した待機期限。 | `1796083500000` |
| `run_until` | `BIGINT` | 不可 | — | 取得時に保存済みの `runTimeoutMs` から計算した実行期限。受付時は `0` を書き込みます。 | `0` |
| `event_sequence` | `BIGINT` | 不可 | — | 最後に確定したイベントの連番。Runner が `0` から始めます。 | `1` |
| `event_bytes` | `BIGINT` | 不可 | `0` | 実行のイベント JSON に使ったバイト数。`value` で包んだ分を含みます。 | `29` |
| `cpu_milli` | `BIGINT` | 不可 | — | スケジューラーが予約した CPU 容量。単位はミリコアです。 | `0` |
| `memory_mib` | `BIGINT` | 不可 | — | スケジューラーが予約したメモリー容量。単位は MiB です。 | `0` |
| `pids` | `BIGINT` | 不可 | — | スケジューラーが予約したプロセス数。 | `0` |
| `scratch_mib` | `BIGINT` | 不可 | — | スケジューラーが予約した書き込み可能な一時領域。単位は MiB です。 | `0` |
| `result_json` | `JSON` | 可 | — | 成功が確定した結果を `value` に保存し、受付結果の `output` として返します。 | `{"value":{"month":"2026-11","rows":120}}` |
| `created_at` | `BIGINT` | 不可 | — | 実行記録を最初に書き込んだ時刻。 | `1796083200000` |
| `updated_at` | `BIGINT` | 不可 | — | リース更新や終了状態の確定など、最後に記録を更新した時刻。 | `1796083202000` |
| `container_json` | `JSON` | 可 | — | コンテナーの作成と後処理を照合する情報。エンジン、一時領域の識別情報、作成試行または完全なコンテナー ID を含みます。 | `NULL` |
| `reconciliation_json` | `JSON` | 可 | — | 元の実行ノードに記録した担当者、理由、該当する場合はリソース停止の確認。 | `{"operatorId":"ops-1","reason":"Report worker stopped","hostResourcesStopped":true}` |
| `reconciled_at` | `BIGINT` | 可 | — | リソース照合の結果を記録した時刻。 | `NULL` |
| `capacity_class` | `TEXT` | 不可 | — | 容量の区分。送信値の既定は `default` で、信頼済みのツールジョブは `tool` を使えます。 | `default` |
| `concurrency_key` | `TEXT` | 可 | — | ジョブ種別と同時実行キーから導出した共有グループ。 | `NULL` |
| `concurrency_limit` | `BIGINT` | 不可 | — | グループの同時実行上限。グループ未指定時は `0` を書き込みます。 | `0` |
| `pool_fingerprint` | `TEXT` | 可 | — | プールと環境のスナップショットから得た照合用のフィンガープリント。取得時は環境、同時実行グループ、上限を照合し、`minReady` は事前起動の目標を設定します。 | `NULL` |
| `pool_limit` | `BIGINT` | 可 | — | ウォームプール全体の容量上限 `maxTotal`。 | `NULL` |
| `warm_state` | `TEXT` | 可 | — | 待機コンテナーの状態は `starting`、`ready`、`transferred`。通常の実行は空欄です。 | `NULL` |

実行 ID は主キー、値がある再利用キーは一意制約で保護されます。ほかのインデックスはジョブの取得、容量の確認、削除に使います。

| インデックス | 列順 |
| --- | --- |
| `hai_runner_queue_idx` | `state`, `kind`, `created_at` |
| `hai_runner_owner_idx` | `owner_node`, `state`, `leased_until` |
| `hai_runner_scope_idx` | `scope_key`, `capacity_class`, `state` |
| `hai_runner_concurrency_idx` | `concurrency_key`, `state` |
| `hai_runner_parent_idx` | `parent_id` |
| `hai_runner_retention_idx` | `state`, `reconciled_at`, `updated_at`, `id` |
| `hai_runner_queue_due_idx` | `state`, `queue_until` |
| `hai_runner_lease_due_idx` | `state`, `leased_until` |
| `hai_runner_run_due_idx` | `state`, `run_until` |

<a id="example-data"></a>
<a id="例--待機中実行中の作業"></a>

#### 例 · 待機中のレポートの実行記録

上の受付結果に対応するデータベースの列の抜粋です。項目表と以降の例にある `<report-id>` はこの実行 ID を指します。この場合、アプリケーションからリソース上限を指定していないため、Runner は 4 つの容量列に `0` を書き込みます。実行中は同時実行数に計上します。`queue_until` は受付時刻に既定の `300000` ミリ秒を加えた値です。

```json
{
  "id": "11dd5ca46347e93111bd771e6bd59e04d4f9c8b4ba9f2b545313eebfc8da83fd",
  "kind": "report.v1",
  "request_json": {
    "scope": { "tenantId": "demo", "userId": "alice" },
    "input": { "month": "2026-11" },
    "locale": "en-US",
    "runTimeoutMs": 300000
  },
  "state": "queued",
  "owner_node": null,
  "queue_until": 1796083500000,
  "event_sequence": 0,
  "event_bytes": 0
}
```

ハンドラーは `RunnerContext.locale` から初回の送信時に保存された言語を取得します。別の言語で再試行しても既存の実行を取得します。保存済みの要求に `locale` がなければ、ハンドラーには `undefined` が渡り、ホスト側で既定言語を選びます。実行 ID と追加キーの照会にはサーバーが取得したスコープを使います。

<a id="events"></a>
<a id="table-hai-runner-events"></a>

### `hai_runner_events`

| 項目 | 型 | NULL 可 | DB の既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | 実行 ID と連番から生成したイベントの主キー。 | `<event-id>` |
| `execution_id` | `TEXT` | 不可 | — | イベントを発行した実行の ID。Runner が関連を管理します。 | `<report-id>` |
| `sequence_number` | `BIGINT` | 不可 | — | 実行内で `1` から増えるイベントの連番。 | `1` |
| `event_json` | `JSON` | 可 | — | `context.emit` に渡された JSON を `value` で包んで保存します。 | `{"value":{"phase":"reading"}}` |
| `created_at` | `BIGINT` | 不可 | — | イベントの書き込みに成功したときのデータベース時刻。 | `1796083201100` |

`hai_runner_event_cursor_idx` の列順は `(execution_id, sequence_number)` です。Runner は実行側のイベント計数の更新とイベント行の挿入を同じトランザクションで行います。イベント 1 件の内容は最大 512 KiB です。1 回の実行につき `maxEvents` の件数制限とイベント JSON 合計 16 MiB の制限があり、件数の既定値は 10,000 です。実行の削除時は同じトランザクションで関連イベントを削除します。 [Runner の設定一覧](../configuration/runner.ja.md#configuration-fields)

<a id="作業中の順序付きメッセージ"></a>
<a id="例--作業中の順序付きメッセージ"></a>
<a id="example-event"></a>

#### 例 · 再接続後にレポートのイベントを続きから読む

ハンドラーはレポートデータを読み込みながら `{"phase":"reading"}` を送信します。最初に確定したイベントは、次の項目を含みます。

```json
{
  "execution_id": "11dd5ca46347e93111bd771e6bd59e04d4f9c8b4ba9f2b545313eebfc8da83fd",
  "sequence_number": 1,
  "event_json": { "value": { "phase": "reading" } },
  "created_at": 1796083201100
}
```

初回は `runner.events(scope, id, 0, 100)` を実行します。成功時の `data` はイベントの昇順配列です。この行は `{ sequence: 1, data: { phase: 'reading' }, createdAt: 1796083201100 }` として返ります。読み終えたら `sequence: 1` を保存し、再接続時は `after: 1` を渡して後続のイベントを読みます。空配列は照会時点で続きの確定済みイベントがない状態です。実行の終了は `runner.get` で確認します。

<a id="table-hai-runner-idempotency"></a>

### `hai_runner_idempotency`

| 項目 | 型 | NULL 可 | DB の既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | スコープ、ジョブ種別、追加の業務冪等キーから生成した主キー。 | `<retry-key-hash>` |
| `execution_id` | `TEXT` | 不可 | — | `hai_runner_executions.id` を参照する外部キー。元の実行の削除時に連動して削除されます。 | `<report-id>` |

`hai_runner_idempotency_execution_idx` は `execution_id` のインデックスです。最初のレポート送信では初回の業務冪等キーから実行 ID を生成します。既存の記録も、その ID または初回のキーで参照できます。レポートを再利用できる間に、同じ業務パラメーターと `reuseKey` に別の業務冪等キー `report-2026-11-retry` を指定して送信すると、再利用のトランザクションが次の追加マッピングを保存します。

```json
{
  "id": "6a04517c9663a70069ea8eb9513fc8a8a0d5f6cffd32f75960fe7ed7e29dee29",
  "execution_id": "11dd5ca46347e93111bd771e6bd59e04d4f9c8b4ba9f2b545313eebfc8da83fd"
}
```

ジョブが終了し、再利用キーが解放された後でも、保持期間中は `runner.find(scope, 'report.v1', 'report-2026-11-retry')` で元の受付結果を確認できます。受理済みのキーで業務内容を変更して送信すると `CONFLICT` が返ります。一致する記録がないとき、`find` は成功し `data` が `undefined` になります。

この表は追加キーのハッシュと実行 ID を保存します。受理したキーごとに 1 行を使い、同じキーで再試行するとその行を再利用します。投入、復元、期限後の削除で使うため、実行表と一緒に保持してください。この表だけを削除すると、追加キーを照会するリクエストが失敗します。空の表を再初期化しても、受理済みの対応関係は失われたままです。

<a id="table-hai-runner-gate"></a>

### `hai_runner_gate`

| 項目 | 型 | NULL 可 | DB の既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `BIGINT` | 不可 | — | 主キー。初期化時に Runner が `id = 1` の調整行を用意します。 | `1` |
| `revision` | `BIGINT` | 不可 | — | 初回に `0` を書き込み、調整行を使ってトランザクションを直列化するたびに増加します。 | `2` |

<a id="複数ノードの資源確認を調整"></a>
<a id="例--複数ノードの資源確認を調整"></a>
<a id="example-gate"></a>

#### 例 · レポートの取得前に容量を確認する

2 台の実行ノードが同時にレポートを取得しようとする場合、送信、取得、容量確認のトランザクションは共有の調整行によって直列化されます。次の例は調整行のある時点の値です。トランザクションが進むと `revision` が増えます。

```json
{ "id": 1, "revision": 2 }
```

容量は実行記録から集計します。実行とイベントの保持期間が過ぎても、調整行は引き続き利用します。

共有データベースごとに `id = 1` の調整行があります。複数レコードの整合性が必要な操作は、同一トランザクションでこの行を更新してから実行記録を確認し、書き込みます。同じデータベースにつなぐ Runner ノードはこのデータベースロックを共有します。SQLite、PostgreSQL、MySQL は同じ処理を使います。投入や取得を正しく処理するために、表と調整行を保持してください。表を削除するとトランザクションが失敗し、調整行を削除すると直列化の仕組みが崩れます。

<a id="size-and-retention"></a>

## 保持期間と `unknown` が占有する容量

- 実行ノードはデータベース時刻を基準に、最大 128 件ずつ実行記録を削除します。`succeeded`、`failed`、`cancelled` は `updated_at`、照合済みの `unknown` は `reconciled_at` から経過時間を数えます。`retentionMs` の既定値は 7 日で、1 時間から 365 日まで設定できます。子の記録が残る間は親の記録を保持します。 [保持期間の設定](../configuration/runner.ja.md#configuration-fields)
- 実行ノードはポーリング中に削除を行います。1 件以上削除した後は、次の確認まで少なくとも 250 ミリ秒待ちます。削除対象がない場合や失敗した場合は、少なくとも 1 秒待ちます。実際の処理速度はポーリング間隔、データベース、負荷に左右されます。API ノードしか稼働していない間や実行ノードの停止中は、期限切れの記録が残ります。実行ノードの復旧後に順次削除します。
- 実行の削除と同じトランザクションで関連するイベントと追加キーを削除します。その後は `find` の検索結果が空になり、`get` と `events` は `NOT_FOUND` を返します。元の業務冪等キーで送信すると、同じ ID が生成される場合でも新しい実行を開始できます。より長く保持するレポートや業務冪等性の記録はアプリケーションが保存します。
- 待機期限を過ぎると、実行ノードが `queued` を `failed` に更新し、その時刻から保持期間を数えます。`running` が実行期限に達すると停止を要求します。`running`、`cancelling`、未照合の `unknown` は実行容量に計上されます。リース喪失や後処理の未確認で `unknown` になると、照合まで容量と再利用キーを保持します。照合に成功すると `reconciledAt` が記録され、予約が解放されて保持期間が始まります。 [元の実行ノードでの照合](../function/runner.ja.md#reconciliation)

<a id="capacity-limits"></a>

### 容量上限と見積もり

Runner は待機件数、同時実行数、個別のデータ量を制限します。データベースの合計行数とディスク使用量は、処理件数、保持期間、追加キー、削除の滞留に左右されます。Runner はデータベース全体のバイト数を制限しません。未照合の `unknown` は、対応するイベントや追加キーとともに期限なしで残ることがあります。

| 上限 | 対象 |
| --- | --- |
| `maxQueued` | 親を持たないジョブと制御子ジョブで別々に数えます。既定値は各 5000 件です。終了した記録は削除まで残ります。 |
| 投入、出力、各イベント | それぞれ JSON で 512 KiB までです。投入はリクエスト全体、イベントは `context.emit` に渡したデータで計測します。 |
| ジョブごとの全イベント | `maxEvents`（既定値は 10000 件）と 16 MiB の両方が適用されます。総量には保存時の `value` ラッパーも含みます。上限に達すると書き込みが失敗し、ハンドラーが結果に応じて処理します。 |
| 追加冪等キー | 新しいキーを受理するたびに 1 行増え、元の実行とともに削除されます。実行 1 件あたりの追加キー行数に個別の上限はありません。 |

例えば、1 日に 1000 件のジョブが終了し、各ジョブが入力 1 KiB、出力 1 KiB、`value` ラッパー込みで 1 KiB のイベント 10 件を保存するとします。既定の 7 日保持で削除が追いついていれば、実行記録は約 7000 行、イベントは約 7 万行、アプリケーションのデータ量は `7000 × (1 + 1 + 10) KiB ≈ 82 MiB` です。実際の使用量には待機ジョブ、未照合ジョブ、行の管理領域、インデックス、WAL やトランザクションログ、バックアップも影響します。ディスク上の使用量はデータベースの領域回収方法にも左右されます。 [キューとイベントの設定](../configuration/runner.ja.md#configuration-fields)

本番では `hai_runner_executions.event_sequence` と `event_bytes` でジョブごとのイベント書き込み量を確認します。`state` 別の件数、期限切れで残っている最も古い実行、未照合の `unknown`、`Managed execution retention failed` ログを監視します。データベースのサイズ指標で表、インデックス、ログの増加も確認してください。同じリクエストの再試行では同じ業務冪等キーを使うと、追加マッピングが増えるのを防げます。

<a id="ai-sse"></a>

### AI のストリーミングデータが Runner に保存される条件

SSE はクライアントへの転送を担当します。Runner の永続イベントはハンドラーが `context.emit` を呼び出すと作られます。アプリケーションは保存されたイベントを読み、SSE またはポーリングでクライアントに届けます。

| 呼び出し経路 | 永続化の動作 |
| --- | --- |
| `ai.llm.chatStream()` を SSE で直接転送 | 呼び出し元がモデルの分割出力を転送し、Runner の表への書き込みはありません。`objectId`、記録用ストア、永続化設定の条件を満たす場合は、AI が会話をまとめて ChatRecord に保存できます。 [AI の会話記録](ai.ja.md#table-hai-ai-chat-records) |
| Runner 経由の管理対象 ACP | AI はアシスタントの分割テキストを `type: 'text'` イベントにまとめ、`context.emit` を呼び出します。稼働中は通常 50 ミリ秒ごとで、ツール更新時やターンの終了時にも必要に応じて書き込みます。ツールの進捗、承認、成果物参照も保存される場合があります。正常終了時の `output` に返信全文が入ることがあります。クライアントはジョブ ID と連番で保存済みイベントの続きから読めます。 [管理対象 ACP API](../function/ai.ja.md#acp) |
| Runner を使う Tools サービスまたはカスタムハンドラー | 検証済みのツール入力と最終 JSON 出力が実行記録に入り、`context.emit` で送った業務イベントがイベント表に入ります。例えば動画ツールはフェーズと進捗を記録し、認可済み成果物の参照も別に返せます。 [Tools のデータ構造](tools-runner.ja.md) |

例えばカスタムのレポートハンドラーでは、`reading`、`exporting` などのフェーズと必要な進捗だけを保存できます。大きなレポート、音声や動画、長文はアプリケーションの永続ストレージに書き込み、イベントや結果には認可済みの参照を保存します。管理対象 ACP で切断後の再開を使う場合、容量の見積もりにはまとめたテキストイベントと最終出力の両方を含めてください。

ACP の容量を見積もるときは、まず 1 ターンのイベント件数を計測します。60 秒間の出力で平均 50 ミリ秒に 1 件のテキストイベントを書き込むと、1 ターン当たり約 1,200 件です。1 日 1,000 ターンを 7 日間保持すると、このイベントだけで約 840 万行になります。出力の間隔が長ければ件数は減ります。ツールや承認などのイベントは別に見積もります。

<a id="runtime-data"></a>

## ノードの一時領域と実行時オブジェクト

Runner は共有状態を上記のテーブルで読み書きし、独自のキャッシュキーを持ちません。実行中のハンドラー、停止シグナル、コンテナーハンドル、標準ストリームは実行ノードが保持します。レポートの進捗と JSON 結果は `events` と `get` で取得できます。レポートファイルを長期保存する場合は、ハンドラーがアプリケーションの永続ストレージにファイルを書き込み、受付結果には業務上の参照を保存します。

レポートのようなホストジョブでは、実行ノードが Linux のプロセス識別情報を取得できるときに `owner_process_json` を保存します。証明がない場合も状態とイベントは参照できます。ジョブが `unknown` になった場合、ホストリソースの解放には元のプロセスの証明と運用担当者の確認が必要です。 [ホストリソースの照合](../function/runner.ja.md#reconciliation)

コンテナージョブは実行ノードの専用一時ディレクトリも使います。Runner はコンテナーを作成する前に試行の識別子、元のエンジン、一時ディレクトリの識別情報を記録します。完全なコンテナー ID を取得したら、同じ証明に追記します。下記は完全な ID の記録前の `container_json` の抜粋で、識別子とファイルシステムの値は例です。

```json
{
  "attempt": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "engine": "podman",
  "engineKey": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "stageName": "hai-runner-Ab12Cd",
  "stageKey": "2049:123456"
}
```

作成試行だけが記録されている場合、Runner は一時ディレクトリに完全なコンテナー ID が保存されているか確認します。それでも ID が見つからないときは、運用担当者が元のエンジンで作成要求が終了したことを確認してから、試行の識別子でコンテナーの有無を確認します。`attempt` がなく完全な `id` がある保存済みの証明は、元のエンジン、コンテナー ID、一時領域の識別情報で照合できます。

正常な停止時にはコンテナーと一時領域を片付けます。後処理を確認できない `unknown` の記録は容量を占有し続けます。データベースの削除は保持条件を満たした記録が対象です。残っている実リソースは元の実行ノードで先に照合します。 [コンテナーの証明と照合手順](../function/runner.ja.md#reconciliation)
