# @h-ai/feedback データ構造

<!-- translation: partial -->

[原文（中国語）](feedback.md) · [設定](../configuration/feedback.ja.md) · [API リファレンス](../function/feedback.ja.md)

<a id="reports"></a>

## 報告と関連するテーブル

サービスは報告、関連証拠、必要な作業を一つのトランザクションで保存します。時間は Unix ミリ秒です。特記がなければ任意項目の欠損は NULL です。

### `hai_feedback_reports`

| フィールドまたはテーブル | 構造と意味 |
| --- | --- |
| `id`, `number`, `scope_id`, `user_id`, `app_id` | テキストの主キー、表示番号、サーバーで決めた範囲、利用者とアプリ。 |
| `app_version`, `summary`, `payload` | 任意のアプリ版、摘要（未指定時は空文字列）、投稿内容の JSON。 |
| `submission_key`, `submission_hash` | 一意の投稿キーと内容のダイジェスト。同じ投稿を再試行するときは元の内容と一致させます。 |
| `status`, `collection_status`, `notification_status` | 処理、収集、通知の状態。登録時は `pending`、`collecting`、通知設定に応じた値です。 |
| `version`, `revision`, `evidence_count`, `evidence_bytes`, `deleting` | 版とリビジョンは 1 から、証拠件数・バイト数・削除フラグは 0 から始まります。 |
| `created_at`, `updated_at`, `collect_deadline`, `expires_at` | 作成・更新時刻、収集期限、保持期限。報告は既定で 30 日保持します。 |

`(scope_id, created_at)` と `(scope_id, status, created_at)` にインデックスがあります。

<a id="jobs"></a>

## 証拠・添付・タスク

| フィールドまたはテーブル | 構造と意味 |
| --- | --- |
| `hai_feedback_evidence` | 主キー `id`、未紐付け時に NULL の `report_id`。範囲・利用者・アプリは `scope_id`、`user_id`、`app_id`。出所、順番、種類、時刻は `source`、`sequence`、`kind`、`timestamp`。`request_id` と `error_id` は NULL 可。`revision`、`bytes`、`expires_at` は版・サイズ・期限、JSON `payload` はマスク済みです。 |
| `hai_feedback_attachments` | 主キー `id`、クライアント ID `client_id`、`report_id` / `scope_id`、非公開 `object_key`、`status`、`size`、`checksum`、`updated_at`、表示用 JSON `payload`。 |
| `hai_feedback_history` | 主キー `id`、`report_id` と、操作者・日時・状態遷移を保存した JSON `payload`。 |
| `hai_feedback_jobs` | 主キー `id`、`app_id`、`report_id`、`scope_id`、任意の `snapshot_revision` / `snapshot_version`、`kind`、`status`、NULL 可の担当 `token` と `last_error`。`lease_until`、`attempts`、`next_run_at`、`created_at`、`updated_at` で進捗を管理します。JSON の `payload` は必須で `result` は NULL 可。 |
| `hai_feedback_quotas` | 主キー `id`、`app_id`、`scope_id`、`user_id`、`period`（日ごと、範囲は 0、報告単体は -1）、`report_count`、`reserved_bytes`、`report_bytes` と `export_limit`（両方の SQL 既定値は 0）、`updated_at`。 |

証拠は報告・出所・順番を索引にし、削除用にアプリ・紐付けの有無・期限でも検索します。添付と履歴は `report_id` が索引です。タスクの取得は `(app_id, status, next_run_at)`、スナップショットの検索は `(report_id, snapshot_revision, snapshot_version)` を使います。クォータの索引は `(app_id, period)`。リースは既定で 30 秒、通常の試行は最大 5 回です。

<a id="storage"></a>

## オブジェクトキーとブラウザーの下書き

Feedback は Redis キーを作りません。非公開 Storage の `feedback/<範囲の SHA-256 の先頭16桁>/<報告ID>/` に添付 ID、`business/<行ID>-<チェックサム>` または `exports/<タスクID>.zip` を付けます。ZIP には `manifest.json`、報告、証拠、履歴、許可された添付が入ります。エクスポートは既定で 24 時間保持します。

ブラウザーは IndexedDB データベース `hai-feedback-v1`（版 1）のストア `drafts` に、アプリと利用者ごとに下書きを一件保存します。別キー `<範囲キー>:checkpoint` には `evidence` と `expiresAt` を保存し、5 分間有効です。期限内だけ復元し、投稿成功後に下書きとチェックポイントを削除します。

未翻訳のデータベース型と制約は、[中国語の原文](feedback.md)および[ソースのテーブル定義](../../../packages/feedback/src/feedback-repository.ts)を参照してください。
