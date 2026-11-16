# @h-ai/iam

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/audit](../audit/README.ja.md) · [@h-ai/cache](../cache/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/crypto](../crypto/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md) · [@h-ai/reach](../reach/README.ja.md)

共通の `iam` オブジェクトで認証、セッション、認可、ユーザー管理を提供する Identity and Access Management モジュールです。

## クイックスタート

### インストール

```bash
pnpm add @h-ai/iam
```

### 依存関係

- `@h-ai/reldb`：ユーザー・ロール・権限の永続化。**iam.init() より先に初期化**。
- `@h-ai/cache`：セッション・OTP・一度限りのチケット。**iam.init() より先に初期化**。
- `@h-ai/crypto`：内部で使用するパスワードハッシュ。自動初期化。
- `@h-ai/audit`：ホストが初期化した場合に IAM の安全イベントを自動記録します。未使用時は収集せず、使用中の書込失敗は記録し、外部トランザクションはロールバックします。

- `@h-ai/reach`：**任意**。アプリがインストール、初期化、注入して通知テンプレートを使用します。独自送信コールバックでは不要です。
- `ldapts`：**任意**。LDAP を明示的に有効化し、`ldapClientFactory` がない場合だけ読み込みます。

```ts
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'

// 基础密码认证不需要安装 Reach 或 ldapts。
async function example() {
  try {
    const db = await reldb.init({ type: 'sqlite', database: './data.db' })
    if (!db.success)
      return db
    const cached = await cache.init({ type: 'memory' })
    if (!cached.success)
      return cached
    const initialized = await iam.init({})
    if (!initialized.success)
      return initialized
    const registered = await iam.user.register({ username: 'demo', password: 'Password123' })
    if (!registered.success)
      return registered
    const login = await iam.auth.login({ identifier: 'demo', password: 'Password123' })
    if (!login.success)
      return login
    return await iam.auth.verifyToken(login.data.tokens.accessToken)
  }
  finally {
    // 应用关闭时按依赖的反向顺序释放。
    await iam.close()
    await cache.close()
    await reldb.close()
  }
}

const result = await example()
if (!result.success)
  core.logger.error('Authentication example failed', { code: result.error.code })
```

LDAP は既定で無効です。公開 OTP は `otp` 設定と送信コールバック、パスワードリセットは通知コールバックが必要です。

`iam.config` は**機密情報をマスクした設定スナップショット**を返します。LDAP の `url` / `bindPassword` などは自動的に非表示になります。状態確認用で、元の設定の代わりにはなりません。

## 設定一覧

生成プロジェクトは `config/_iam.yml` を使用します。アプリで設定を取り込む入口は `iam.init(config)` です。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/iam.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/iam.md)（中国語）を参照してください。

- `init` / `close` / `config` / `isInitialized` / `publicConfig` / `getPublicConfig` / `isRegisterEnabled` — ID サービスを初期化し、公開可能な設定と登録情報を提供
- `auth` / `user` / `session` — 認証、アカウントとセッションの管理
- `authz` / `apiKey` / `ticket` — 権限の評価、API キーとワンタイムチケットの管理

## データ構造

アカウント、ロール、権限、セッション、ワンタイム認証情報については[データ構造](../../docs/usage/data/iam.md)（中国語）を参照してください。

## 開発とテスト

公開例は `@h-ai/iam` を使用し、既定値を省略できる `IamConfigInput` と解析済み `IamConfig` を区別します。依存を先に初期化し、`HaiResult.success` を確認し、会話更新には読取時の `version`、通知には永続的な冪等キーを使います。「模块内部上下文」の戦略・倉庫例はアプリ向け深い import の契約ではありません。チェッカーは型だけを確認し、Redis/DB・LDAP・配送の動作には対応する統合テストが必要です。[JSDoc 規約](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)も参照してください。

```bash
pnpm --filter @h-ai/iam typecheck
pnpm --filter @h-ai/iam lint
pnpm --filter @h-ai/iam build
pnpm --filter @h-ai/iam test
node scripts/check-module-jsdoc.mjs --package iam
```

## ライセンス

Apache-2.0
