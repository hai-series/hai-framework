# @h-ai/audit API リファレンス

<!-- translation: partial -->

[原文（中国語）](audit.md) · [設定](../configuration/audit.ja.md) · [データ構造](../data/audit.ja.md)

<a id="quick-start"></a>

## クイックスタート

サーバーで Audit を初期化します。コンテキストに信頼できる操作主体、リクエスト、リソースの識別子を渡します。業務固有のイベントは明示的に記録し、業務操作は capture で囲みます。

```ts
import { audit } from '@h-ai/audit'
import { reldb } from '@h-ai/reldb'

// 1. 初始化依赖
await reldb.init({ type: 'sqlite', database: './data.db' })

// 2. 初始化审计模块（自动使用已初始化的 reldb 单例）
const result = await audit.init()
if (!result.success) {
  throw new Error(result.error.message)
}

// 3. 记录审计日志
await audit.log({
  userId: 'user_1',
  action: 'login',
  resource: 'auth',
  ipAddress: '127.0.0.1',
})

// 4. 使用便捷方法
await audit.helper.login('user_1', '127.0.0.1')
await audit.helper.crud({
  userId: 'user_1',
  action: 'create',
  resource: 'users',
  resourceId: 'user_2',
  details: { name: '张三' }
})

// 5. 查询日志
const logs = await audit.list({ pageSize: 20, action: 'login' })

// 6. 获取统计
const stats = await audit.getStats(7) // 最近 7 天

// 7. 清理旧日志
await audit.cleanup(90) // 清理 90 天前的日志

// 8. 关闭
const closeResult = await audit.close()
if (!closeResult.success) {
  throw new Error(closeResult.error.message)
}
```

<a id="api-reference"></a>

## API 一覧

| API | 入力と結果 | 例 |
| --- | --- | --- |
| `audit.log`, `capture`, `withContext` | イベントの記録、操作の監視、または子処理へのコンテキスト設定。 | `await audit.log(entry)` |
| `audit.list`, `getUserRecent`, `getStats`, `cleanup` | 監査記録と統計の検索、または許可された古い記録の削除。 | `await audit.getUserRecent(userId)` |
| `audit.helper.login`, `logout`, `register`, `passwordResetRequest`, `passwordResetComplete`, `crud` | 認証や一般の業務操作を監査記録に変換。 | `audit.helper.crud(event)` |
| `audit.backup.run`, `backup.verify`, `checkAlerts` | バックアップの実行・検証、または通知ルールの確認。 | `await audit.checkAlerts()` |

追加の設定項目や利用例は[中国語リファレンス](audit.md)に掲載しています。
