# @h-ai/feedback 設定

<!-- translation: partial -->

[原文（中国語）](feedback.md) · [データ構造](../data/feedback.ja.md) · [API リファレンス](../function/feedback.ja.md)

フィードバックサービスを `_feedback.yml` で設定します。証跡の収集はサーバーで制御し、アプリ外へ送れる項目を選びます。通知と Webhook は個別に設定します。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notificationMode: console
consoleContent: metadata
```

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `appId`, `appVersion`, `buildId`, `commit` | Required app ID, other values optional | 報告をアプリとビルドに関連付ける。 |
| `notificationMode`, `consoleContent`, `notificationProvider`, `recipients` | `reach`, `metadata`, `email`, `[]` | 通知経路と共有する情報を選択。 |
| `collectionTimeoutMs`, `businessCollectionTimeoutMs` | `60000`, `30000` | 収集期限（ミリ秒）。 |
| `webhookUrl`, `webhookSecret`, `webhookTimeoutMs` | `""`, `""`, `10000` | Webhook の宛先、署名用の秘密値と期限。 |
| `workerIntervalMs`, `leaseMs`, `maxAttempts` | `1000`, `30000`, `5` | ワーカー間隔、リース期間、最大試行回数。 |
| `retentionDays`, `exportRetentionHours`, `maxExportsPerReport` | `30`, `24`, `5` | 報告の保存期間、出力の保存期間、出力件数の上限。 |
| `envAllowlist`, `maxTotalBytes`, `maxAttachmentBytes`, `maxEvidenceBytes`, `maxEvidenceCount` | `[]`, `33554432`, `5242880`, `4194304`, `2000` | 環境変数名の許可リスト、送信サイズと件数の上限。 |

未翻訳：クォータ、証拠、Webhook の再試行、保持期間の項目別設定。[中国語の該当節](feedback.md#configuration-fields)を参照してください。
