# @h-ai/audit

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

## 概要

統一された監査ログモジュールです。`audit` オブジェクトで記録、検索、削除、集計を行い、`@h-ai/reldb` で永続化します。

SQLite、PostgreSQL、MySQL で読み取り契約は共通です。`createdAt` は `Date`、`details` は JSON 文字列または `null`、値のない nullable フィールドは `null` を返します。日時フィルターは書き込みと同じドライバー変換を使用します。件数は安全な整数とし、範囲外では `STATS_FAILED` を返します。

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

一般的なイベントは `audit.helper` で記録し、対応する `AuditHelper` 型は公開を維持します。内部の組み立て用ファクトリーはパッケージ API に含めません。

#### 入力制約

- `audit.log(input)`：`action` / `resource` は空でない文字列で、長さは 256 文字以内。
- `audit.log(input)`：`details` 内の認証情報（`password` / `token` / `secret` など）は永続化前に自動的にマスクされます。メールアドレス・電話番号などの業務個人情報も既定で隠し、privacy で調整できます。
- `audit.list(options)`：`startDate` と `endDate` を両方指定する場合は `startDate <= endDate` が必要です。
- `audit.getUserRecent(userId, limit)`：`userId` は空でない文字列。`limit` を指定する場合は正の整数。
- `audit.cleanup(days)`：`days` を指定する場合は 0 以上の整数。
- `audit.getStats(days)`：`days` を指定する場合は 0 以上の整数。

### エラーコード

業務データ操作は `HaiResult<T>` を返します。主なエラーコード：

| エラーコード                     | code            | 説明                       |
| -------------------------------- | --------------- | -------------------------- |
| `HaiAuditError.LOG_FAILED`       | `hai:audit:001` | 記録に失敗                 |
| `HaiAuditError.QUERY_FAILED`     | `hai:audit:002` | 検索に失敗                 |
| `HaiAuditError.CLEANUP_FAILED`   | `hai:audit:003` | 削除に失敗                 |
| `HaiAuditError.STATS_FAILED`     | `hai:audit:004` | 集計に失敗                 |
| `HaiAuditError.INIT_IN_PROGRESS` | `hai:audit:005` | 初期化中                   |
| `HaiAuditError.NOT_INITIALIZED`  | `hai:audit:010` | モジュールが未初期化       |
| `HaiAuditError.CONFIG_ERROR`     | `hai:audit:012` | 設定エラー                 |
| `HaiAuditError.BACKUP_DISABLED`  | `hai:audit:020` | バックアップ無効           |
| `HaiAuditError.BACKUP_FAILED`    | `hai:audit:021` | バックアップ/検証失敗      |
| `HaiAuditError.BACKUP_INVALID`   | `hai:audit:022` | バックアップ入力が無効     |
| `HaiAuditError.BACKUP_CONFLICT`  | `hai:audit:023` | IDとエクスポート条件が衝突 |
| `HaiAuditError.ALERTS_DISABLED`  | `hai:audit:024` | アラート無効               |
| `HaiAuditError.ALERTS_FAILED`    | `hai:audit:025` | アラート検査・通知失敗     |

> 注：`audit.close()` も `HaiResult<void>` を返します。`audit.helper.passwordResetRequest()` のメール情報は既定の業務個人情報設定でマスクされます。

`audit.init()` は自動建表とリポジトリーの準備完了を待って成功します。DDL 失敗時は `isInitialized=false` のままで、DB を修正後に再試行できます。独自 JOIN・統計・削除も同じ準備完了を待ちます。初期化中の close は遅れた公開を無効化します。init の HaiResult を確認後に記録・検索し、共有 DB の接続は所有しないため audit の終了後に DB を終了します。

## イベント文脈、個人情報と保持

監査 createdAt、アラート窓、アーカイブ終了時刻はノード時刻ではなく DB 時刻を共用します。バックアップ/アラート定時タスクは永続的な重複排除の保証により冪等を宣言し、失敗を非冪等の不明タスクとして後続スケジュールを阻止しません。

`capture: { enabled: true, includeReads: false }` でフレームワークの自動記録を制御します。IAM はアカウント、認証、パスワード、権限、API Key、セッションの重要変更を記録します。Serv/Kit は検証済み身元と信頼できる接続元を関連付け、書込と失敗・拒否を記録し、成功した読取は既定で省略します。身元確定前のプロトコル・入力検証失敗は匿名です。HTTP イベントは操作・メソッド・状態・理由コードのみを記録し、要求本文・トークン・内部エラーは複製しません。業務の完了・失敗境界ではアプリが `audit.log()` を使います。自動記録の無効化は明示的 log に影響しません。audit は IAM より先に初期化し、IAM の後に閉じます。信頼できるジョブ/CLI は実行主体と関連文脈を設定してください。

`audit.log(input, tx)` と `audit.capture(input, { tx })` は既存の RelDB トランザクションを使い、変更と一緒にコミット・ロールバックします。独立コミットやロールバック後の成功記録は残しません。失敗・拒否はロールバック完了後に呼出境界で記録してください。自動記録失敗は関連診断を出し、既に反映された業務結果は維持して危険な再試行を防ぎます。記録を必須とする業務は、同じトランザクション内で明示的 log の HaiResult を確認してからコミットします。

新規記録は category（system/business）、outcome（success/failure/denied）、severity（info/warning/error/critical）、要求・追跡・範囲 ID と actorSnapshot を持ちます。イベント時点の身元を複製し、名前・役割の変更や削除後も保持します。userId のみなら設定された名前を取得し、取得失敗時は名前不明を明示して診断を出します。HTTP ホストは検証済み身元で `audit.withContext({ actor, requestId, ipAddress, userAgent }, operation)` を使います。この文脈ツールは操作の戻り値・例外を維持し、業務書込は HaiResult を返します。

`audit.list({ category, outcome, severity, scopeId, requestId, traceId, sortBy, sortDirection })` は分類検索と制御された並べ替え、`getStats(7, { category: 'system' })` は分類内の操作集計です。業務個人情報は既定で隠し、`privacy.fields` で項目名を追加できます。無効にしても password/token は常に隠します。自由文に個人情報がある場合は対応項目全体を隠してください。

`retention: { enabled: true, minDays: 90 }` は共有DBの最低保持を有効にします。cleanup(0) も最低期間を守り、トリガーは保護対象の UPDATE・DELETE・衝突置換を拒否します。未設定の新規フレームワークは保持保護を強制せず、削除引数の既定90日だけでは不変保証になりません。retention を省略した再初期化はDB設定を継続し、信頼できる起動設定で明示的に無効化できます。通常の行書込を対象とし、DB所有者のDDL・権限や独立アーカイブなどは配備側で管理します。

更新前に旧書込を停止してバックアップし、`migrateAudit({ dryRun: true })` で読み取り専用の事前確認ができます。audit.init は再実行可能な移行を行います。歴史上不明な分類・結果・身元は null のままです。旧記録のユーザー表JOINは表示互換であり、当時の身元の証拠にはしません。書込失敗は失敗結果と関連診断を返し、close は開始済み書込を待つため、その後に RelDB を閉じてください。

マスキングは項目全体に適用し、オブジェクト、配列、独自 JSON 変換の機密値も隠します。未初期化または close 後の capture は未初期化エラーを返し、初期化済みモジュールで capture を無効にした場合だけ自動イベントを省略します。

## 非公開バックアップと定時アーカイブ

`backup.enabled` は既定で無効です。RelDB を先に初期化し、初期化済み StorageFunctions を `audit.init({ storage, backup: { enabled: true } })` に渡します。batchSize は走査件数（既定200）、maxRecordBytes は UTF-8 一行の上限（既定1 MiB）です。上限超過は失敗し、元の監査証拠は切り詰めません。

`audit.backup.run({ id?, from?, to?, signal? })` は非公開 JSONL と ID/key、件数、SHA-256、開始/対象終了日時を返します。名前空間は AUDIT_BACKUP_PREFIX（hai-private/audit-backups/）に固定します。同じ実行は安定 ID を使い、既存の完全なアーカイブを検証して再利用します。条件の衝突・不完全・破損は失敗し、上書きしません。条件書込の競合や結果不明は実ファイルで確認します。`audit.backup.verify(key, { signal? })` は有界ストリームで形式・件数・チェックサムを検証します。チェックサムは完全性を示し、真正性を保証しません。

v1 は header、`{type:'entry',record}`、footer の行形式です。元の ID、ISO 日付、保存済み詳細、歴史上不明の身元を維持し、現在のユーザー名とは結合しません。footer の SHA-256 はそれ以前の UTF-8 行と改行を含み、recordCount は entry 件数です。検証後にオフライン参照や独立した検索ストアへ復元でき、保護されたオンライン記録は置換しません。オンライン出力は固定終了時刻と主キーカーソルによる実走査範囲です。同一時点への完全復旧には書込/削除を停止するか DB ネイティブの一貫したスナップショットを使います。

backup.schedule は enabled、5項目 cron（既定 `0 2 * * *`）、IANA timezone（既定 UTC）です。audit.schedulerPlan は有効なバックアップとアラートをまとめた tasks/hooks 計画を返し、自動タスクがなければ null です。コールバックは共有 occurrence ID と取消信号を使い、失敗時に例外を投げてタスクを失敗にします。結果不明は Scheduler の手順で確認します。example/fullstack は組み込み済みで、他のホストは既存のタスク/コールバックと合成します。Scheduler、IAM、Audit、Storage、RelDB の順に閉じます。Audit は自分のバックアップを取消・排出し、ホスト Storage は閉じません。

```ts
const plan = audit.schedulerPlan
if (plan) {
  const initialized = await scheduler.init({ ...schedulerSettings, ...plan })
  if (!initialized.success)
    throw new Error(initialized.error.message)
  const started = scheduler.start()
  if (!started.success)
    throw new Error(started.error.message)
}
```

ホストが audit/scheduler と検証済み schedulerSettings を提供し、Audit/Storage/RelDB を初期化済みとします。非公開ストレージを使い、バックアップ有効時は S3 publicUrl 設定を拒否します。バケット/CDN のアクセス制限も必要です。公開ファイル入口は指定資源のみを許可し、example/fullstack は正規のアバターパスだけを公開します。アーカイブの取得には監査の認可入口を使い、無効化後も既存ファイルは非公開のままです。

## 等級別の異常アラート

`alerts.enabled` は既定で false。有効化時は初期化済み Reach を `audit.init({ reach, alerts: { enabled: true, rules: [...] } })` に渡します。ルールは一意な id、完全一致の actions、任意の resource、outcomes、minimumSeverity、threshold/windowSeconds、通知 severity、id/provider/to を持つ targets で指定します。既定の窓は300秒（60–86400秒）、結果は failure/denied、空の outcomes は全結果です。通知 Provider は Reach に登録済みである必要があります。業務ロールはアプリ側で決定します。

`audit.checkAlerts({signal?})` はコミット済みイベントの現在と直前の固定窓を確認します。ロールバックは通知せず、二窓を超えた停止の履歴は再送しません。maxNotificationsPerCheck は既定100、report.more は次回の未処理対象を示します。共有 DB でルール・対象・窓ごとに外部試行を一度だけ永続取得し、最終 SQL で DB 実行時刻を検証します。ルールの意味や送信先を変更すると別方針となり、新規通知する場合があります。

通知はルール/対象 ID、等級、件数、期間のみで、イベント詳細や資格情報を複製しません。submitted は Provider の受付、queued は Reach の永続キュー登録であり、到達や既読を保証しません。queueId で照会できます。失敗・中断・クラッシュは unknown/sending/claimed 結果記録を残し、不確定な外部効果を自動再送しません。audit.alert と hai_audit_alert_claims を確認し、通知先と照合して対処します。Reach 登録済みキューは Reach の復旧規則に従います。取得表は宛先/本文を保存せず、確認範囲外の受付/キュー登録済み取得のみ清掃し、未決は運用確認まで保持し、通知イベントは監査保留に従います。

alerts.schedule は独立して有効化でき、既定は毎分・UTC。audit.schedulerPlan は有効なバックアップ/アラートをまとめ、ホストが Scheduler に明示的に渡します。自動タスクがなければ null。検査失敗または report.failed>0 はタスク失敗です。Scheduler を先に停止し、次に Audit/Reach を閉じます。Audit は新規取得を取消し、Reach の Provider タイムアウト内で実行中通知を待機し、ホスト Reach は閉じません。DB/監査失敗は HaiResult の失敗、通知失敗は成功レポートの failed に現れるため、呼出側で確認します。

## 開発とテスト

```bash
pnpm --filter @h-ai/audit test
```

ソース例は RelDB を先に初期化し、監査結果と依存関係の逆順による終了結果を確認します。[JSDoc 規約（中国語）](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证) を参照してください。

## ライセンス

Apache-2.0
