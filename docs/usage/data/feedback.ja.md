# @h-ai/feedback データ構造

<!-- translation: partial -->

[原文（中国語）](feedback.md) · [設定](../configuration/feedback.ja.md) · [API リファレンス](../function/feedback.ja.md)

報告、証跡、ジョブの状態は RelDB、添付と出力のバイト列は Storage が管理します。ID とスコープはサーバーで検証します。

| テーブル・キー・成果物 | 形式と管理元 |
| --- | --- |
| `hai_feedback_reports` | ID、表示番号、アプリと信頼済みの利用者・スコープ、送信キーとハッシュ、処理・収集・通知の状態、版番号、証跡件数、期限とマスク済みデータ。 |
| `hai_feedback_evidence`, `hai_feedback_attachments`, `hai_feedback_history` | 報告・一時スコープの証跡、添付のチェックサム・オブジェクトキー・状態、処理者・時刻・状態の履歴。 |
| `hai_feedback_jobs`, `hai_feedback_quotas` | ジョブのリースと試行記録、利用者・スコープ・報告ごとの上限カウンター。 |

フィールド制約・既定値・保存期間の詳細は[中国語リファレンス](feedback.md)に掲載しています。
