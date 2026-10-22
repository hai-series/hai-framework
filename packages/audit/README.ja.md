# @h-ai/audit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

## 概要

統一された監査ログモジュールです。`audit` オブジェクトで記録、検索、削除、集計を行い、`@h-ai/reldb` で永続化します。

## 主な機能

- ユーザー操作やセキュリティイベントを記録し、ユーザー・日時・操作で検索。
- ログのページ取得、統計、保存期間に応じた削除。
- 関係データベースに保存し、認証情報を記録前にマスク。

## 使い始める

### 依存関係

- `@h-ai/reldb`：監査ログを永続化するデータベース。**audit.init() より先に初期化してください**。

### 用途

- ユーザー操作の監査（ログイン、ログアウト、登録、パスワードリセットなど）
- CRUD 操作の監査（リソースの作成、参照、更新、削除）
- セキュリティイベントの追跡とコンプライアンス監査
- 運用統計（操作頻度、アクティブユーザーなど）

### クイックスタート

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
await audit.helper.crud({ userId: 'user_1', action: 'create', resource: 'users', resourceId: 'user_2', details: { name: '张三' } })

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

### 初期化設定

```ts
// 默认配置（无需传参）
await audit.init()

// 自定义用户表映射
await audit.init({
  userTable: 'hai_iam_users', // 用户表名（默认 'hai_iam_users'）
  userIdColumn: 'id', // 用户表主键列名（默认 'id'）
  userNameColumn: 'username', // 用户表用户名列名（默认 'username'）
})
```

監査ログは固定の `hai_audit_logs` テーブルに保存され、初期化済みの `@h-ai/reldb` が必要です。

### API 一覧

- `audit.init(config)`：監査モジュールを初期化。
- `audit.log(input)`：監査ログを記録。
- `audit.list(options)`：`PaginatedResult<AuditLogWithUser>`（items/total/page/pageSize、ユーザー名 JOIN）を返します。core がページ入力を正規化し、既定 pageSize は 20 です。返されたメタデータを直接利用してください。
- `audit.getUserRecent(userId, limit)`：ユーザーの最近の操作を取得。
- `audit.cleanup(days)`：古いログを削除。
- `audit.getStats(days)`：操作統計を取得。
- `audit.helper.login/logout/register/...`：記録用ヘルパー。
- `audit.close()`：モジュールを終了。

#### 入力制約

- `audit.log(input)`：`action` / `resource` は空でない文字列で、長さは 256 文字以内。
- `audit.log(input)`：`details` 内の認証情報（`password` / `token` / `secret` など）は永続化前に自動的にマスクされます。メールアドレスと電話番号は既定で元の値を保持します。
- `audit.list(options)`：`startDate` と `endDate` を両方指定する場合は `startDate <= endDate` が必要です。
- `audit.getUserRecent(userId, limit)`：`userId` は空でない文字列。`limit` を指定する場合は正の整数。
- `audit.cleanup(days)`：`days` を指定する場合は 0 以上の整数。
- `audit.getStats(days)`：`days` を指定する場合は 0 以上の整数。

### エラーコード

すべての操作は `HaiResult<T>` を返します。主なエラーコード：

| エラーコード                     | code            | 説明                 |
| -------------------------------- | --------------- | -------------------- |
| `HaiAuditError.LOG_FAILED`       | `hai:audit:001` | 記録に失敗           |
| `HaiAuditError.QUERY_FAILED`     | `hai:audit:002` | 検索に失敗           |
| `HaiAuditError.CLEANUP_FAILED`   | `hai:audit:003` | 削除に失敗           |
| `HaiAuditError.STATS_FAILED`     | `hai:audit:004` | 集計に失敗           |
| `HaiAuditError.INIT_IN_PROGRESS` | `hai:audit:005` | 初期化中             |
| `HaiAuditError.NOT_INITIALIZED`  | `hai:audit:010` | モジュールが未初期化 |
| `HaiAuditError.CONFIG_ERROR`     | `hai:audit:012` | 設定エラー           |

> 注：`audit.close()` も `HaiResult<void>` を返します。`audit.helper.passwordResetRequest()` は既定でメールアドレスを追加マスクせず、そのまま記録します。


`audit.init()` は自動建表とリポジトリーの準備完了を待って成功します。DDL 失敗時は `isInitialized=false` のままで、DB を修正後に再試行できます。独自 JOIN・統計・削除も同じ準備完了を待ちます。初期化中の close は遅れた公開を無効化します。init の HaiResult を確認後に記録・検索し、共有 DB の接続は所有しないため audit の終了後に DB を終了します。

## 開発とテスト

```bash
pnpm --filter @h-ai/audit test
```

## ライセンス

Apache-2.0
