# @h-ai/audit API リファレンス

<!-- translation: partial -->

[原文（中国語）](audit.md) · [設定](../configuration/audit.ja.md) · [データ構造](../data/audit.ja.md)

<a id="quick-start"></a>

サーバーで Audit を初期化します。コンテキストに信頼できる操作主体、リクエスト、リソースの識別子を渡します。業務固有のイベントは明示的に記録し、業務操作は capture で囲みます。

<a id="api-reference"></a>

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `audit.log`, `capture`, `withContext` | イベントの記録、操作の監視、または子処理へのコンテキスト設定。 | `await audit.log(entry)` |
| `audit.list`, `getUserRecent`, `getStats`, `cleanup` | 監査記録と統計の検索、または許可された古い記録の削除。 | `await audit.getUserRecent(userId)` |
| `audit.helper.login`, `logout`, `register`, `passwordResetRequest`, `passwordResetComplete`, `crud` | 認証や一般の業務操作を監査記録に変換。 | `audit.helper.crud(event)` |
| `audit.backup.run`, `backup.verify`, `checkAlerts` | バックアップの実行・検証、または通知ルールの確認。 | `await audit.checkAlerts()` |

追加の設定項目や利用例は[中国語リファレンス](audit.md)に掲載しています。
