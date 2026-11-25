# @h-ai/audit データ構造

[简体中文](audit.md) · [English](audit.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/audit.ja.md) · [API リファレンス](../function/audit.ja.md)

たとえばユーザーが注文を参照すると、Audit は実行者、対象、結果、時刻を保存します。管理者は条件でイベントを調べ、期間を指定して出力し、保持方針で削除を制限できます。

<a id="tables"></a>

<a id="database"></a>

## データベース

`reldb.init()` で接続し、`audit.init()` で監査テーブルを準備します。

モジュールは 2 テーブルを使用します。

| テーブル | 用途 |
| --- | --- |
| [`hai_audit_logs`](#table-hai-audit-logs) | 誰がいつどの対象に何をしたか確認します。 |
| [`hai_audit_alert_claims`](#table-hai-audit-alert-claims) | 同じルール・宛先・時間枠を一つのインスタンスが取得します。 |

<a id="table-hai-audit-logs"></a>

### `hai_audit_logs`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT`、MySQL `VARCHAR(255)` | 不可 | — | イベントの主キー。Audit が発行する値は `audit_` で始まります。 | `audit_example-42` |
| `user_id` | `TEXT`、MySQL `VARCHAR(256)` | 可 | — | 操作した利用者の ID。 | `user-42` |
| `action` | `TEXT`、MySQL `VARCHAR(256)` | 不可 | — | 実行した操作。 | `read` |
| `resource` | `TEXT`、MySQL `VARCHAR(256)` | 不可 | — | 対象の種類。 | `orders` |
| `resource_id` | `TEXT`、MySQL `VARCHAR(256)` | 可 | — | 対象の ID。 | `order-42` |
| `details` | SQLite `TEXT`、PostgreSQL `JSONB`、MySQL `JSON` | 可 | — | 調査に使う業務の詳細。 | `{"fields":["status"]}` |
| `ip_address` | `TEXT`、MySQL `VARCHAR(256)` | 可 | — | リクエスト元 IP アドレス。 | `192.0.2.10` |
| `user_agent` | `TEXT`、MySQL `VARCHAR(4096)` | 可 | — | クライアントのユーザーエージェント。 | `Example Browser` |
| `category` | `TEXT`、MySQL `VARCHAR(255)` | 不可 | — | システムまたは業務イベントの分類。絞り込みに使用します。 | `business` |
| `outcome` | `TEXT`、MySQL `VARCHAR(255)` | 不可 | — | 操作の成功、失敗、拒否の区別。 | `success` |
| `severity` | `TEXT`、MySQL `VARCHAR(255)` | 不可 | — | イベントの重要度。 | `info` |
| `request_id` | `TEXT`、MySQL `VARCHAR(256)` | 可 | — | 関連するリクエスト ID。 | `req-42` |
| `trace_id` | `TEXT`、MySQL `VARCHAR(256)` | 可 | — | 関連するトレース ID。 | `trace-42` |
| `scope_id` | `TEXT`、MySQL `VARCHAR(256)` | 可 | — | イベントが属する業務範囲。 | `team-1` |
| `actor_snapshot` | SQLite `TEXT`、PostgreSQL `JSONB`、MySQL `JSON` | 可 | — | 操作時点の実行者情報。 | `{"id":"user-42"}` |
| `created_at` | SQLite `INTEGER`、PostgreSQL/MySQL `BIGINT` | 不可 | — | データベースの時計で決まるイベント時刻。単位は Unix ミリ秒。 | `1794873600000` |

`created_at` のインデックスを期間検索と保持期限後の削除に使います。MySQL のログテーブルには `utf8mb4_0900_bin` 照合順序を使います。文字列の絞り込みは、大文字と小文字、アクセント、末尾の空白を区別する完全一致です。

<a id="example-data"></a>

<a id="誰が何をしたか後で確認"></a>

#### 例 · 誰が何をしたか後で確認

重要操作の主体・対象・結果を保存し、後で追跡します。

```json
{
  "id": "audit_example-42",
  "action": "read",
  "resource": "orders",
  "resource_id": "order-42",
  "user_id": "user-42",
  "details": {
    "fields": [
      "status"
    ]
  },
  "created_at": 1794873600000
}
```

`user-42` が `order-42` の `status` を参照したときの保存内容の抜粋です。API は `created_at` を `createdAt: Date` に変換します。この例を `toISOString()` で表示すると `2026-11-17T00:00:00.000Z` です。

範囲とイベントを絞り込むと、`audit.countByOutcome` は成功、失敗、拒否の件数を返します。`{ total: 4, success: 2, failure: 1, denied: 1 }` の形式で返します。既存の監査行を読み取り、ページ番号と並べ替えは集計に影響しません。

<a id="table-hai-audit-alert-claims"></a>

### `hai_audit_alert_claims`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `VARCHAR(64)` | 不可 | — | ルール・宛先・時間枠から計算するダイジェスト。主キー。 | `<claim-digest>` |
| `rule_id` | `VARCHAR(64)` | 不可 | — | アラートルール ID。 | `failed-login` |
| `target_id` | `VARCHAR(64)` | 不可 | — | アラートの通知先 ID。 | `business` |
| `window_start` | `BIGINT` | 不可 | — | アラート時間枠の開始。Unix ミリ秒。 | `1794873600000` |
| `status` | `VARCHAR(16)` | 不可 | — | `claimed` は取得済み、`sending` は送信許可済み、`submitted` はプロバイダー受理済み、`queued` はキュー登録済み、`unknown` は結果の確認待ち。 | `claimed` |
| `queue_id` | `VARCHAR(64)` | 可 | — | キューに入った場合の Reach キュー ID。 | `notification-42` |
| `error_code` | `VARCHAR(128)` | 可 | — | 失敗時の調査用エラーコード。 | `NULL` |

<a id="同じ警告を担当する処理を決める"></a>

#### 例 · 同じ警告を担当する処理を決める

規則・通知先・期間ごとに担当を取得し、重複通知を減らします。

```json
{
  "id": "<claim-digest>",
  "rule_id": "failed-login",
  "target_id": "security",
  "window_start": 1794873600000,
  "status": "claimed"
}
```

failed-login から security 宛の例です。取得済みでも人への配達完了ではありません。

<a id="policy"></a>

### 保持ポリシーとアラートの取得

[保持保護](../configuration/audit.ja.md#audit-retention)を有効にすると、Audit は現在の設定に基づいてトリガーを設定し、保護期間中のイベントの更新、削除、上書きを防ぎます。データベースを共有するインスタンスには同じ設定を使います。アプリのトランザクション内で作成したログは、そのトランザクションとともに確定またはロールバックされます。削除と相対期間の集計では、DB の実行時刻を基準に 1 日を 24 時間として基準時刻を計算します。

アプリの各インスタンスはアラートの取得テーブルを共有します。アラート確認時に、時間枠の開始から 72 時間を超えた `submitted` と `queued` の行を削除します。これは指定できる最大の時間枠である 24 時間の 3 倍で、短い時間枠を使うインスタンスにも適用されます。`claimed`、`sending`、`unknown` は確認用に保持します。配信記録は Reach が管理します。[Reach のデータ構造](reach.ja.md)を参照してください。

<a id="backups"></a>

<a id="object-storage"></a>

## オブジェクトストレージ

Audit は Redis のキーを作りません。バックアップは非公開の Storage オブジェクト `hai-private/audit-backups/<id>.jsonl` です。先頭行に形式・版・対象期限、中間行に各イベント、末尾に件数と SHA-256 を記録します。保持期間はストレージ側で設定します。

### 監査バックアップが含む範囲

先頭行で形式と範囲を示し、その後にイベントと件数・検査値の末尾行が続きます。

```json
{
  "type": "header",
  "format": "hai-audit",
  "version": 1,
  "id": "backup-42",
  "createdAt": "2026-11-17T00:00:00.000Z",
  "cutoff": "2026-11-17T00:00:00.000Z",
  "from": null,
  "requestHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

ここでは先頭行を抜粋しています。`cutoff` は上限、`from: null` は下限がないことを示します。`audit.backup.verify(key)` でイベント行、末尾行の件数、チェックサムを検証できます。
