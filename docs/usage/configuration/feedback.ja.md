# @h-ai/feedback 設定

[简体中文](feedback.md) · [English](feedback.en.md)

[設定ガイド](README.ja.md) · [データ構造](../data/feedback.ja.md) · [API リファレンス](../function/feedback.ja.md)

## 設定の入口

アプリは起動時に `config/_feedback.yml` を読み、`feedback.init(config, options)` に渡します。設定を変更したらアプリを再起動します。環境変数の名前は設定のパスに対応します。たとえば `notification.mode` は `HAI_FEEDBACK_NOTIFICATION_MODE`、`limits.maxTotalBytes` は `HAI_FEEDBACK_LIMITS_MAXTOTALBYTES` です。[設定の優先順位](runtime.md#配置从哪里来)

<a id="configuration-fields"></a>

## 設定一覧

### 基本設定

生成したプロジェクトは `console` を明示的に指定します。問題票を送信し、サーバーログに番号が出ることを確認してください。

| パス | 既定値と制約 | 用途 |
| --- | --- | --- |
| `appId` | 必須、1–128 文字 | ブラウザーと API のアプリ ID に合わせます。 |
| `notification.mode` | `reach`。ほかに `disabled`、`console` | 通知停止、サーバーログ出力、Reach 配信を選びます。 |
| `retention.days` | 30、1–3650 日 | 期限切れ後はアクセスと出力を停止し、タスクが証拠とオブジェクトを削除します。 |

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notification:
  mode: console
```

### オプション機能

| パス | 既定値と制約 | 用途 |
| --- | --- | --- |
| `notification.consoleContent` | `metadata` または `summary` | 識別情報を記録します。`summary` を選ぶとマスク済みの要約を追加します。 |
| `notification.recipients` | `[]`、最大 20 件、各 1–320 文字 | Reach では 1 件以上が必要です。配信先はプロバイダーが検証します。 |
| `notification.provider` | `email`、空でない文字列 | 初期化済みの Reach プロバイダー名です。 |
| `notification.adminUrl` | 省略可、HTTP(S) URL | 通知と Webhook に含める管理画面リンクです。 |
| `webhook.url` | 空文字列、最大 2048 文字 | 信頼できる HTTP(S) 宛先を設定すると配信します。URL の認証情報とフラグメントは拒否します。 |
| `webhook.secret` | 空文字列、最大 4096 文字 | サーバー専用の `HAI_FEEDBACK_WEBHOOK_SECRET` で署名キーを渡します。 |
| `collection.envAllowlist` | `[]`、最大 100 件、各 1–128 文字 | 収集を許可するサーバー環境変数名です。機密名は引き続き除外します。 |
| `build.appVersion`、`build.buildId`、`build.commit` | 省略可、各最大 128 文字 | アプリのバージョン、ビルド識別子、ソースのコミットです。生成プロジェクトには実際のビルド情報が入ります。 |

担当者にメールを送るには、`email` という Reach プロバイダーを初期化し、問題票を送信して配信とリンクを確認します。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notification:
  mode: reach
  provider: email
  recipients: [support@example.com]
  adminUrl: https://admin.example.com/feedback
```

業務証拠の収集関数は `feedback.init(config, { collectEvidence })` で登録します。Webhook の受信側はイベント ID で受信を追跡できます。[業務収集と Webhook](../function/feedback.ja.md#service)

### 運用調整

| パス | 既定値と制約 | 用途 |
| --- | --- | --- |
| `limits.maxTotalBytes` | 32 MiB、4–40 MiB をバイトで指定 | 非圧縮出力の予算です。添付と暗号化通信の上限に反映します。 |
| `limits.maxAttachmentBytes` | 5 MiB、1 バイト–5 MiB | 1 添付の上限です。合計予算も適用します。 |
| `limits.maxEvidenceBytes` | 4 MiB、1024 バイト–4 MiB | 1 問題票の証拠合計サイズです。 |
| `limits.maxEvidenceCount` | 2000、1–10000 | 実際の上限は 2000 件です。サーバー環境と追加収集の容量を確保します。 |
| `limits.maxReportsPerUserDay` | 20、1–10000 件 | データベースの UTC 日、アプリ、範囲、ユーザーごとに受理を数えます。再送は 1 回分です。 |
| `limits.maxBytesPerUserDay` | 2 GiB、4 MiB–1 TiB をバイトで指定 | ユーザーの日次予約枠です。問題票と過去の出力を含みます。 |
| `limits.maxStoredBytesPerScope` | 10 GiB、4 MiB–1 TiB をバイトで指定 | アプリ内の範囲ごとの予約枠です。期限切れの問題票を削除すると空きを戻します。 |
| `limits.maxExportsPerReport` | 5、1–20 回 | 1 問題票の出力上限です。有効なスナップショットの再利用は追加で数えません。 |
| `retention.exportHours` | 24、1–720 時間 | 期限後は ZIP の取得を停止し、タスクが削除します。 |
| `collection.timeoutMs` | 60000、0–300000 ms | ブラウザーからの証拠追加を待つ時間です。 |
| `collection.businessTimeoutMs` | 30000、1–300000 ms | 1 回の業務収集コールバックの制限時間です。 |
| `webhook.timeoutMs` | 10000、1–60000 ms | 1 回の Webhook の制限時間です。失敗は再試行します。 |
| `worker.intervalMs` | 1000、0–60000 ms | タスク確認間隔です。0 の場合は `feedback.runJobs()` を明示的に呼びます。 |
| `worker.leaseMs` | 30000、1000–300000 ms | 別のワーカーが引き継ぐまでのリース期間です。 |
| `worker.maxAttempts` | 5、1–20 回 | 通常タスクの取得上限です。途中終了も含み、期限切れの削除は再試行を続けます。 |

1 問題票に `limits.maxTotalBytes × (1 + limits.maxExportsPerReport)` を予約します。既定では 192 MiB ずつ予約するため、日次の 2 GiB 枠で受理できるのは 10 件です。変更後は添付付きの問題票を送信して ZIP を出力し、アプリとプロキシの上限を確認します。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notification:
  mode: disabled
retention:
  days: 7
  exportHours: 12
limits:
  maxAttachmentBytes: 2097152
  maxReportsPerUserDay: 10
```

[フィードバックの運用](../operations/feedback.md)
