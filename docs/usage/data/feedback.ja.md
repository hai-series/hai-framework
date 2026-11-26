# @h-ai/feedback データ構造

[简体中文](feedback.md) · [English](feedback.en.md)

[データ構造一覧](README.ja.md) · [設定](../configuration/feedback.ja.md) · [API リファレンス](../function/feedback.ja.md)

ユーザーが問題を送信すると、Feedback は報告、証拠、後続ジョブを保存します。管理者は同じ報告 ID で進捗を確認できます。添付はオブジェクトストレージ、未送信の下書きはブラウザーに保存できます。

<a id="reports"></a>

<a id="database"></a>

## データベース

サービスは報告、関連証拠、必要な作業を一つのトランザクションで保存します。時間は Unix ミリ秒です。特記がなければ任意項目の欠損は NULL です。

モジュールは 6 テーブルを使用します。

| テーブル | 用途 |
| --- | --- |
| [`hai_feedback_reports`](#table-hai-feedback-reports) | 問題票、提出者、処理状況を確認します。 |
| [`hai_feedback_evidence`](#table-hai-feedback-evidence) | 出所と順序で収集済みイベントを確認します。 |
| [`hai_feedback_attachments`](#table-hai-feedback-attachments) | 添付の保存先、状態、完全性を確認します。 |
| [`hai_feedback_history`](#table-hai-feedback-history) | 誰がいつ問題票の状態を変更したか確認します。 |
| [`hai_feedback_jobs`](#table-hai-feedback-jobs) | 証拠収集、通知、出力などの裏側の作業を取得します。 |
| [`hai_feedback_quotas`](#table-hai-feedback-quotas) | 報告数、バイト数、出力回数の上限を確認します。 |

<a id="table-hai-feedback-reports"></a>

### `hai_feedback_reports`

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | 問題票の主キー。 | `feedback-42` |
| `scope_id` | `TEXT` | 不可 | — | 問題票が属する業務範囲。 | `team-1` |
| `user_id` | `TEXT` | 不可 | — | 提出者 ID。 | `user-42` |
| `app_id` | `TEXT` | 不可 | — | 問題票を受け付けたアプリの ID。 | `orders` |
| `number` | `TEXT` | 不可 | — | 利用者とサポート向けの問い合わせ番号。 | `FB-EXAMPLE-42` |
| `app_version` | `TEXT` | 可 | — | 提出時のアプリのバージョン。 | `1.4.2` |
| `summary` | `TEXT` | 不可 | — | 問題の短い説明。 | `Example problem` |
| `submission_key` | `TEXT` | 不可 | — | 安全に再試行するための一意の投稿キー。 | `<submission-key>` |
| `submission_hash` | `TEXT` | 不可 | — | 同じ内容の再試行かを確認するダイジェスト。 | `<request-digest>` |
| `status` | `TEXT` | 不可 | — | 問題票の処理状態。 | `pending` |
| `collection_status` | `TEXT` | 不可 | — | 証拠の収集状態。 | `collecting` |
| `notification_status` | `TEXT` | 不可 | — | 通知の処理状態。 | `pending` |
| `created_at` | `BIGINT` | 不可 | — | 提出時刻。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。 | `1794873600000` |
| `version` | `INTEGER` | 不可 | — | 同時変更を検出する問題票のバージョン。 | `1` |
| `revision` | `INTEGER` | 不可 | — | スナップショットを識別する証拠のリビジョン。 | `2` |
| `evidence_count` | `INTEGER` | 不可 | — | 関連する証拠の件数。 | `1` |
| `evidence_bytes` | `BIGINT` | 不可 | — | 証拠が使用するバイト数。 | `0` |
| `collect_deadline` | `BIGINT` | 不可 | — | 追加の証拠を受け付ける期限。 | `1794873630000` |
| `expires_at` | `BIGINT` | 不可 | — | 問題票の保持期限。 | `1797465600000` |
| `payload` | `JSON` | 不可 | — | 説明、カテゴリ、連絡先、ページ URL、ビルド ID とコミット。状態、バージョン、識別情報、時刻は各列から読み取ります。 | `{"category":"bug"}` |
| `deleting` | `INTEGER` | 不可 | — | 削除処理中は `1`。通常の検索は `0` の行を対象とします。 | `0` |

`(scope_id, created_at)` と `(scope_id, status, created_at)` にインデックスがあります。

提出キーは範囲、ユーザー、アプリ、クライアントの提出 ID から生成します。同じキーで再送されたときは、リクエストのダイジェストで内容を確認します。同じ内容には既存の問題票を返し、内容が変わった場合は競合になります。

処理状態を変更すると `version` が増え、古い状態に基づく同時更新を防ぎます。新しい証拠の一括追加や添付の初回保存確認で `revision` が増えます。出力には両方の値を記録します。

<a id="example-data"></a>


#### 例 · 利用者が提出した問題票

問題内容・提出者・処理状態を持つ中心の票です。

```json
{
  "id": "feedback-42",
  "number": "FB-EXAMPLE-42",
  "scope_id": "team-1",
  "user_id": "user-42",
  "app_id": "orders",
  "summary": "Example problem",
  "status": "pending",
  "collection_status": "collecting",
  "version": 1,
  "revision": 2,
  "evidence_count": 1,
  "created_at": 1794873600000,
  "updated_at": 1794873600000
}
```

受理済みの問題票の抜粋です。`feedback-42` は `team-1` の `user-42` が提出し、処理待ちです。最初の環境情報は受理と同じトランザクションで保存され、証拠の改訂番号は 2 です。追加の資料も受け付けます。

カテゴリは既存の報告の `payload.category` に保存されます。例は `"bug"` です。本人一覧は `scope_id` と `user_id` などで対象を限定します。本人一覧と管理一覧は期限切れや削除中の報告を除外します。データベースの時刻が `expires_at` に達すると詳細、添付、出力も利用できなくなります。

<a id="table-hai-feedback-evidence"></a>

### `hai_feedback_evidence`

報告・出所・順番による証拠の検索と、アプリ・紐付け状態・有効期限による削除に索引を使います。

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | 証拠の主キー。 | `evidence-42` |
| `report_id` | `TEXT` | 可 | — | 関連する問題票 ID。紐付け前は NULL。 | `feedback-42` |
| `scope_id` | `TEXT` | 不可 | — | 証拠が属する業務範囲。 | `team-1` |
| `user_id` | `TEXT` | 不可 | — | 証拠に関連する利用者 ID。 | `user-42` |
| `app_id` | `TEXT` | 不可 | — | 証拠の発生元アプリ ID。 | `orders` |
| `source` | `TEXT` | 不可 | — | 証拠の出所。 | `browser` |
| `sequence` | `BIGINT` | 不可 | — | 同じ出所内でのイベントの順序。 | `1` |
| `kind` | `TEXT` | 不可 | — | 収集したイベントの種類。 | `error` |
| `timestamp` | `BIGINT` | 不可 | — | イベントの発生時刻。 | `1794873600000` |
| `request_id` | `TEXT` | 可 | — | 関連するリクエスト ID。 | `req-42` |
| `error_id` | `TEXT` | 可 | — | 関連するエラー ID。 | `err-42` |
| `revision` | `INTEGER` | 不可 | — | このイベントを含む証拠のリビジョン。 | `3` |
| `bytes` | `INTEGER` | 不可 | — | 証拠のバイト数。 | `24` |
| `expires_at` | `BIGINT` | 不可 | — | 証拠を削除できる時刻。 | `1797465600000` |
| `payload` | `JSON` | 不可 | — | 機微情報を除いたイベント内容。例は抜粋。 | `{"message":"Request failed"}` |

<a id="発生経緯を確認する証拠"></a>

#### 例 · 発生経緯を確認する証拠

ログや画面などを出典と順序付きで票に関連付けます。

```json
{
  "id": "evidence-42",
  "report_id": "feedback-42",
  "scope_id": "team-1",
  "user_id": "user-42",
  "app_id": "orders",
  "sequence": 1,
  "timestamp": 1794873600000,
  "revision": 3,
  "bytes": 24
}
```

feedback-42 の順序1、24バイトの例です。timestamp は発生時刻を Unix ミリ秒で記録します。実際の秘匿済み内容は payload に入ります。

<a id="table-hai-feedback-attachments"></a>

### `hai_feedback_attachments`

`report_id` で添付を検索し、`object_key` でオブジェクトストレージの内容を取得します。

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | 添付の主キー。 | `attachment-42` |
| `client_id` | `TEXT` | 不可 | — | クライアントが指定する添付の ID。 | `client-file-42` |
| `report_id` | `TEXT` | 不可 | — | 所属する問題票の ID。 | `feedback-42` |
| `scope_id` | `TEXT` | 不可 | — | 添付が属する業務範囲。 | `team-1` |
| `object_key` | `TEXT` | 不可 | — | モジュールが生成する非公開ファイルのオブジェクトキー。 | `feedback/<scope-digest>/feedback-42/attachment-42` |
| `status` | `TEXT` | 不可 | — | 添付を取得・出力できるかを示す状態。 | `available` |
| `size` | `BIGINT` | 不可 | — | ファイルのバイト数。 | `5` |
| `checksum` | `TEXT` | 不可 | — | ファイルの完全性確認用ダイジェスト。 | `<checksum:redacted>` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。 | `1794873600000` |
| `payload` | `JSON` | 不可 | — | 画面に表示する添付情報。例は抜粋。 | `{"name":"error.txt"}` |

<a id="添付の保存先と完全性"></a>

#### 例 · 添付の保存先と完全性

大きな本体は保存せず、私有オブジェクトの場所・サイズ・検査値を記録します。

```json
{
  "id": "attachment-42",
  "client_id": "client-file-42",
  "report_id": "feedback-42",
  "scope_id": "team-1",
  "object_key": "feedback/<scope-digest>/feedback-42/attachment-42",
  "size": 5,
  "checksum": "<checksum:redacted>"
}
```

5バイトの添付例です。object_key は公開ダウンロード権ではありません。

<a id="table-hai-feedback-history"></a>

### `hai_feedback_history`

`report_id` で処理履歴を検索します。

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | 対応履歴の主キー。 | `history-42` |
| `report_id` | `TEXT` | 不可 | — | 関連する問題票の ID。 | `feedback-42` |
| `payload` | `JSON` | 不可 | — | 操作した利用者、時刻、変更前後の状態。 | `{"id":"history-42","feedbackId":"feedback-42","userId":"user-42","from":"pending","to":"handled","timestamp":1794873660000}` |

<a id="誰が問題票の状態を変えたか"></a>

#### 例 · 誰が問題票の状態を変えたか

処理時の変更と備考を残して経過を確認します。

```json
{
  "id": "history-42",
  "report_id": "feedback-42",
  "payload": {
    "id": "history-42",
    "feedbackId": "feedback-42",
    "userId": "user-42",
    "from": "pending",
    "to": "handled",
    "timestamp": 1794873660000
  }
}
```

user-42 が pending から handled に変更した例で、時刻は提出時ではなく変更時です。

<a id="jobs"></a>

<a id="table-hai-feedback-jobs"></a>

### `hai_feedback_jobs`

`(app_id, status, next_run_at)` でタスクを取得し、`(report_id, snapshot_revision, snapshot_version)` でスナップショットを検索します。既定のリースは 30 秒で、通常は最大 5 回試行します。

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | ジョブの主キー。 | `job-42` |
| `app_id` | `TEXT` | 不可 | — | ジョブが属するアプリの ID。 | `orders` |
| `snapshot_revision` | `INTEGER` | 可 | — | ジョブが使う証拠のリビジョン。 | `1` |
| `snapshot_version` | `INTEGER` | 可 | — | ジョブが使う問題票のバージョン。 | `1` |
| `report_id` | `TEXT` | 不可 | — | 関連する問題票の ID。 | `feedback-42` |
| `scope_id` | `TEXT` | 不可 | — | ジョブが属する業務範囲。 | `team-1` |
| `kind` | `TEXT` | 不可 | — | 裏側の作業の種類。 | `export` |
| `status` | `TEXT` | 不可 | — | ジョブの待機・実行・終了状態。 | `pending` |
| `token` | `TEXT` | 可 | — | ジョブを取得した処理のトークン。 | `null` |
| `lease_until` | `BIGINT` | 不可 | — | 現在のリース期限。`0` は未取得。 | `0` |
| `attempts` | `INTEGER` | 不可 | — | 引き受けた試行の回数。引き受け後にワーカーが終了した場合も数えます。資料の到着や通知停止時間の終了を待つだけの処理は含みません。 | `0` |
| `next_run_at` | `BIGINT` | 不可 | — | 次に取得できる最も早い時刻。 | `1794873600000` |
| `created_at` | `BIGINT` | 不可 | — | 登録時刻。 | `1794873600000` |
| `updated_at` | `BIGINT` | 不可 | — | 最終更新時刻。 | `1794873600000` |
| `last_error` | `TEXT` | 可 | — | 直近の失敗時のエラー情報。 | `NULL` |
| `payload` | `JSON` | 不可 | — | タスクの入力と進捗。出力は証拠の改訂番号と件数を参照し、問題票、添付のメタデータ、処理履歴を固定します。 | `{}` |
| `result` | `JSON` | 可 | — | ジョブ完了後の結果。 | `NULL` |

出力の登録時に `snapshot_revision`、`snapshot_version` と `payload.evidenceCount` を固定します。タスクは指定された改訂以前の証拠を読み、件数を照合してから ZIP を作成します。期限切れや証拠の欠落がある場合は成功として扱いません。

<a id="提出後に進める裏側の作業"></a>

#### 例 · 提出後に進める裏側の作業

収集・通知・出力などを別処理で進めるための作業記録です。

```json
{
  "id": "job-42",
  "app_id": "orders",
  "report_id": "feedback-42",
  "scope_id": "team-1",
  "attempts": 0,
  "token": null,
  "lease_until": 0,
  "next_run_at": 1794873600000
}
```

job-42 は未試行・未取得で、next_run_at は開始可能時刻であり完了保証ではありません。

<a id="table-hai-feedback-quotas"></a>

### `hai_feedback_quotas`

`(app_id, period)` で使用量を調べます。

| 項目 | 型 | NULL | 既定値 | 用途 | 例 |
| --- | --- | --- | --- | --- | --- |
| `id` | `TEXT` | 不可 | — | クォータ記録の主キー。 | `quota-42` |
| `app_id` | `TEXT` | 不可 | — | 計測対象のアプリ ID。 | `orders` |
| `scope_id` | `TEXT` | 不可 | — | 計測対象の業務範囲。 | `team-1` |
| `user_id` | `TEXT` | 不可 | — | 計測対象の利用者 ID。 | `user-42` |
| `period` | `BIGINT` | 不可 | — | 日次クォータの期間。範囲累計は `0`、単一の問題票は `-1`。 | `0` |
| `report_count` | `BIGINT` | 不可 | — | クォータに計上した問題票数。 | `1` |
| `reserved_bytes` | `BIGINT` | 不可 | — | 予約済みのバイト数。 | `1024` |
| `report_bytes` | `BIGINT` | 不可 | `0` | 問題票一件あたりのバイト上限。 | `0` |
| `export_limit` | `INTEGER` | 不可 | `0` | 問題票一件あたりの出力回数上限。 | `0` |
| `updated_at` | `BIGINT` | 不可 | — | クォータの最終更新時刻。 | `1794873600000` |

<a id="予約済みの問題票容量"></a>

#### 例 · 予約済みの問題票容量

件数・サイズ・出力枠を確認し、無制限の消費を防ぎます。

```json
{
  "id": "quota-42",
  "app_id": "orders",
  "scope_id": "team-1",
  "user_id": "",
  "period": 0,
  "report_count": 1,
  "reserved_bytes": 201326592,
  "report_bytes": 0,
  "export_limit": 0,
  "updated_at": 1794873600000
}
```

`period=0` はアプリ内の範囲ごとの累計で、`user_id` は空文字列です。正の値はデータベースの UTC 日の開始時刻を表し、利用者ごとに計測します。`period=-1` のキーは問題票 ID です。既定で 1 件につき 192 MiB を予約し、期限切れの削除に成功すると範囲の空き容量を戻します。[割り当て設定](../configuration/feedback.ja.md#configuration-fields)

<a id="storage"></a>

<a id="object-storage"></a>

## オブジェクトストレージ

Feedback は Redis キーを作りません。非公開 Storage の `feedback/<範囲の SHA-256 の先頭16桁>/<報告ID>/` に添付 ID、`business/<行ID>-<チェックサム>` または `exports/<タスクID>.zip` を付けます。ZIP には `manifest.json`、報告、証拠、履歴、許可された添付が入ります。エクスポートは既定で 24 時間保持します。

範囲の部分は、サーバーが指定した `scopeId` の UTF-8 バイト列を SHA-256 で計算した先頭 16 桁の 16 進文字です。`team-1` は `7e2a2d5f9a3050f8`、`team-2` は `7774b28c6138ba1a`、`华东/客服` は `6d306a1b1891f5e8` になります。問題票ごとに共通のプレフィックスを使って、タスクがまとめて削除します。ファイルの取得には問題票の権限が必要です。

この範囲の `feedback-42` を出力したときのオブジェクトキーは、たとえば `feedback/7e2a2d5f9a3050f8/feedback-42/exports/<タスク ID>.zip` です。

<a id="browser-storage"></a>

## ブラウザーのストレージ

IndexedDB の `hai-feedback-v1` データベース（版 1）の `drafts` に 2 種類のキーを保存します。下書きの保存を有効にすると、`<scope-key>` はアプリ ID とホストの識別範囲で構成されます。例は `orders:team-1:user-42` です。投稿に成功すると両方を削除します。

| キー | 用途 | 期限 |
| --- | --- | --- |
| `<scope-key>` | 提出待ちの下書き | 24 時間 |
| `<scope-key>:checkpoint` | 問題票を開く前に捕捉した証拠 | 5 分 |

### `<scope-key>`

| 項目 | 型 | 用途 | 例 |
| --- | --- | --- | --- |
| `submissionId` | `string` | この下書きの投稿 ID。 | `submission-42` |
| `anchorTime` | `number` | 問題票開始またはエラー時刻。Unix ミリ秒。 | `1794873600000` |
| `anchorKind` | `string` | 開始の種類。feedback または error。 | `feedback` |
| `errorId` | `string` | 任意の関連エラー ID。 | `err-42` |
| `evidence` | `object[]` | 捕捉済みの証拠。 | `[]` |
| `attachments` | `object[]` | 未送信の添付とバイトデータ。 | `[]` |
| `missing` | `string[]` | 収集できなかった資料。 | `[]` |
| `expiresAt` | `number` | 下書きの期限。Unix ミリ秒。期限切れの読み取り時に削除します。 | `1794960000000` |
| `report` | `object` | サーバーから返された任意の問題票。 | `{…}` |
| `submission` | `object` | 初回の投稿内容。応答を失った場合に同じ内容で再試行します。 | `{…}` |
| `userInputFingerprint` | `string` | 再試行前のフォーム変更を検出するための値。 | `<fingerprint>` |

### `<scope-key>:checkpoint`

| 項目 | 型 | 用途 | 例 |
| --- | --- | --- | --- |
| `evidence` | `object[]` | 問題票フォームを開く前に一時保存した証拠。 | `[]` |
| `expiresAt` | `number` | チェックポイントの期限。Unix ミリ秒。期限内の証拠だけを復元します。 | `1794873900000` |

詳細は[ソースのテーブル定義](../../../packages/feedback/src/feedback-repository.ts)を参照してください。

### 未提出の現場情報を短期保持

画面遷移や再読み込みで現場情報をすぐ失わないための一時保存です。

```json
{
  "evidence": [],
  "expiresAt": 1794873900000
}
```

証拠が空の例で5分後に失効します。サーバーの長期履歴ではありません。
