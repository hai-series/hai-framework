# @h-ai/audit API リファレンス

<!-- translation: partial -->

[原文（中国語）](audit.md) · [設定](../configuration/audit.ja.md) · [データ構造](../data/audit.ja.md)

<a id="quick-start"></a>

## クイックスタート

サーバーで Audit を初期化します。コンテキストに信頼できる操作主体、リクエスト、リソースの識別子を渡します。業務固有のイベントは明示的に記録し、業務操作は capture で囲みます。

この例ではメモリ上の SQLite を使います。RelDB、Audit の順に初期化し、ログインを 1 件記録します。同じアクション名で検索すると、`logs.items` に記録した行が入ります。終了時は Audit を先に閉じます。開発環境（例: `NODE_ENV=development`）で実行してください。本番モードではノード間で共有するデータベースが必要です。

```ts
import type { HaiResult } from '@h-ai/core'
import { audit } from '@h-ai/audit'
import { reldb } from '@h-ai/reldb'

function dataOrThrow<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

dataOrThrow(await reldb.init({ type: 'sqlite', database: ':memory:' }))

try {
  dataOrThrow(await audit.init())
  try {
    const saved = dataOrThrow(await audit.log({ userId: 'demo-user', action: 'login', resource: 'auth' }))
    const logs = dataOrThrow(await audit.list({ action: 'login', pageSize: 20 }))
    // 新数据库中，查询到的第一条记录就是刚写入的那条。
    if (logs.items[0]?.id !== saved.id)
      throw new Error('Expected the new login event')
  }
  finally {
    dataOrThrow(await audit.close())
  }
}
finally {
  dataOrThrow(await reldb.close())
}
```

<a id="api-reference"></a>

## API 一覧

withContext（コールバックの結果をそのまま返す）以外、出力は HaiResult の成功データです。

| API | 用途 | 入力と既定値 | 出力 | 例 |
| --- | --- | --- | --- | --- |
| `audit.init` | 初期化済み RelDB に監査テーブルを準備 | `config?` | `void` | `await audit.init()` |
| `audit.close` | 借りているサービスは閉じず Audit を終了 | なし | `void` | `await audit.close()` |
| `audit.log` | イベントを保存。呼び出し元のトランザクションも指定可 | `input, tx?` | `AuditLog` | `await audit.log(event)` |
| `audit.capture` | 自動記録ポリシーが許す場合だけ保存 | `input, options?` | `void` | `await audit.capture(event)` |
| `audit.withContext` | 信頼済みの監査情報を付け、コールバックの結果を返す | `context, operation` | `T` | `audit.withContext(trustedContext, () => saveOrder())` |
| `audit.list` | 利用者情報付きで絞り込んだログをページ取得 | `options?` | `PaginatedResult<AuditLogWithUser>` | `await audit.list({ page: 1, pageSize: 20 })` |
| `audit.getUserRecent` | 利用者の直近の活動を取得 | `userId, limit?` | `AuditLog[]` | `await audit.getUserRecent(userId, 10)` |
| `audit.getStats` | 最近の監査活動を集計 | `days?, filters?` | `AuditStatItem[]` | `await audit.getStats(7)` |
| `audit.cleanup` | 保持ポリシーで削除可能なログを削除 | `olderThanDays?` | `number` | `await audit.cleanup(90)` |
| `audit.checkAlerts` | 設定したアラートの時間枠を確認し送信を取得 | `{ signal? }?` | `AuditAlertReport` | `await audit.checkAlerts()` |
| `audit.backup.run` | 非公開 Storage に監査のバックアップを保存 | `options?` | `AuditBackupInfo` | `await audit.backup.run()` |
| `audit.backup.verify` | 保存済み JSON Lines バックアップを検証 | `key, { signal? }?` | `AuditBackupInfo` | `await audit.backup.verify(backupKey)` |
| `audit.helper.login` | ログインを記録 | `userId, ip?, ua?` | `void` | `await audit.helper.login(userId)` |
| `audit.helper.logout` | ログアウトを記録 | `userId, ip?, ua?` | `void` | `await audit.helper.logout(userId)` |
| `audit.helper.register` | 登録を記録 | `userId, ip?, ua?` | `void` | `await audit.helper.register(userId)` |
| `audit.helper.passwordResetRequest` | パスワード再設定の要求を記録 | `email, ip?, ua?` | `void` | `await audit.helper.passwordResetRequest(email)` |
| `audit.helper.passwordResetComplete` | パスワード再設定の完了を記録 | `userId, ip?, ua?` | `void` | `await audit.helper.passwordResetComplete(userId)` |
| `audit.helper.crud` | 業務データの操作を記録 | `input` | `void` | `await audit.helper.crud(event)` |

業務更新と一緒に確定させる監査ログにはトランザクションを渡します。バックアップを取ってもログは削除されません。

未翻訳：保持、アラートのスケジュール、バックアップの例。[中国語の該当節](audit.md#api-reference)を参照してください。
