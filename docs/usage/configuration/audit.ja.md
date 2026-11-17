# @h-ai/audit 設定

<!-- translation: partial -->

[原文（中国語）](audit.md) · [データ構造](../data/audit.ja.md) · [API リファレンス](../function/audit.ja.md)

`_audit.yml` を読み込み、RelDB の後に Audit を初期化します。通知、バックアップ、保存期間の強制はそれぞれ有効にします。監査に必要な操作主体とリソース情報だけを記録します。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
capture:
  enabled: true
  includeReads: false
```

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `capture.enabled`, `capture.includeReads` | `true`, `false` | 既定で書き込み、失敗、拒否を記録。読み取りは任意。 |
| `privacy.enabled`, `privacy.fields` | `true`, `[]` | マスクを有効にし、業務項目を追加。 |
| `retention.enabled`, `retention.minDays` | `false`, `90` | 最小保持日数を任意で強制。 |
| `alerts.enabled`, `maxNotificationsPerCheck`, `rules` | `false`, `100`, `[]` | アラートの有効化と走査ごとの上限。ルールでは操作、重大度、結果、送信先を指定。 |
| `alerts.schedule.enabled`, `cron`, `timezone` | `false`, `* * * * *`, `UTC` | 有効時にアラート確認を定期実行。 |
| `backup.enabled`, `batchSize`, `maxRecordBytes` | `false`, `200`, `1048576` | バックアップの有効化、バッチ件数、レコードの上限バイト数。 |
| `backup.schedule.enabled`, `cron`, `timezone` | `false`, `0 2 * * *`, `UTC` | 有効時にバックアップを定期実行。 |

未翻訳：通知先、バックアップのスケジュール、プライバシーの項目別設定。[中国語の該当節](audit.md#configuration-fields)を参照してください。
