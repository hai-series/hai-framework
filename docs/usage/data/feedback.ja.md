# @h-ai/feedback データ構造

[简体中文](feedback.md) · [English](feedback.en.md) · [API リファレンス](../function/feedback.ja.md) · [設定](../configuration/feedback.ja.md)

問題票ごとに提出者と担当者が会話します。提出や返信の本文、添付、状態変更は 1 トランザクションで保存します。時刻は Unix ミリ秒です。必須の値はアプリが設定します。

<a id="database"></a>

## データベース

| テーブル | 用途 |
| --- | --- |
| [`hai_feedback_reports`](#table-hai-feedback-reports) | 最初の投稿と現在の処理状態を保存します。 |
| [`hai_feedback_messages`](#table-hai-feedback-messages) | 返信と追加情報の依頼を保存します。 |
| [`hai_feedback_attachments`](#table-hai-feedback-attachments) | 問題票またはメッセージの添付を保存します。 |

<a id="table-hai-feedback-reports"></a>

### `hai_feedback_reports`

| 列 | 型 | NULL | 用途 |
| --- | --- | --- | --- |
| `id` | `VARCHAR(36)` | 不可 | 呼び出し側が生成する提出 UUID 兼主キー。 |
| `app_id` | `VARCHAR(128)` | 不可 | 問題票を受理したアプリの ID。 |
| `scope_id` | `VARCHAR(128)` | 不可 | 信頼できるコンテキストが指定する業務範囲。 |
| `user_id` | `VARCHAR(128)` | 不可 | 提出者の ID。 |
| `body` | `TEXT` | 不可 | 最初の本文。ファイルのみの場合は空文字列。 |
| `status` | `VARCHAR(24)` | 不可 | `pending` 未処理、`awaiting_user` 利用者の補足待ち、`handled` 処理済み。 |
| `created_at` | `BIGINT` | 不可 | 提出時刻。 |
| `updated_at` | `BIGINT` | 不可 | 最後の返信または状態変更の時刻。 |

主キーは `id` です。一覧はアプリ、範囲、最新の履歴時刻を用い、自分の問題票には利用者 ID の条件を追加します。

<a id="table-hai-feedback-messages"></a>

### `hai_feedback_messages`

| 列 | 型 | NULL | 用途 |
| --- | --- | --- | --- |
| `id` | `VARCHAR(36)` | 不可 | 呼び出し側が生成するメッセージ UUID 兼主キー。 |
| `report_id` | `VARCHAR(36)` | 不可 | 問題票の ID。 |
| `author_id` | `VARCHAR(128)` | 不可 | 送信者の ID。 |
| `author_role` | `VARCHAR(16)` | 不可 | `author` は提出者、`staff` は担当者。 |
| `kind` | `VARCHAR(16)` | 不可 | `reply` は返信、`request_info` は担当者による追加情報の依頼。 |
| `body` | `TEXT` | 不可 | 本文。ファイルのみの場合は空文字列。 |
| `created_at` | `BIGINT` | 不可 | 送信時刻。 |

`report_id` で問題票に関連付け、`(report_id, created_at, id)` でページを取得します。メッセージと付随する状態変更は一緒に確定します。

<a id="table-hai-feedback-attachments"></a>

### `hai_feedback_attachments`

| 列 | 型 | NULL | 用途 |
| --- | --- | --- | --- |
| `id` | `VARCHAR(36)` | 不可 | サーバーが生成した添付の UUID。 |
| `report_id` | `VARCHAR(36)` | 不可 | 問題票の ID。 |
| `message_id` | `VARCHAR(36)` | 可 | メッセージの ID。最初の投稿の添付は NULL。 |
| `kind` | `VARCHAR(24)` | 不可 | 手動の添付は `file` です。最初の投稿の資料は `screenshot`、`browser_logs`、`server_logs`、`replay`、`recording` です。 |
| `name` | `VARCHAR(255)` | 不可 | 表示用ファイル名。 |
| `content_type` | `VARCHAR(128)` | 不可 | 取得時のメディアタイプ。 |
| `size` | `INTEGER` | 不可 | 元のファイルサイズ（バイト）。 |
| `content` | `BLOB` | 不可 | 元のバイナリーデータ。 |

`(report_id, message_id, id)` でメタデータを読みます。ファイルの取得時は問題票の権限を先に確認します。

問題票 `a5f59b38-ef92-47bb-b0a0-b0f9c07f7f93` の最初の添付 `screen.png` の `message_id` は NULL です。担当者が添付した `steps.txt` は追加依頼のメッセージを参照します。両方のファイルに問題票と同じ権限を適用します。

## 添付と保存期間

バイナリーとメタデータは同じリレーショナル DB に保存します。一覧はメタデータを取得し、個別ファイルの取得時だけ Base64 に変換します。SQLite は BLOB、PostgreSQL は BYTEA、MySQL は MEDIUMBLOB を使います。保存期間はアプリの DB ポリシーで管理します。このスキーマは新しい DB で初期化します。
