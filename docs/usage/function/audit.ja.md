# @h-ai/audit API リファレンス

<!-- translation: partial -->

[原文（中国語）](audit.md) · [設定](../configuration/audit.ja.md) · [データ構造](../data/audit.ja.md)

<a id="quick-start"></a>

## クイックスタート

サーバーで Audit を初期化します。コンテキストに信頼できる操作主体、リクエスト、リソースの識別子を渡します。業務固有のイベントは明示的に記録し、業務操作は capture で囲みます。

この例ではメモリ上の SQLite を使います。RelDB、Audit の順に初期化し、ログインを 1 件記録します。同じアクション名で検索すると、`logs.items` に記録した行が入ります。終了時は Audit を先に閉じます。開発環境（例: `NODE_ENV=development`）で実行してください。本番モードではノード間で共有するデータベースが必要です。

```ts
// 独立した開始・終了スクリプトです。この境界では元のエラーを送出し、HaiResult の業務関数では失敗結果を返します。
import { audit } from '@h-ai/audit'
import { reldb } from '@h-ai/reldb'

// 監査表用のインメモリ SQLite を開きます。成功時の data はなく、接続失敗時は例外になります。
const initResult = await reldb.init({ type: 'sqlite', database: ':memory:' })
if (!initResult.success)
  throw new Error(initResult.error.message, { cause: initResult.error })

try {
  // 開いた DB と既定設定で監査を初期化します。成功後に記録でき、失敗時は例外になります。
  const initResult2 = await audit.init()
  if (!initResult2.success)
    throw new Error(initResult2.error.message, { cause: initResult2.error })
  try {
    // demo-user の auth ログインを記録します。成功時は ID 付きの記録、失敗時はスクリプト境界で元のエラーを送出します。
    const logResult = await audit.log({ userId: 'demo-user', action: 'login', resource: 'auth' })
    if (!logResult.success)
      throw new Error(logResult.error.message, { cause: logResult.error })
    const saved = logResult.data
    // login イベントを 1 ページ最大 20 件で取得します。新規 DB の結果には直前の記録が入り、失敗時はスクリプト境界で元のエラーを送出します。
    const listResult = await audit.list({ action: 'login', pageSize: 20 })
    if (!listResult.success)
      throw new Error(listResult.error.message, { cause: listResult.error })
    const logs = listResult.data
    // 新数据库中，查询到的第一条记录就是刚写入的那条。
    if (logs.items[0]?.id !== saved.id)
      throw new Error('Expected the new login event')
  }
  finally {
    // 引数なしで監査状態を解放します。成功時の data はなく、失敗時はスクリプト境界で元のエラーを送出します。
    const closeResult = await audit.close()
    if (!closeResult.success)
      throw new Error(closeResult.error.message, { cause: closeResult.error })
  }
}
finally {
  // 監査終了後に SQLite 接続を閉じます。成功時の data はなく、失敗時はスクリプト境界で元のエラーを送出します。
  const closeResult2 = await reldb.close()
  if (!closeResult2.success)
    throw new Error(closeResult2.error.message, { cause: closeResult2.error })
}
```

<a id="api-一覧"></a>

<a id="api-reference"></a>

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

モジュールの import は入門例と同じです。開始・終了の例以外は初期化成功後、終了前に実行します。各呼び出しで HaiResult.success を確認し、失敗時は元の結果を返して、成功時だけ data を読みます。関数宣言のない例はアプリの非同期業務関数内の断片です。独立したテストデータと明示した後片付けを使います。

<a id="lifecycle"></a>

### 監査サービスの準備：`audit`

監査記録を保存する RelDB を先に接続し、逆順に終了します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `audit.init(config?)` | 初期化済み RelDB に監査テーブルを準備 | 任意の `config: AuditInitConfigInput`。省略時は既定設定 | `void` | `await audit.init()` |
| `audit.close()` | 借りているサービスは閉じず Audit を終了 | なし | `void` | `await audit.close()` |
| `audit.isInitialized` | 監査サービスの準備状態を確認 | 読み取り専用プロパティ、引数なし | `boolean` | `audit.isInitialized` |

#### 利用例：監査サービスの準備

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// 初期化済み RelDB と既定設定で監査表を準備します。失敗は 元の失敗結果を返します。
const initResult = await audit.init()
if (!initResult.success)
  return initResult
// audit tables are ready
// 監査表が準備できると、準備状態は true です。
audit.isInitialized // true
// 引数なしで監査を終了します。成功後も借用した DB は開いたままです。失敗は 元の失敗結果を返します。
const closeResult = await audit.close()
if (!closeResult.success)
  return closeResult
// the borrowed RelDB remains open
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
| `audit.log(input, tx?)` | 監査イベントを保存 | `input: CreateAuditLogInput` 必須のイベント。[イベント項目](#audit-event-fields)を参照。`tx?: DmlWithTxOperations` 任意の既存トランザクションで業務処理と共にコミット | `AuditLog` | `await audit.log(event)` |
| `audit.capture(input, options?)` | 自動収集方針に従って記録 | `input: CreateAuditLogInput` 必須のイベント。[イベント項目](#audit-event-fields)を参照。`options?` 読み取りフラグとトランザクション。[収集項目](#audit-event-fields)を参照 | `void` | `await audit.capture(event)` |
| `audit.withContext(context, operation)` | 信頼済みの操作主体とリクエストを関連付け | `context: AuditContext` 信頼できる非同期コンテキスト。[主体項目](#audit-event-fields)を参照。`operation: () => T` コンテキスト内で実行し、その戻り値を返します | `T` | `audit.withContext(trustedContext, () => saveOrder())` |
| `audit.helper.login(userId, ip?, ua?)` | ログインを記録 | `userId: string` セッションから得た信頼できるユーザー ID。`ip?: string, ua?: string` 任意のクライアント IP と User-Agent | `void` | `await audit.helper.login(userId)` |
| `audit.helper.logout(userId, ip?, ua?)` | ログアウトを記録 | `userId: string` セッションから得た信頼できるユーザー ID。`ip?: string, ua?: string` 任意のクライアント IP と User-Agent | `void` | `await audit.helper.logout(userId)` |
| `audit.helper.register(userId, ip?, ua?)` | 登録を記録 | `userId: string` セッションから得た信頼できるユーザー ID。`ip?: string, ua?: string` 任意のクライアント IP と User-Agent | `void` | `await audit.helper.register(userId)` |
| `audit.helper.passwordResetRequest(email, ip?, ua?)` | パスワード再設定要求を記録 | `email: string` リセットを要求したメールアドレス。`ip?: string, ua?: string` 任意のクライアント IP と User-Agent | `void` | `await audit.helper.passwordResetRequest(email)` |
| `audit.helper.passwordResetComplete(userId, ip?, ua?)` | パスワード再設定完了を記録 | `userId: string` セッションから得た信頼できるユーザー ID。`ip?: string, ua?: string` 任意のクライアント IP と User-Agent | `void` | `await audit.helper.passwordResetComplete(userId)` |
| `audit.helper.crud(input)` | リソースの操作を記録 | `input: CrudAuditInput` action（create、read、update、delete）と resource が必須。resourceId、details、userId、ip、ua と[イベント項目](#audit-event-fields)は任意 | `void` | `await audit.helper.crud(event)` |

<a id="audit-event-fields"></a>

**イベント、コンテキスト、自動収集の項目**

| フィールド | 型 | 必須と既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `CreateAuditLogInput.action / resource` | `string` | 必須 | update と orders など、操作名とリソース種別。 |
| `CreateAuditLogInput.userId / resourceId` | `string \| null` | 任意 | 操作したユーザーと対象リソースの ID。システムイベントではユーザーなしでも可。 |
| `CreateAuditLogInput.details` | `Record<string, unknown> \| null` | 任意 | 永続化する JSON 詳細。書き込み前にマスクされます。 |
| `category` | `'system' \| 'business' \| null` | 任意 | イベント分類。AuditContext から現在の操作の既定値も設定できます。 |
| `outcome` | `'success' \| 'failure' \| 'denied' \| null` | 任意 | 操作の結果を記録。 |
| `severity` | `'info' \| 'warning' \| 'error' \| 'critical' \| null` | 任意 | イベントの重大度を記録。 |
| `requestId / traceId / scopeId` | `string` | 任意 | イベントまたはコンテキストの信頼できるリクエスト、トレース、範囲 ID。イベント入力では null も可。 |
| `ipAddress / userAgent` | `string` | 任意 | 信頼できるクライアントアドレスと User-Agent。イベント入力では null も可。 |
| `actorSnapshot / AuditContext.actor` | `AuditActorSnapshot \| null` | 任意 | イベント時の操作主体。オブジェクトには id が必須で、username、displayName、roles は任意。 |
| `capture.options.read` | `boolean` | `false` | 読み取り操作として指定。読み取り収集が無効なら成功した読み取りは省略し、失敗と拒否は記録できます。 |
| `capture.options.tx` | `DmlWithTxOperations` | 任意 | 業務トランザクションを指定すると、監査の書き込みも業務処理と一緒にロールバックできます。 |

自動収集が有効で読み取り収集が無効なら、`{ read: true }` の `outcome: "success"` は書き込みを省略し、`outcome: "denied"` は記録します。

#### 利用例：操作と主体の記録

監査なしに業務データを確定してはいけない場合は、同じ RelDB トランザクションを明示し、audit.log の結果を確認します。

![必須監査：業務データとイベントを同時確定](../images/function-audit-transaction.ja.svg)

業務の書込みと audit.log(input, tx) に同じ tx を使い、失敗時は呼び出し側で巻き戻します。HTTP 自動採集の失敗は完了済み業務を取り消しません。巻き戻しの失敗イベントは、元のトランザクション終了後に別途記録します。

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// ユーザー、操作、対象でログインを記録します。成功時は ID と作成時刻付きの記録、失敗は 元の失敗結果を返します。
const savedResult = await audit.log({ userId: 'demo-user', action: 'login', resource: 'auth' })
if (!savedResult.success)
  return savedResult
const saved = savedResult.data
// saved includes its generated id and createdAt
// demo-user の orders 読み取りを自動収集へ渡します。書き込み・条件付きスキップとも data はなく、失敗は 元の失敗結果を返します。
const captureResult = await audit.capture({ userId: 'demo-user', action: 'read', resource: 'orders' })
if (!captureResult.success)
  return captureResult
// 信頼済みユーザー ID を非同期処理に結び付けます。コールバックのイベント ID を返し、例外も伝播します。
const id = await audit.withContext({ actor: { id: 'demo-user' } }, async () => {
  // コンテキストのユーザーで orders 更新を記録します。成功時は保存した記録を返し、保存失敗時は下の例外分岐でコールバックを終了します。
  const recordResult = await audit.log({ action: 'update', resource: 'orders' })
  // withContext は通常の戻り値を保ちます。保存失敗を成功データと扱わないよう、このコールバックでは明示して例外を伝えます。
  if (!recordResult.success)
    throw new Error(recordResult.error.message, { cause: recordResult.error })
  const record = recordResult.data
  return record.id
}) // id is the callback's returned record id
// demo-user の登録を記録します。成功時の data はなく、失敗時は元の失敗結果を返します。
const registerResult = await audit.helper.register('demo-user')
if (!registerResult.success)
  return registerResult
// demo-user のログインを記録します。成功時の data はなく、失敗時は元の失敗結果を返します。
const loginResult = await audit.helper.login('demo-user')
if (!loginResult.success)
  return loginResult
// demo-user のログアウトを記録します。成功時の data はなく、失敗時は元の失敗結果を返します。
const logoutResult = await audit.helper.logout('demo-user')
if (!logoutResult.success)
  return logoutResult
// サンプルメールでリセット要求を記録します。成功時の data はなく、失敗時は元の失敗結果を返します。
const passwordResetRequestResult = await audit.helper.passwordResetRequest('demo@example.com')
if (!passwordResetRequestResult.success)
  return passwordResetRequestResult
// demo-user のリセット完了を記録します。成功時の data はなく、失敗時は元の失敗結果を返します。
const passwordResetCompleteResult = await audit.helper.passwordResetComplete('demo-user')
if (!passwordResetCompleteResult.success)
  return passwordResetCompleteResult
// helper calls succeed with undefined; query their saved events using audit.list
```

入力の利用者 ID はアプリで認証します。ここでは架空の値です。log は記録を返し、capture と helper は業務データを返しません。withContext はコールバックの戻り値を保ちます。CRUD の例は後述します。

[引数と手順の詳細](audit.md#events)

#### 利用例：注文の更新を記録

信頼済みの主体、リソース名、注文 ID を渡します。成功データはなく、保存記録は audit.list で取得します。

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// demo-user による orders の order-42 更新を記録します。成功時の data はなく、失敗は 元の失敗結果を返します。
const crudResult = await audit.helper.crud({
  userId: 'demo-user', action: 'update', resource: 'orders', resourceId: 'order-42',
})
if (!crudResult.success)
  return crudResult
```

<a id="queries"></a>

### 記録の照会と削除：`audit`

利用者・操作・時刻で調べ、保存方針に従って古い記録を削除します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `audit.list(options?)` | イベントを絞り込みページ取得 | 任意の `options: ListAuditLogsOptions`。[絞り込みとページ指定](#audit-list-options)を参照。 | `PaginatedResult<AuditLogWithUser>` | `await audit.list({ page: 1, pageSize: 20 })` |
| `audit.getUserRecent(userId, limit?)` | ユーザーの最近の操作を取得 | 必須の `userId: string` でユーザーを選択。任意の `limit: number` の既定は 10 件。 | `AuditLog[]` | `await audit.getUserRecent(userId, 10)` |
| `audit.getStats(days?, filters?)` | 直近の日数で操作を集計 | 任意の `days: number` は既定 7 日。任意の `filters` は[一覧フィールド](#audit-list-options)の category、outcome、severity、scopeId、userId、resource を指定可能。 | `AuditStatItem[]` | `await audit.getStats(7)` |
| `audit.countByOutcome` | 一覧と同じ条件で結果を集計 | options、省略時は全件 | `AuditOutcomeCounts` | `await audit.countByOutcome({ action: 'login' })` |
| `audit.cleanup(olderThanDays?)` | 保持方針に従い古い記録を削除 | `olderThanDays?: number` 既定 90 日。 cutoff より古いイベントを削除 | `number` | `await audit.cleanup(90)` |

<a id="audit-list-options"></a>

**ListAuditLogsOptions**

| フィールド | 型 | 必須と既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `requestId / traceId / scopeId` | `string` | 任意 | リクエスト、トレース、業務範囲に完全一致。 |
| `userId / action / resource` | `string` | 任意 | イベントのユーザー、操作、リソース種別に完全一致。 |
| `category` | `'system' \| 'business'` | 任意 | システムまたは業務イベントを選びます。 |
| `outcome` | `'success' \| 'failure' \| 'denied'` | 任意 | 指定した結果だけを取得。 |
| `severity` | `'info' \| 'warning' \| 'error' \| 'critical'` | 任意 | 指定した重大度だけを取得。 |
| `startDate / endDate` | `Date` | 任意 | イベント作成時刻の両端を含む範囲。両方指定する場合は開始が終了以下。 |
| `sortBy` | `'createdAt' \| 'action' \| 'resource' \| 'category' \| 'outcome' \| 'severity'` | `createdAt` | ソート項目を選択。 |
| `sortDirection` | `'asc' \| 'desc'` | `desc` | ソート方向を指定。 |
| `page / pageSize` | `number` | 1 ページ目、20 件 | ページ番号とページごとの件数。 |

例えば `{ resource: "orders", outcome: "denied", sortDirection: "asc", pageSize: 5 }` は拒否された注文イベントだけを古い順に最初のページに最大 5 件返します。

#### 利用例：記録の照会と削除

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// login の 1 ページ目を最大 20 件取得します。結果には記録と総数があり、失敗時は元の失敗結果を返します。
const pageResult = await audit.list({ action: 'login', page: 1, pageSize: 20 })
if (!pageResult.success)
  return pageResult
const page = pageResult.data // items, total, pagination
// 一覧と同じ login 条件で結果別に集計する。未分類も含め、失敗時には元のエラーを返す。
const outcomesResult = await audit.countByOutcome({ action: 'login' })
if (!outcomesResult.success)
  return outcomesResult
const outcomes = outcomesResult.data
// ユーザー ID の直近最大 20 件を配列で取得します。照会の失敗時は元の失敗結果を返します。
const recentResult = await audit.getUserRecent('demo-user', 20)
if (!recentResult.success)
  return recentResult
const recent = recentResult.data // up to 20 AuditLog records
// 過去 7 日を操作別に集計して件数を返します。失敗時は元の失敗結果を返します。
const statsResult = await audit.getStats(7)
if (!statsResult.success)
  return statsResult
const stats = statsResult.data // action statistics for the last seven days
// 90 日分を保持し、削除件数を返します。解放失敗時は元の失敗結果を返します。
const removedResult = await audit.cleanup(90)
if (!removedResult.success)
  return removedResult
const removed = removedResult.data // count of records older than 90 days
```

出力は保存済みの記録によります。空一覧・空統計・削除ゼロも成功です。削除の例はテスト用データベースで実行します。

[引数と手順の詳細](audit.md#queries)

<a id="backups"></a>

### アーカイブと検証：`audit.backup`

履歴を非公開ストレージに保管し、整合性を確認してから元の記録の保存方針を適用します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `audit.backup.run(options?)` | 非公開アーカイブを作成・照合 | 任意の `options: AuditBackupOptions` で ID と対象期間を指定。[アーカイブ項目](#audit-backup-options)を参照。 | `AuditBackupInfo` | `await audit.backup.run()` |
| `audit.backup.verify(key, options?)` | 形式とチェックサムを検証 | 必須の `key: string` は非公開アーカイブの結果から取得。任意の `options.signal: AbortSignal` で中止できます。 | `AuditBackupInfo` | `await audit.backup.verify(backupKey)` |

<a id="audit-backup-options"></a>

**アーカイブと検証のオプション**

| フィールド | 型 | 必須と既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `AuditBackupOptions.id` | `string` | ランダム UUID | 同じアーカイブ処理に安定した ID を指定。同じ ID の記録が一致すれば確認して再利用し、競合は失敗。 |
| `AuditBackupOptions.from` | `Date` | 下限なし | アーカイブ対象期間の開始時刻。 |
| `AuditBackupOptions.to` | `Date` | 開始時のデータベース時刻 | 処理開始より後、または from より前は不可。 |
| `signal` | `AbortSignal` | 任意 | run と verify の両方で処理を中止できます。 |

同じアーカイブを再試行する際は `{ id: "daily-audit", from, to }` を再利用します。完了済みなら同じオブジェクトキーの結果を返します。

#### 利用例：アーカイブと検証

以下では抽出条件を run に入力して AuditBackupInfo を得ます。そのオブジェクトキーを verify に渡して検証します。公開ダウンロードではありません。

[引数と手順の詳細](audit.md#backups)

#### 利用例：アーカイブを作成して検証

非公開 Storage を注入し backup を有効にして初期化します。ID と範囲を渡し、返った key を verify に渡して整合性を確認します。

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// アーカイブ ID と UTC の範囲を渡します。成功時は内部キーとマニフェスト情報、失敗時は元の失敗結果を返します。
const archiveResult = await audit.backup.run({
  id: 'demo-login-archive',
  from: new Date('2026-01-01T00:00:00Z'),
  to: new Date('2026-01-02T00:00:00Z'),
})
if (!archiveResult.success)
  return archiveResult
const archive = archiveResult.data
// 前の archive.key で検証します。成功時は検証済みの情報、破損や読み込み失敗時は元の失敗結果を返します。
const verifiedArchiveResult = await audit.backup.verify(archive.key)
if (!verifiedArchiveResult.success)
  return verifiedArchiveResult
const verifiedArchive = verifiedArchiveResult.data
// verifiedArchive identifies the same private archive; its contents passed verification.
```

<a id="alerts"></a>

### 異常の確認と通知：`audit.checkAlerts`

現在しきい値に達した規則を確認し、周期実行は Scheduler に任せます。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `audit.checkAlerts(options?)` | しきい値を調べ通知を試行 | `options?: { signal?: AbortSignal }` 確認または通知を任意で中止。省略時は設定どおり実行 | `AuditAlertReport` | `await audit.checkAlerts()` |

#### 利用例：異常の確認と通知

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// 引数なしで設定済みの時間枠を点検し、送信・キュー登録・失敗の件数を返します。点検失敗時は元の失敗結果を返します。
const reportResult = await audit.checkAlerts()
if (!reportResult.success)
  return reportResult
const report = reportResult.data // AuditAlertReport for this check
```

引数なしでは現在の規則を使います。今回の検査と通知試行の報告であり、すべて配信済みとは限りません。

Reach API の受信側は JSON の `extra.alertId` で同じアラートを識別できます。この値は対応する監査イベントの `resourceId` と一致します。

[引数と手順の詳細](audit.md#alerts)
