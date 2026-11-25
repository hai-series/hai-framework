# @h-ai/audit 設定

[简体中文](audit.md) · [English](audit.en.md) · [データ構造](../data/audit.ja.md) · [API リファレンス](../function/audit.ja.md)

## 設定の読み込み

生成されたアプリは `core.config.get('audit')` で `config/_audit.yml` を読み込み、RelDB に接続した後で設定を `audit.init()` に渡します。環境変数で上書きする場合はプレフィックス `HAI_AUDIT_` を使います。変更は次回の初期化が成功した時点で反映されます。[設定の読み込み順（中国語）](runtime.md#配置从哪里来)を参照してください。

通知には初期化済みの Reach を、バックアップには初期化済みの非公開 Storage を渡します。定期実行では `audit.schedulerPlan` プロパティを読み取り、タスクとフックを Scheduler に登録します。[定期実行の利用例](../function/audit.ja.md#scheduled-audit)を参照してください。

<a id="configuration-fields"></a>

## 設定一覧

次の YAML を `config/_audit.yml` の該当箇所に追加または置き換えます。同じ項目の例は用途に合わせて選びます。保存後にサービスを再起動し、各例の手順で結果を確認します。アカウント、宛先、業務フィールド名は自分の環境に合わせて指定してください。

<a id="audit-capture"></a>

### `capture`

アプリが Audit を初期化すると、監査に対応したフレームワークの入口は操作結果が確定した時点で `audit.capture()` を呼び出します。

- **IAM** はログイン、アカウント変更、権限設定などの結果を記録します。例えば `iam.auth.login()` の結果は `action: 'auth.login'`、`resource: 'iam.auth'` として記録されます。パスワードログインの詳細には `method: 'password'` が入ります。
- **Kit** は `kit.createHandle()` を通った SvelteKit リクエストの応答を返す前に `request.execute` を記録します。`resource` にはルート ID、詳細には HTTP メソッドとステータスが入ります。
- **Serv** は監査に対応したプロシージャが結果を返すときに `request.execute` を記録します。HTTP 検証やミドルウェアが先に拒否した場合は `http.reject` を記録できます。

Kit と Serv は `GET`、`HEAD`、`OPTIONS` を参照として扱います。既定では成功した参照を除き、失敗や拒否は記録します。注文確定などの業務操作では、操作名、注文 ID、状態の変化を指定して [`audit.log()`](../function/audit.ja.md#events) で別のイベントを保存できます。

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `capture` | 省略可 | フレームワークに接続済みの入口での自動収集を設定します。 |
| `capture.enabled` | `true` | 重要な操作、失敗、拒否を自動記録します。無効時も明示的な `audit.log()` は書き込みます。 |
| `capture.includeReads` | `false` | 接続済みの入口で成功した参照も自動記録します。 |

<a id="設定例注文の更新と失敗した操作を記録する"></a>

#### 設定例：管理コンソールの更新リクエストを記録する

管理コンソールを再起動し、ユーザーを編集できるテストアカウントでテストユーザーを更新します。`PUT /api/iam/users/[id]` が成功すると、Kit は `action: 'request.execute'`、`resource: '/api/iam/users/[id]'`、`outcome: 'success'` を記録します。`audit.list({ action: 'request.execute', resource: '/api/iam/users/[id]' })` で検索でき、`details` を展開すると `{ "method": "PUT", "status": 200 }` が確認できます。同じリクエストが権限チェックで 403 になった場合は `outcome: 'denied'` が記録されます。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
capture:
  enabled: true
  includeReads: false
```

<a id="参照操作も記録し顧客の電話番号を伏せる"></a>

#### 設定例：成功した参照操作を追跡する

管理コンソールを再起動し、`user:list` 権限を持つログイン済みテストセッションから `GET /api/iam/users` を直接送信します。`audit.list({ action: 'request.execute', resource: '/api/iam/users' })` で、`details` を展開すると `{ "method": "GET", "status": 200 }` になる新しい成功イベントを確認します。参照が多いと記録量も増えます。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
capture:
  enabled: true
  includeReads: true
```

#### 設定例：明示的に送った業務イベントだけを記録する

再起動後、サーバーから `iam.auth.login()` を直接呼び出してテストログインを行い、別途 `audit.log()` で業務イベントを記録します。明示的に書いたイベントは `audit.list()` で確認できます。このログインによる IAM の `auth.login` イベントは追加されません。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
capture:
  enabled: false
```

<a id="audit-privacy"></a>

### `privacy`

イベントを保存する前に `details` 内の業務上の個人情報をマスクします。認証情報は常にマスクされます。

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `privacy` | 省略可 | イベント詳細に含む業務データのマスクを設定します。認証情報は常にマスクします。 |
| `privacy.enabled` | `true` | メールアドレスや電話番号など一般的な業務情報をマスクします。 |
| `privacy.fields` | `[]` | 最大 1000 件の追加フィールド名、各 1～256 文字。イベント詳細で大文字と小文字を区別せず照合します。 |

#### 設定例：顧客の電話番号と配送備考を伏せる

注文サービスは配送情報を更新した後、`audit.log()` を呼び出します。`details` にはアプリが記録する項目を指定します。電話番号の項目名は既定のルールでマスクされます。次の設定ではアプリ独自の `deliveryNote` も対象に追加します。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
privacy:
  fields: [customerPhone, deliveryNote]
```

この設定でテストサービスを起動し、注文のサンプルイベントを書き込んでから、リクエスト ID で保存したイベントを取得します。

```ts
import { audit } from '@h-ai/audit'

// 配送状況とサンプルの詳細 2 項目を保存します。個人情報に当たる値は保存前に置き換わります。
const written = await audit.log({
  action: 'delivery.update',
  resource: 'orders',
  resourceId: 'order-42',
  requestId: 'demo-order-privacy',
  details: {
    customerPhone: '000-0000-0000',
    deliveryNote: 'Leave at reception',
    status: 'shipped',
  },
})
if (!written.success) throw new Error(written.error.message)

// サンプルのリクエスト ID で絞り込み、イベント ID で今回の記録を特定します。
const listed = await audit.list({ requestId: 'demo-order-privacy' })
if (!listed.success) throw new Error(listed.error.message)
const event = listed.data.items.find(item => item.id === written.data.id)
if (!event?.details) throw new Error('保存した監査イベントの詳細を取得できませんでした')
const details = JSON.parse(event.details)
```

`event.details` は照会で返される JSON 文字列です。解析すると実際に保存された 3 項目を確認できます。

```json
{
  "customerPhone": "[REDACTED]",
  "deliveryNote": "[REDACTED]",
  "status": "shipped"
}
```

#### 設定例：テスト環境で業務データのマスクを止める

顧客データを置いていない環境で、架空のメールアドレスとテスト用トークンを含むイベントを記録します。照会結果ではメールアドレスが表示され、トークンにはマスクが残ります。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
privacy:
  enabled: false
```

<a id="audit-user-mapping"></a>

### ユーザー情報の対応付け

イベントの `userId` で利用者名を調べ、操作主体のスナップショットに保存します。既定では IAM のユーザーテーブルを使います。信頼できるユーザー ID を指定してください。後で利用者名を変更しても記録済みの値は変わりません。

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `userTable` | `"hai_iam_users"` | 操作したユーザーの名前を参照するテーブル。 |
| `userIdColumn` | `"id"` | テーブルで検索に使うユーザー ID の列。 |
| `userNameColumn` | `"username"` | イベントのスナップショットにユーザー名として保存する値の列。 |

#### 設定例：アプリ独自のユーザーテーブルから名前を取得する

注文サービスの `app_users` で ID を `account_id`、名前を `display_name` に保存している場合の例です。同じデータベースにテストユーザーを作り、その ID を指定して `actorSnapshot` を省いて書き込みます。`audit.list()` で当時の名前を確認します。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
userTable: app_users
userIdColumn: account_id
userNameColumn: display_name
```

<a id="audit-retention"></a>

### `retention`

最近の監査記録を保護する最短期間を指定します。有効にすると、データベーストリガーが期間内の変更、上書き、削除を防ぎ、`audit.cleanup()` にも同じ下限が適用されます。期限を迎えた記録の削除はアプリ側で実行します。データベースを共有するインスタンスには同じ設定を使い、変更後はまとめて再起動します。

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `retention` | 省略可 | 省略または `{}` の場合は下記の既定値が使われます。 |
| `retention.enabled` | `false` | 指定期間内の記録を更新、削除、上書きから保護します。 |
| `retention.minDays` | `90` | 1 日を 24 時間とする保護期間。1～36500 の整数で、`enabled: true` のときに削除できる最小日数を定めます。 |

<a id="直近-90-日分の監査記録を保護する"></a>

#### 設定例：直近 90 日分の監査記録を保護する

90 日間の保護を有効にします。テスト用データベースで `audit.cleanup(0)` の削除件数を確認します。直近 90 日分は残ります。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
retention:
  enabled: true
  minDays: 90
```

<a id="change-retention"></a>


#### 設定例：有効な保持期間を 120 日に延長する

`enabled: true` のまま、`minDays` を 90 から 120 に変更します。インスタンスをまとめて再起動すると、テスト用データベースの `audit.cleanup(0)` が削除対象にするのは 120 日より古い記録です。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
retention:
  enabled: true
  minDays: 120
```

#### 設定例：テスト用データベースの保護を解除する

専用のテスト用データベースで `enabled: false` を指定します。再起動後、`audit.cleanup(30)` には 30 日が適用されます。引数を省略すると API の既定である 90 日を使います。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
retention:
  enabled: false
```

<a id="audit-backup"></a>

### `backup`

調査やオフライン分析のために監査イベントを別の非公開ストレージへ書き出します。Audit の初期化時に接続済みの非公開 Storage を渡します。

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `backup` | 省略可 | 監査履歴を非公開の Storage に書き出します。 |
| `backup.enabled` | `false` | 手動または定期書き出しを許可します。初期化済みの非公開 Storage が必要です。 |
| `backup.batchSize` | `200` | 1 バッチの読み取り件数、1～1000 の整数。件数を減らすとメモリの使用量は減り、読み取り回数は増えます。 |
| `backup.maxRecordBytes` | `1048576` | 1 件の最大 UTF-8 バイト数、1024～67108864 の整数。超える行があるとバックアップが失敗します。 |
| `backup.schedule` | 省略可 | `audit.schedulerPlan` のタスクとフックを登録して定期バックアップを実行します。 |
| `backup.schedule.enabled` | `false` | `backup.enabled` が `true` の場合に定期バックアップを登録します。 |
| `backup.schedule.cron` | `"0 2 * * *"` | 5 フィールドの Cron 式、1～128 文字。既定は指定タイムゾーンで毎日 02:00。 |
| `backup.schedule.timezone` | `"UTC"` | `Asia/Shanghai` など、Cron に使う IANA タイムゾーン、1～128 文字。 |

#### 設定例：調査期間の記録を必要に応じて書き出す

バックアップを有効にし、調査期間を [`audit.backup.run()`](../function/audit.ja.md#backups) に渡します。成功結果の `key` を `audit.backup.verify(key)` に渡し、件数とチェックサムを確認します。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
backup:
  enabled: true
```

#### 設定例：毎日午前 2 時に非公開ストレージへ保存する

Scheduler に実行計画を登録し、上海時間の毎日午前 2 時に書き出します。この例は 1 バッチ 100 件、1 件あたり最大 2 MiB です。再起動後に実行結果と生成された非公開オブジェクトを確認します。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
backup:
  enabled: true
  batchSize: 100
  maxRecordBytes: 2097152
  schedule:
    enabled: true
    cron: '0 2 * * *'
    timezone: Asia/Shanghai
```

<a id="audit-alerts"></a>

### `alerts`

ルールに合う確定済みイベントを数え、しきい値に達したら Reach で通知します。固定時間枠内の対象イベント全体を数えます。手動確認には Reach、定期確認には加えて Scheduler への登録が必要です。

| 項目 | 既定値・必須条件 | 用途 |
| --- | --- | --- |
| `alerts` | 省略可 | 確定済みイベントを固定時間枠で確認します。 |
| `alerts.enabled` | `false` | 確認と通知を有効にします。ルール 1 件以上と、指定のプロバイダーを登録した初期化済みの Reach が必要です。 |
| `alerts.maxNotificationsPerCheck` | `100` | 1 回の確認で試行する上限、1～1000 の整数。残りは次回以降に確認できます。 |
| `alerts.rules` | `[]` | 最大 20 件。各ルールが固定時間枠で条件に合う全イベントを数えます。 |
| `alerts.rules[].id` | 必須 | 一意で変更しないルール ID。英数字、アンダースコア、ハイフンの 1～64 文字。 |
| `alerts.rules[].actions` | 必須 | 完全一致で照合する操作名を 1～50 件指定。前後の空白を除いて各 1～128 文字。例は `auth.login`。 |
| `alerts.rules[].resource` | 省略可 | 指定のリソース名で絞り込み。前後の空白を除いて 1～256 文字。 |
| `alerts.rules[].outcomes` | `["failure", "denied"]` | `success`、`failure`、`denied` の中から最大 3 件。空の配列は全結果に一致します。 |
| `alerts.rules[].minimumSeverity` | `"info"` | 集計対象の最低レベル。`info`、`warning`、`error`、`critical` のいずれか。 |
| `alerts.rules[].severity` | `"warning"` | 通知に表示するレベル。`warning`、`error`、`critical` のいずれか。 |
| `alerts.rules[].threshold` | `1` | 同じ時間枠の通知しきい値、1～1000000000 の整数。 |
| `alerts.rules[].windowSeconds` | `300` | 固定時間枠の長さ、60～86400 秒の整数。 |
| `alerts.rules[].targets` | 必須 | 1～20 件の宛先。宛先ごとに結果を追跡します。 |
| `alerts.rules[].targets[].id` | 必須 | ルール内で一意かつ固定の ID。英数字、アンダースコア、ハイフンの 1～64 文字。 |
| `alerts.rules[].targets[].provider` | 必須 | `email` など、Reach に登録したプロバイダー名。前後の空白を除いて 1～128 文字。 |
| `alerts.rules[].targets[].to` | 必須 | プロバイダーが受け付ける宛先。前後の空白を除いて 1～1000 文字。実際に配信する宛先を設定します。 |
| `alerts.schedule` | 省略可 | `audit.schedulerPlan` のタスクとフックを登録して定期確認します。[`audit.checkAlerts()`](../function/audit.ja.md#alerts) で手動確認もできます。 |
| `alerts.schedule.enabled` | `false` | `alerts.enabled` が `true` の場合に定期確認を登録します。 |
| `alerts.schedule.cron` | `"* * * * *"` | 5 フィールドの Cron 式、1～128 文字。既定は毎分。 |
| `alerts.schedule.timezone` | `"UTC"` | `Asia/Shanghai` など、Cron に使う IANA タイムゾーン、1～128 文字。 |

#### 設定例：ログイン失敗や拒否を手動で確認する

Reach に `email` という名前でプロバイダーを登録し、例のメールアドレスをテスト宛先に変更します。同じ 5 分間に `auth.login` の失敗か拒否を 3 件作り、[`audit.checkAlerts()`](../function/audit.ja.md#alerts) の `submitted` または `queued` の件数を確認します。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
alerts:
  enabled: true
  rules:
    - id: login-failures
      actions: [auth.login]
      resource: iam.auth
      outcomes: [failure, denied]
      threshold: 3
      windowSeconds: 300
      targets:
        - id: security-mailbox
          provider: email
          to: security@example.com
```

#### 設定例：管理者へロール割り当てを自動通知する

例の宛先を差し替え、Reach に `email` という名前でプロバイダーを登録します。Audit の計画を登録して Scheduler を起動します。IAM でロールを割り当て、次回の実行結果と Reach の結果を確認します。チェックは毎分で、1 回につき最大 20 件の通知を試行します。

```yaml schema=@h-ai/audit:AuditInitConfigSchema
alerts:
  enabled: true
  maxNotificationsPerCheck: 20
  rules:
    - id: role-assignment
      actions: [role.assign]
      resource: iam.user-roles
      outcomes: [success]
      threshold: 1
      windowSeconds: 300
      targets:
        - id: security-mailbox
          provider: email
          to: security@example.com
  schedule:
    enabled: true
    cron: '* * * * *'
    timezone: UTC
```

複数サービスをまとめて有効にする構成は[運用ガイド（中国語）](operations.md#audit采集保留保护归档与告警)を参照してください。
