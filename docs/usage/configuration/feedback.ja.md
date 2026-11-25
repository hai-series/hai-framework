# @h-ai/feedback 設定

<!-- translation: partial -->

[原文（中国語）](feedback.md) · [データ構造](../data/feedback.ja.md) · [API リファレンス](../function/feedback.ja.md)

## 設定の読み込み

フィードバックサービスを `_feedback.yml` で設定します。証跡の収集はサーバーで制御し、アプリ外へ送れる項目を選びます。通知と Webhook は個別に設定します。

## 設定一覧


| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `appId`, `appVersion`, `buildId`, `commit` | Required app ID, other values optional | 報告をアプリとビルドに関連付ける。 |
| `notificationMode`, `consoleContent`, `notificationProvider`, `recipients` | `reach`, `metadata`, `email`, `[]` | 通知経路と共有する情報を選択。 |
| `collectionTimeoutMs`, `businessCollectionTimeoutMs` | `60000`, `30000` | 収集期限（ミリ秒）。 |
| `webhookUrl`, `webhookSecret`, `webhookTimeoutMs` | `""`, `""`, `10000` | Webhook の宛先、署名用の秘密値と期限。 |
| `workerIntervalMs`, `leaseMs`, `maxAttempts` | `1000`, `30000`, `5` | ワーカー間隔、リース期間、引き受けた処理の最大試行回数。引き受け後にワーカーが終了した場合も含みます。削除ジョブは再試行を続けます。 |
| `retentionDays`, `exportRetentionHours`, `maxExportsPerReport` | `30`, `24`, `5` | 報告の保存期間、出力の保存期間、出力件数の上限。報告へのアクセスと出力はデータベースの保持期限で終了し、削除はバックグラウンドで行います。 |
| `envAllowlist`, `maxTotalBytes`, `maxAttachmentBytes`, `maxEvidenceBytes`, `maxEvidenceCount` | `[]`, `33554432`, `5242880`, `4194304`, `2000` | 環境変数名の許可リスト、送信サイズと件数の上限。`maxEvidenceCount` に 1–10000 を指定でき、有効な上限は 2000 件です。サーバー環境と追加収集の容量を確保します。 |

未翻訳：クォータ、証拠、Webhook の再試行、保持期間の項目別設定。[中国語の該当節](feedback.md#configuration-fields)を参照してください。

## 設定例

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notificationMode: console
consoleContent: metadata
```

### 新しいフィードバックを担当者にメールで知らせる

`config/_feedback.yml` に記述します。`email` には、初期化済みで実際に送信できる Reach 通知先の名前を指定します。Console はログに出すだけです。`adminUrl` は通知に載せる管理画面のリンクで、ページやアクセス権を作成するものではありません。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notificationMode: reach
notificationProvider: email
recipients: [support@example.com]
adminUrl: https://admin.example.com/feedback
```

### 添付サイズと保存期間を抑える

添付は 1 件 2 MiB、ユーザーごとの受付は 1 日 10 件に制限します。報告は 7 日、エクスポートした ZIP は 12 時間保存します。`disabled` は通知を止める設定で、報告は保存されます。期限切れのファイルを削除するバックグラウンド処理は稼働させておきます。

```yaml schema=@h-ai/feedback:FeedbackConfigSchema
appId: orders
notificationMode: disabled
maxAttachmentBytes: 2097152
maxReportsPerUserDay: 10
retentionDays: 7
exportRetentionHours: 12
```
