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

<a id="api-一覧"></a>

<a id="api-reference"></a>

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

モジュールの import は入門例と同じです。開始・終了の例以外は初期化成功後、終了前に実行します。value は HaiResult.success を確認し元エラーを保持します。独立したテストデータと明示した後片付けを使います。

```ts
import type { HaiResult } from '@h-ai/core'

function value<T>(result: HaiResult<T>): T {
  if (!result.success)
    throw new Error(result.error.message, { cause: result.error })
  return result.data
}
```

<a id="lifecycle"></a>

### 監査サービスの準備：`audit`

監査記録を保存する RelDB を先に接続し、逆順に終了します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `audit.init` | 初期化済み RelDB に監査テーブルを準備 | `config?`（省略时使用默认配置） | `void` | `await audit.init()` |
| `audit.close` | 借りているサービスは閉じず Audit を終了 | RelDB 由应用关闭；无 | `void` | `await audit.close()` |
| `audit.isInitialized` | 監査サービスの準備状態を確認 | 読み取り専用プロパティ、引数なし | `boolean` | `audit.isInitialized` |

#### 利用例：監査サービスの準備

```ts
value(await audit.init()) // undefined; audit tables are ready
audit.isInitialized // true
value(await audit.close()) // undefined; the borrowed RelDB remains open
```

入力省略時は既定の監査設定です。続行前に再初期化します。借用したデータベースは閉じません。

withContext（コールバックの結果をそのまま返す）以外、出力は HaiResult の成功データです。

業務更新と一緒に確定させる監査ログにはトランザクションを渡します。バックアップを取ってもログは削除されません。

未翻訳：保持、アラートのスケジュール、バックアップの例。[中国語の該当節](audit.md#api-reference)を参照してください。

[引数と手順の詳細](audit.md#lifecycle)

<a id="events"></a>

### 操作と主体の記録：`audit.log`・`audit.helper`

サーバーで確認した利用者と要求番号で記録します。認証や CRUD のよくある操作には helper を使えます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `audit.log` | 監査イベントを保存 | input, tx | `AuditLog` | `await audit.log(event)` |
| `audit.capture` | 自動収集方針に従って記録 | input, options | `void` | `await audit.capture(event)` |
| `audit.withContext` | 信頼済みの操作主体とリクエストを関連付け | context, operation | `T` | `audit.withContext(trustedContext, () => saveOrder())` |
| `audit.helper.login` | ログインを記録 | userId, ip, ua | `void` | `await audit.helper.login(userId)` |
| `audit.helper.logout` | ログアウトを記録 | userId, ip, ua | `void` | `await audit.helper.logout(userId)` |
| `audit.helper.register` | 登録を記録 | userId, ip, ua | `void` | `await audit.helper.register(userId)` |
| `audit.helper.passwordResetRequest` | パスワード再設定要求を記録 | email, ip, ua | `void` | `await audit.helper.passwordResetRequest(email)` |
| `audit.helper.passwordResetComplete` | パスワード再設定完了を記録 | userId, ip, ua | `void` | `await audit.helper.passwordResetComplete(userId)` |
| `audit.helper.crud` | リソースの操作を記録 | input | `void` | `await audit.helper.crud(event)` |

#### 利用例：操作と主体の記録

```ts
const saved = value(await audit.log({ userId: 'demo-user', action: 'login', resource: 'auth' }))
// saved includes its generated id and createdAt
value(await audit.capture({ userId: 'demo-user', action: 'read', resource: 'orders' })) // undefined
const id = await audit.withContext({ actor: { id: 'demo-user' } }, async () => {
  const record = value(await audit.log({ action: 'update', resource: 'orders' }))
  return record.id
}) // id is the callback's returned record id
value(await audit.helper.register('demo-user'))
value(await audit.helper.login('demo-user'))
value(await audit.helper.logout('demo-user'))
value(await audit.helper.passwordResetRequest('demo@example.com'))
value(await audit.helper.passwordResetComplete('demo-user'))
// helper calls succeed with undefined; query their saved events using audit.list
```

入力の利用者 ID はアプリで認証します。ここでは架空の値です。log は記録を返し、capture と helper は業務データを返しません。withContext はコールバックの戻り値を保ちます。CRUD の例は後述します。

[引数と手順の詳細](audit.md#events)

#### 利用例：注文の更新を記録

信頼済みの主体、リソース名、注文 ID を渡します。成功データはなく、保存記録は audit.list で取得します。

```ts
value(await audit.helper.crud({
  userId: 'demo-user', action: 'update', resource: 'orders', resourceId: 'order-42',
})) // undefined
```

<a id="queries"></a>

### 記録の照会と削除：`audit`

利用者・操作・時刻で調べ、保存方針に従って古い記録を削除します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `audit.list` | イベントを絞り込みページ取得 | options | `PaginatedResult<AuditLogWithUser>` | `await audit.list({ page: 1, pageSize: 20 })` |
| `audit.getUserRecent` | ユーザーの最近の操作を取得 | userId, limit | `AuditLog[]` | `await audit.getUserRecent(userId, 10)` |
| `audit.getStats` | 直近の日数で操作を集計 | days, filters | `AuditStatItem[]` | `await audit.getStats(7)` |
| `audit.cleanup` | 保持方針に従い古い記録を削除 | olderThanDays | `number` | `await audit.cleanup(90)` |

#### 利用例：記録の照会と削除

```ts
const page = value(await audit.list({ action: 'login', page: 1, pageSize: 20 })) // items, total, pagination
const recent = value(await audit.getUserRecent('demo-user', 20)) // up to 20 AuditLog records
const stats = value(await audit.getStats(7)) // action statistics for the last seven days
const removed = value(await audit.cleanup(90)) // count of records older than 90 days
```

出力は保存済みの記録によります。空一覧・空統計・削除ゼロも成功です。削除の例はテスト用データベースで実行します。

[引数と手順の詳細](audit.md#queries)

<a id="backups"></a>

### アーカイブと検証：`audit.backup`

履歴を非公開ストレージに保管し、整合性を確認してから元の記録の保存方針を適用します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `audit.backup.run` | 非公開アーカイブを作成・照合 | options | `AuditBackupInfo` | `await audit.backup.run()` |
| `audit.backup.verify` | 形式とチェックサムを検証 | key, options | `AuditBackupInfo` | `await audit.backup.verify(backupKey)` |

#### 利用例：アーカイブと検証

以下では抽出条件を run に入力して AuditBackupInfo を得ます。そのオブジェクトキーを verify に渡して検証します。公開ダウンロードではありません。

[引数と手順の詳細](audit.md#backups)

#### 利用例：アーカイブを作成して検証

非公開 Storage を注入し backup を有効にして初期化します。ID と範囲を渡し、返った key を verify に渡して整合性を確認します。

```ts
const archive = value(await audit.backup.run({
  id: 'demo-login-archive',
  from: new Date('2026-01-01T00:00:00Z'),
  to: new Date('2026-01-02T00:00:00Z'),
}))
const verifiedArchive = value(await audit.backup.verify(archive.key))
// verifiedArchive identifies the same private archive; its contents passed verification.
```

<a id="alerts"></a>

### 異常の確認と通知：`audit.checkAlerts`

現在しきい値に達した規則を確認し、周期実行は Scheduler に任せます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `audit.checkAlerts` | しきい値を調べ通知を試行 | options | `AuditAlertReport` | `await audit.checkAlerts()` |

#### 利用例：異常の確認と通知

```ts
const report = value(await audit.checkAlerts()) // AuditAlertReport for this check
```

引数なしでは現在の規則を使います。今回の検査と通知試行の報告であり、すべて配信済みとは限りません。

[引数と手順の詳細](audit.md#alerts)
