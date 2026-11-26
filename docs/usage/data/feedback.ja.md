# @h-ai/feedback データ構造

[简体中文](feedback.md) · [English](feedback.en.md) · [API リファレンス](../function/feedback.ja.md) · [設定](../configuration/feedback.ja.md)

利用者が「注文の詳細を開けない」と録画を添えて投稿すると、状態は投稿テーブルに、動画のバイト列は添付テーブルに保存されます。担当者は同じ投稿に情報の追加を依頼し、手順ファイルを添付できます。依頼はメッセージテーブルに入り、手順ファイルはそのメッセージに関連付きます。投稿者と担当者は権限の範囲で同じレコードを参照します。

<a id="database"></a>

## データベース

Feedback の初期化時に、ホストが接続済みのリレーショナルデータベースに次の 3 テーブルとインデックスを作成します。時刻は Unix ミリ秒です。列の既定値が「なし」の場合、DDL に既定値の宣言はなく、アプリが実際の値か許可されたヌルを渡します。

| テーブル | 1 行の内容 | 書き込むとき |
| --- | --- | --- |
| [`hai_feedback_reports`](#table-hai-feedback-reports) | 初回投稿と現在の状態 | 投稿時に作成し、メッセージの送信や状態の変更で最終更新時刻を更新します。 |
| [`hai_feedback_messages`](#table-hai-feedback-messages) | 返信または情報追加の依頼 | 投稿者または担当者がメッセージを送信したとき。 |
| [`hai_feedback_attachments`](#table-hai-feedback-attachments) | 資料または手動添付ファイルのメタデータとバイト列 | 初回投稿またはメッセージと一緒に保存するとき。 |

<a id="table-hai-feedback-reports"></a>

### `hai_feedback_reports`

| フィールド | 型 | NULL 許可 | DB の既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `VARCHAR(36)` | いいえ | なし | 呼び出し側が送信用に発行する UUID。投稿の主キー。 | `a5f59b38-ef92-47bb-b0a0-b0f9c07f7f93` |
| `app_id` | `VARCHAR(128)` | いいえ | なし | Feedback インスタンスの `appId`。 | `orders` |
| `scope_id` | `VARCHAR(128)` | いいえ | なし | 信頼できるコンテキストの業務スコープ。 | `sales-cn` |
| `user_id` | `VARCHAR(128)` | いいえ | なし | 投稿者 ID。自分のフィードバックの取得に使用します。 | `user-42` |
| `body` | `TEXT` | いいえ | なし | 初回投稿の本文。資料だけを送る場合は空文字を使えます。 | `注文の詳細を開けません` |
| `status` | `VARCHAR(24)` | いいえ | なし | 現在の状態。初回は `pending` を書き込みます。 | `awaiting_user` |
| `created_at` | `BIGINT` | いいえ | なし | 投稿時刻。 | `1795500000000` |
| `updated_at` | `BIGINT` | いいえ | なし | 初回は作成時刻と同じ値を使用し、その後はメッセージや状態変更の時刻を記録します。 | `1795500300000` |

処理用一覧では `(app_id, scope_id, updated_at, id)` の `hai_feedback_reports_activity` インデックスを使います。投稿者の一覧用の `hai_feedback_reports_author` の列は `(app_id, scope_id, user_id, updated_at, id)` です。一覧は最終更新時刻の降順で、同時刻では ID の降順です。

| `status` | 意味 | 設定されるとき |
| --- | --- | --- |
| `pending` | 未処理 | 新規投稿時、情報待ちの投稿に投稿者が返信したとき、担当者が未処理にしたとき。 |
| `awaiting_user` | 利用者の補足待ち | 担当者が情報の追加を依頼したとき。 |
| `handled` | 処理済み | 担当者が処理済みにしたとき。 |

<a id="table-hai-feedback-messages"></a>

### `hai_feedback_messages`

| フィールド | 型 | NULL 許可 | DB の既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `VARCHAR(36)` | いいえ | なし | 呼び出し側が発行する `messageId`。メッセージの主キー。 | `deed074b-1ef4-4a47-9adf-731349dd1c56` |
| `report_id` | `VARCHAR(36)` | いいえ | なし | 投稿を指す外部キー。 | `a5f59b38-ef92-47bb-b0a0-b0f9c07f7f93` |
| `author_id` | `VARCHAR(128)` | いいえ | なし | メッセージ送信者の利用者 ID。 | `operator-7` |
| `author_role` | `VARCHAR(16)` | いいえ | なし | 投稿者の返信は `author`、担当者として送る場合は `staff`。 | `staff` |
| `kind` | `VARCHAR(16)` | いいえ | なし | `reply` は返信、`request_info` は情報追加の依頼。 | `request_info` |
| `body` | `TEXT` | いいえ | なし | メッセージ本文。添付だけを送る場合は空文字を使えます。 | `添付の手順で操作し、エラーの画面を送ってください` |
| `created_at` | `BIGINT` | いいえ | なし | 送信時刻。 | `1795500300000` |

`(report_id, created_at, id)` の `hai_feedback_messages_report` インデックスを使用し、会話は新しいメッセージから取得します。担当者が状態を変えると投稿行を更新し、やり取りは個別のメッセージ行として保存します。

<a id="table-hai-feedback-attachments"></a>

### `hai_feedback_attachments`

| フィールド | 型 | NULL 許可 | DB の既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `VARCHAR(36)` | いいえ | なし | サーバーが発行する添付ファイルの UUID。主キー。 | `0ed0398d-475d-47bc-b769-d1eddcd820c4` |
| `report_id` | `VARCHAR(36)` | いいえ | なし | 添付先の投稿を示します。 | `a5f59b38-ef92-47bb-b0a0-b0f9c07f7f93` |
| `message_id` | `VARCHAR(36)` | はい | なし | 初回投稿に添付するときは `NULL`、メッセージに添付するときはそのメッセージを指す外部キー。 | `deed074b-1ef4-4a47-9adf-731349dd1c56` |
| `kind` | `VARCHAR(24)` | いいえ | なし | 手動添付または初回投稿の資料の種類。 | `file` |
| `name` | `VARCHAR(255)` | いいえ | なし | 表示やダウンロードに使うファイル名。 | `steps.txt` |
| `content_type` | `VARCHAR(128)` | いいえ | なし | 検証後に返すメディアタイプ。 | `application/octet-stream` |
| `size` | `INTEGER` | いいえ | なし | ファイルの元のバイト数。 | `5` |
| `content` | SQLite は `BLOB`、PostgreSQL は `BYTEA`、MySQL は `MEDIUMBLOB` | いいえ | なし | ファイルのバイナリデータ。 | UTF-8 文字列 `Steps` の 5 バイト |

`(report_id, message_id, id)` の `hai_feedback_attachments_message` インデックスで初回投稿や会話の添付メタデータを取得します。ファイルを取得する前にアプリ、スコープ、投稿へのアクセス権を確認し、投稿 ID と添付 ID で読み込みます。プレビュー可能な型として判別できない手動添付は `application/octet-stream` でダウンロードできます。

<a id="attachment-examples"></a>

#### 資料の分類とレコード例

| `kind` | 収集元 | ファイル名の例 | 添付先 |
| --- | --- | --- | --- |
| `file` | 送信者が手動で選んだ画像やファイル | `steps.txt` | 初回投稿またはメッセージ |
| `screenshot` | ダイアログを開いたとき、または再撮影で取得したスクリーンショット | `screenshot.png` | 初回投稿 |
| `browser_logs` | ダイアログを開いた時点で確定したブラウザーログ | `browser-logs.json` | 初回投稿 |
| `server_logs` | 送信時に投稿者とスコープで選んだ Core ログ | `server-logs.json` | 初回投稿 |
| `replay` | マスキング済みの操作リプレイイベント | `operation-replay.json` | 初回投稿 |
| `recording` | 利用者が許可した短い画面録画 | `recording-1795500000000.webm` | 初回投稿 |

上の例では、録画の `report_id` が投稿を指し、`message_id` は `NULL` です。担当者は `request_info` のメッセージに `steps.txt` を添付するので、この手順ファイルの `message_id` は `deed074b-1ef4-4a47-9adf-731349dd1c56` です。依頼を送信すると投稿の状態は `awaiting_user` になります。投稿者が画面の画像を添付して `reply` を送ると、画像は `kind: file` としてその返信に関連付き、投稿は `pending` に戻ります。

<a id="storage-and-reads"></a>

## 書き込みと読み込み

初回投稿では、投稿行と添付ファイルを一つのデータベーストランザクションで保存します。メッセージの送信では、メッセージ、添付ファイル、投稿の状態、最終更新時刻を一つのトランザクションで保存します。応答を受け取れなかった場合に保存済みのレコードを取得できるよう、呼び出し側で操作の UUID を保持します。再試行では元のレコードが返ります。編集した本文や添付を送る場合は、新しい操作 ID を使います。

一覧では投稿の概要を返します。`get` は投稿と初回添付のメタデータ、`listMessages` はメッセージと各添付のメタデータを返します。メタデータには `id`、`kind`、`name`、`contentType`、`size` が含まれます。`getAttachment` で一つのファイルのバイナリデータを取得し、Base64 に変換します。次は手順ファイルの取得に成功したときの `data` です。`U3RlcHM=` をデコードすると `Steps` になります。

```json
{
  "name": "steps.txt",
  "contentType": "application/octet-stream",
  "dataBase64": "U3RlcHM="
}
```

<a id="retention"></a>

## 実行時データと保持

| データ | 保存先 | 参照できる範囲 |
| --- | --- | --- |
| フィードバックを開く前のブラウザーログと操作イベント | ログイン状態の現在のページ内メモリ | 既定ではページのセッション中に最大 5 分前までの取得済みデータを保持します。再読み込みやログアウトでバッファーが新しくなります。 |
| 関連付け可能なサーバーのリクエストログ | 現在のサーバープロセスのメモリ | 既定ではインスタンス全体で最大 5000 件、4 MiB を保持します。初回投稿への添付では、同じユーザーと業務スコープに絞り込み、`capture` で指定した期間、件数、バイト数を適用します。プロセスを再起動するとバッファーは空になります。 |
| 送信済みの初回投稿、メッセージ、ファイル | 上記の 3 つのリレーショナルテーブル | 送信成功後に取得できます。`retention.days` に従って保存されます。 |

添付のバイト列はデータベースに置くため、オブジェクトストレージの設定は不要です。既定では無期限です。`retention.days` が正の場合は `updated_at` を起点とし、未処理、利用者の補足待ち、処理済みのいずれにも適用します。期限を過ぎると一覧、詳細、メッセージ、添付を取得できなくなります。起動時と毎時、サービスは `(app_id, updated_at, id)` の `hai_feedback_reports_retention` インデックスを使用して、このアプリの期限切れ投稿を分割して削除します。メッセージと添付も連動して削除されます。

[フィードバックの運用](../operations/feedback.ja.md)
