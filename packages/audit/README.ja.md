# @h-ai/audit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

統一された監査ログモジュールです。`audit` オブジェクトで記録、検索、削除、集計を行い、`@h-ai/reldb` で永続化します。

## クイックスタート

### 依存関係

- `@h-ai/reldb`：監査ログを永続化するデータベース。**audit.init() より先に初期化してください**。

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

## 設定一覧

生成したプロジェクトでは、監査の記録、保持、バックアップ、通知の設定を `config/_audit.yml` に記述します。アプリの起動コードがファイルを読み込み、設定オブジェクトを `audit.init(config)` に渡します。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/audit.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/audit.md)（中国語）を参照してください。

- `audit.init` / `audit.close` / `audit.isInitialized` — 監査サービスの接続と終了
- `audit.withContext` / `audit.log` / `audit.capture` / `audit.helper` — 誰がいつ何をしたかを、同じリクエストを追える番号とともに記録する
- `audit.list` / `audit.getUserRecent` / `audit.getStats` / `audit.cleanup` — 記録と統計の照会、履歴の削除
- `audit.backup` / `audit.schedulerPlan` / `audit.checkAlerts` — 非公開ストレージへバックアップを保存し、定期処理を用意し、通知ルールに一致するかを確認する

## データ構造

監査レコード、フィールド対応、アーカイブ、アラート重複排除については[データ構造](../../docs/usage/data/audit.md)（中国語）を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/audit test
```

ソース例は RelDB を先に初期化し、監査結果と依存関係の逆順による終了結果を確認します。[JSDoc 規約（中国語）](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) を参照してください。

## ライセンス

Apache-2.0
