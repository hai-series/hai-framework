# @h-ai/reach API リファレンス

<!-- translation: partial -->

Reach はサーバーからログイン確認コードを送ったり、新しい注文を倉庫へ通知したりするときに使います。確認コードはすぐに送信を試み、注文通知は翌朝まで待てる場合があります。以下の例で送信と確認の手順を示します。

[原文（中国語）](reach.md) · [設定](../configuration/reach.ja.md) · [データ構造](../data/reach.ja.md)

<a id="quick-start"></a>

## クイックスタート

<a id="module-dependencies"></a>

### 依存関係

| 依存先 | 用途 | 利用条件 | 初期化順序 |
| --- | --- | --- | --- |
| `@h-ai/core` | ログ、設定支援、共通の結果型を提供 | Reach とともにインストール | Core の設定機能を使う場合は先に Core を初期化 |
| [`@h-ai/reldb`](../configuration/reldb.ja.md) | テンプレート、配信履歴、遅延メッセージを永続化 | テンプレートや配信履歴の永続化、または通知抑制の `delay` を使う場合 | RelDB を初期化してから `reach.init()` |
| `@h-ai/cache` | 遅延キューの走査に分散ロックを提供 | 複数ノードで重複走査を抑えたい場合に任意 | 共有キャッシュを使う場合は Cache を初期化してから `reach.init()` |
| 通知サービス（SMTP、SMS、HTTP） | 外部チャネルを通じてメッセージを配信 | 対応するチャネルの利用時。SMTP ではオプションドライバー `nodemailer` が必要 | 接続先とチャネルに必要な認証情報・ドライバーを用意してから `reach.init()` |

### ローカルで送信を試す

```bash
pnpm add @h-ai/reach
```

```ts
import { reach } from '@h-ai/reach'

// local という名前のテストチャネルを登録します。初期化の失敗は送信前に処理します。
const started = await reach.init({
  providers: [{ name: 'local', type: 'console' }],
})
if (!started.success)
  throw new Error(started.error.message)

try {
  // テスト通知を送ります。成功時は console- で始まるメッセージ ID、失敗時は error が返ります。
  const result = await reach.send({
    provider: 'local',
    to: 'demo@example.invalid',
    body: 'Hello',
  })
  if (!result.success)
    throw new Error(result.error.message)
}
finally {
  // テストチャネルを閉じます。戻り値は Promise<void> です。
  await reach.close()
}
```

`local` は開発とテストで送信操作を記録します。`console-` で始まる `messageId` が返れば、ローカルの呼び出しは成功しています。`reach.isInitialized` で利用可能なチャネルを確認できます。`reach.config` は認証情報やヘッダー値を伏せた現在の設定を返します。ファイルで指定する方法は [ローカル送信の設定](../configuration/reach.ja.md#reach-example-local)を参照してください。

<a id="api-一覧"></a>

<a id="api-reference"></a>

## 機能

以降の例はサーバー側で実行します。起動時に [Reach の設定](../configuration/reach.ja.md#configuration-fields)を `reach.init()` に渡し、結果を確認します。機能別の前提条件は [依存関係](#module-dependencies) を参照してください。

<a id="sending"></a>

### 確認コードや業務通知を送る (`reach`)

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `reach.init(config, options?)` | プロバイダーと、キューを使う場合の依存先を準備 | `config: ReachConfigInput`, `options?: ReachInitOptions` · [初期化オプション](#reach-init-options) | `Promise<HaiResult<void>>` | `await reach.init(config)` |
| `reach.close()` | 新規メッセージの取得を停止し、実行中のキュー配信の結果が保存されてからプロバイダーを解放 | なし | `Promise<void>` | `await reach.close()` |
| `reach.isInitialized` | このノードで送信経路を利用できるか確認 | なし | `boolean` | `reach.isInitialized` |
| `reach.config` | 機密項目を伏せた現在の設定を取得 | なし | `ReachConfig \| null` | `reach.config` |
| `reach.send(message)` | 通知を送信・永続キューに追加 | 宛先と内容を含む `message: ReachMessage` が必須。[メッセージ項目](#reach-message-fields)を参照。 | `Promise<HaiResult<SendResult>>` · [返される番号](#reach-send-result) | `await reach.send(message)` |

<a id="reach-message-fields"></a>

##### メッセージ項目 (`ReachMessage`)

| フィールド | 型 | 必須と既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `to` | `string` | 必須 | メールアドレスや電話番号など、チャネルの宛先。 |
| `template` | `string` | 任意 | レンダリングする保存済みテンプレート名。省略すると直接送信。 |
| `provider` | `string` | 直接送信で必須 | チャネル選択を上書き。テンプレート送信で省略するとテンプレートの事業者を使用。 |
| `vars` | `Record<string, string>` | 任意 | キーに対応するテンプレート変数を埋めます。 |
| `subject / body` | `string` | 任意 | 直接送信の件名と本文。件名はメールなどで使用。 |
| `extra` | `Record<string, unknown>` | 任意 | SMS テンプレートコードや署名など事業者固有の値を指定。 |
| `ignoreDnd` | `boolean` | `false` | `true` にすると、通知を控える時間帯でもこの通知の即時送信を試みます。 |
| `deferPolicy` | `'queue' \| 'reject'` | `queue` | 通知を控える時間帯の通常通知を誰が処理するか選びます。`queue` は Reach の `dnd.strategy` に従います。`reject` は `DND_BLOCKED` を返し、アプリが自分のタスクを延期できます。 |

<a id="reach-idempotency-key"></a>

##### HTTP リクエスト番号

Reach は HTTP API に直接送るたびに新しいリクエスト番号を割り当てます。キューに入れた場合は、同じ項目の初回送信と再試行で `queueId` を使います。番号は `Idempotency-Key` ヘッダーと JSON の `idempotencyKey` に入ります。

即時送信の試行は一回で、失敗やタイムアウトはアプリに返ります。キューは通知、番号、試行回数を保存し、バックグラウンド処理が設定に従って配信を続けられるようにします。`idempotent: true` を設定すると、結果が不明なキュー項目を再試行できます。

受信側は防ぎたい重複に合わせて項目を選びます。

| 重複の種類 | 受信側が読む項目 | 倉庫側の処理 |
| --- | --- | --- |
| Reach が同じキュー項目を再試行 | HTTP の `Idempotency-Key` ヘッダー、または同じ値を含む JSON の `idempotencyKey` | 処理済みの番号なら保存済みの結果を返す。 |
| アプリが同じ注文イベントを二回送信 | JSON の `extra.event` と `extra.orderId` | どちらも `order.received` と `order-42` なら、作成済みのピッキング作業を使う。二回の送信には別々のリクエスト番号が付く。 |

<a id="reach-send-result"></a>

##### 送信結果の番号 (`SendResult`)

外側の `result.success` を確認してから `result.data` を読み取ります。

| 番号 | 返される条件 | 使い方 |
| --- | --- | --- |
| `messageId` | 即時送信の受付時にチャネルが番号を提供すると返ります。Alibaba Cloud の `BizId`、SMTP の `messageId`、HTTP 応答の `messageId` などです。テストチャネルは `console-` で始まる番号を返します。 | チャネルへの問い合わせに使います。本文のない HTTP `204` も受付扱いです。 |
| `queueId` | キューに保存したあと `deferred: true` と一緒に返ります。 | `reach.queue.get(queueId)` でその項目の送信状態を確認します。 |

<a id="reach-providers"></a>

##### 組み込みの送信チャネル

Reach には四つの送信方式があります。`providers[]` の `type` で送信方式を選び、`name` でアプリ内の名前を付けます。`reach.send()` の `provider` には設定した `name` を渡します。

| `type` | このページの `name` の例 | 用途 |
| --- | --- | --- |
| `console` | `local` | 開発やテストで送信操作の記録を確認します。 |
| `smtp` | `email` | ログイン確認コードなどを SMTP サーバー経由で送ります。サーバー、送信元、認証情報を設定します。 |
| `aliyun-sms` | `sms` | Alibaba Cloud の署名とテンプレートで SMS を送ります。直接接続または独自ゲートウェイ経由で送信できます。 |
| `api` | `warehouse-webhook` | 指定した URL に JSON を送ります。この例の `warehouse-webhook` は倉庫へ新規注文を通知するチャネルの名前です。 |

<a id="reach-init-options"></a>

##### 初期化オプション

[通知設定](../configuration/reach.ja.md)の `config: ReachConfigInput` は必須です。`options: ReachInitOptions` を省略すると、設定に記載したゲートウェイのヘッダーと本文を使います。

`gatewayHooks` はプロバイダー名とコールバックの対応表です。対象には `gateway` が設定された `aliyun-sms` プロバイダーを指定します。引数には `method: POST`、ゲートウェイの `url`、現在の本文 `body: string | undefined` と期限を伝える `signal: AbortSignal` が入ります。`{ headers?, body? }` を同期または非同期で返し、上書きする項目だけを指定できます。`undefined` を返すと設定済みの値を使います。処理はサーバーで実行し、署名付き URL はログに出さないでください。

<a id="reach-sms-code"></a>

#### 利用例：確認コードを SMS で送る

確認コードを要求されたら、アプリまたは IAM がコードを発行し、照合期限を保存します。[SMS の設定](../configuration/reach.ja.md#reach-example-sms-code)を読み込み、`otp_sms` を使って送信します。テンプレートで `sms` チャネルを選び、`templateCodes.otp_sms` で Alibaba Cloud のテンプレートを指定します。`vars.code` が短信本文に反映されます。

```ts
import { reach } from '@h-ai/reach'

function sendSmsCode(phone: string, code: string) {
  // 発行したコードを送信します。success を確認し、受付番号があれば messageId から読めます。
  return reach.send({
    to: phone,
    template: 'otp_sms',
    vars: { code },
    ignoreDnd: true,
  })
}
```

Alibaba Cloud が `BizId` として `aliyun-42` を返す例です。データベースに接続している場合、Reach は電話番号、置換済み本文、変数を送信履歴へ書き込もうとします。[SMS の送信記録例](../data/reach.ja.md#sms-code-record)

```json
{
  "success": true,
  "data": {
    "success": true,
    "messageId": "aliyun-42"
  }
}
```

<a id="reach-email-code"></a>

#### 利用例：確認コードをメールで送る

メールを選んだら、[メールの設定](../configuration/reach.ja.md#reach-example-email-code)を読み込んで `otp_email` を使います。Reach は `email` を選び、HTML 本文の `{code}` を `vars.code` で置き換えます。

```ts
function sendEmailCode(email: string, code: string) {
  // SMTP で即時送信を試みます。成功時は messageId、失敗時は error を確認します。
  return reach.send({
    to: email,
    template: 'otp_email',
    vars: { code },
    ignoreDnd: true,
  })
}
```

アプリが 14:00 にコードを発行し、期限を 14:05 と保存した場合、入力を確認するときにその期限を使います。14:06 に入力したコードは期限切れです。利用者はアプリの再送ルールに従って新しいコードを要求できます。

<a id="reach-api-notification"></a>

#### 利用例：HTTP API で倉庫に通知する

注文 `order-42` を作成したら、[倉庫通知の設定](../configuration/reach.ja.md#reach-example-warehouse)の `order-received` を使います。本文の `{orderId}` に `vars.orderId` が入り、`extra` で倉庫にイベント種別と注文 ID を渡します。

第 2 引数の `deferPolicy` は通知を控える時間帯に適用されます。既定の `queue` では Reach の設定に従います。注文サービスが送信タスクを管理している場合は `sendOrderNotice('order-42', 'reject')` を呼び出します。`DND_BLOCKED` が返ったら、タスクを保持してこの時間帯が終わってから処理します。

```ts
function sendOrderNotice(orderId: string, deferPolicy: 'queue' | 'reject' = 'queue') {
  // 注文作成を倉庫に通知します。即時受付は messageId、待機は queueId、失敗は error を確認します。
  return reach.send({
    to: 'warehouse',
    template: 'order-received',
    vars: { orderId },
    extra: { event: 'order.received', orderId },
    deferPolicy,
  })
}
```

日中に直接送る場合、Reach は倉庫へのリクエスト番号を生成し、`Idempotency-Key` と JSON の `idempotencyKey` に入れます。タイムアウト時は注文番号で倉庫側の状態を確認できます。キューに入れた場合の番号は[夜間の倉庫通知設定](../configuration/reach.ja.md#reach-example-warehouse)を参照してください。

倉庫は受付後に `200` と `{"messageId":"warehouse-42"}` を返せます。アプリは `result.data.messageId` でその番号を取得します。本文が空の `204` も受付として扱い、番号は省略されます。本文を返す場合は 64 KiB 以下の JSON オブジェクトにします。`messageId` を含める場合は 255 文字以下の文字列です。

確認コードや再設定リンクを HTTP API に送る場合は、チャネルに `requireHttps: true` を指定し、HTTPS を使ってリダイレクトを拒否します。[API チャネルの設定](../configuration/reach.ja.md#http-api)を参照してください。

<a id="reach-quiet-hours"></a>

#### 利用例：通知を控える時間帯の扱い

通知を控える時間帯（DND）は、通常通知を遅らせたり見送ったりする時間です。サーバープロセスの現地時刻で判断します。`22:00` から翌朝 `08:00` に設定し、`23:10` に送るとします。

| 23:10 に送るもの | Reach の動作 | アプリの次の処理 |
| --- | --- | --- |
| すぐ必要な確認コード、再設定リンク、初期設定の招待（`ignoreDnd: true`） | 即時送信を試みます。チャネルが提供する場合は `messageId` が返ります。 | アプリが定めた期限内に確認やパスワード設定を済ませてもらいます。 |
| 翌朝でも使える注文通知（`strategy: delay` と `deferPolicy: queue`） | 保存後に `deferred: true` と `queueId` を返します。 | 番号を保存します。08:00 以降に Reach がキューを確認して送信します。 |
| 後から送る必要のないリマインダー（`strategy: discard`） | `DND_BLOCKED` を返して今回の送信を見送ります。 | アプリのルールに従って今回のリマインダーを終了します。 |
| アプリが送信タスクを管理する通知（`deferPolicy: reject`） | `DND_BLOCKED` を返し、タスク管理はアプリに任せます。 | 自分のタスクを保持し、時間帯が終わってから処理します。 |

IAM が Reach で組み込みの確認コード、パスワード再設定、初期パスワード設定の招待を送る場合は `ignoreDnd: true` を渡します。独自のコールバックを使う場合はアプリが送信時期を決めます。

[注文通知を翌朝送る設定](../configuration/reach.ja.md#reach-example-warehouse)を使って、23:10 に先ほどの関数を呼び出します。

```ts
// 通知を控える時間帯に注文通知を送ります。保存に成功した場合だけ queueId が返ります。
const result = await sendOrderNotice('order-42')
if (!result.success)
  throw new Error(result.error.message)

if (result.data.deferred) {
  // 返されたキュー ID で進捗を確認します。登録直後は通常 pending、記録がなければ null が返ります。
  const lookup = await reach.queue.get(result.data.queueId)
  if (!lookup.success)
    throw new Error(lookup.error.message)
  const status = lookup.data?.status
}
```

キューに入った時点で通知は保存され、倉庫への送信は待機中です。同じ項目の配信と再試行では `queueId` をリクエスト番号として使います。再度登録すると新しい項目が作られる場合があります。注文サービスでは最初の番号を保存し、倉庫ではイベント種別と注文番号でピッキング作業の重複を防げます。

![通常通知、確認コード、キューからの配信の流れ](../images/function-reach-delivery.ja.svg)

`order-42` はキューに入る経路を通ります。Reach は 23:10 に `queueId` を返し、08:00 以降に倉庫への送信を試みます。`deferPolicy: 'reject'` を渡した場合は、すぐに `DND_BLOCKED` が返ります。

#### 利用例：SMS ゲートウェイにリクエストヘッダーを追加する

ゲートウェイが `X-Client` で呼び出し元を識別する場合、起動時に関数を登録して各 SMS リクエストにヘッダーを追加できます。[SMS ゲートウェイの設定](../configuration/reach.ja.md#reach-example-sms-gateway)

```ts
import { type ReachConfigInput, reach } from '@h-ai/reach'

function startReach(config: ReachConfigInput) {
  // sms ゲートウェイが設定済みの構成を渡します。初期化に成功すると、次のゲートウェイリクエストでコールバックが X-Client を追加します。
  return reach.init(config, {
    gatewayHooks: {
      sms: ({ signal }) => {
        signal.throwIfAborted()
        return { headers: { 'X-Client': 'delivery' } }
      },
    },
  })
}
```

<a id="templates"></a>

### テンプレートの管理と確認：`reach.template`

テンプレートで経路・本文・件名を決めます。render は送信せず差し込み結果を確認します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `reach.template.resolve(name)` | 有効なテンプレートを取得 | `name: string` テンプレート検索用の一意な名前 | `Promise<HaiResult<ReachTemplate>>` | `await reach.template.resolve(name)` |
| `reach.template.save(template)` | テンプレートを保存 | `template: ReachTemplate` name、provider、body が必須。メールの subject は任意。本文と件名に {var} を使用可能 | `Promise<HaiResult<void>>` | `await reach.template.save(template)` |
| `reach.template.saveBatch(templates)` | テンプレートを一括保存 | `templates: ReachTemplate[]` 一括保存するテンプレート配列。各項目は save と同じ | `Promise<HaiResult<void>>` | `await reach.template.saveBatch(templates)` |
| `reach.template.remove(name)` | 独自テンプレートを削除 | `name: string` テンプレート検索用の一意な名前 | `Promise<HaiResult<void>>` | `await reach.template.remove(name)` |
| `reach.template.list()` | 現在のテンプレートを列挙 | なし | `Promise<HaiResult<ReachTemplate[]>>` | `await reach.template.list()` |
| `reach.template.render(name, vars)` | 変数を置き換えてプレビュー | `name: string` テンプレート検索用の一意な名前。`vars: Record<string, string>` プレースホルダー名から置換値へのマップ | `Promise<HaiResult<RenderedTemplate>>` | `await reach.template.render('demo-welcome', { name: 'Alice' })` |

#### 利用例：テンプレートの管理と確認

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// local 向けの demo-welcome を件名 Welcome、本文 Hello {name} で保存する。成功時にデータはなく、保存エラーは 元の失敗結果を返す。
const saveResult = await reach.template.save({ name: 'demo-welcome', provider: 'local', body: 'Hello {name}', subject: 'Welcome' })
if (!saveResult.success)
  return saveResult
// local 向けの demo-goodbye を本文 Bye {name} で一括保存する。成功時にデータはなく、一部失敗でも他の成功済み項目のロールバックは保証されない。
const saveBatchResult = await reach.template.saveBatch([{ name: 'demo-goodbye', provider: 'local', body: 'Bye {name}' }])
if (!saveBatchResult.success)
  return saveBatchResult
// 上で保存した demo-welcome を名前で取得する。未登録なら 元の失敗結果を返す。
const templateResult = await reach.template.resolve('demo-welcome')
if (!templateResult.success)
  return templateResult
const template = templateResult.data // saved template
// demo-welcome に Ada を渡してプレビューする。本文 Hello Ada と件名が返り、送信は行わない。テンプレートがなければ失敗。
const previewResult = await reach.template.render('demo-welcome', { name: 'Ada' })
if (!previewResult.success)
  return previewResult
const preview = previewResult.data // body 'Hello Ada'
// 引数なしで保存済みテンプレートを列挙する。上の二件を含み、読み取り失敗は 元の失敗結果を返す。
const templatesResult = await reach.template.list()
if (!templatesResult.success)
  return templatesResult
const templates = templatesResult.data // includes both templates
// 名前 demo-goodbye のテンプレートを削除する。成功時にデータはなく、保存先のエラーは 元の失敗結果を返す。
const removeResult = await reach.template.remove('demo-goodbye')
if (!removeResult.success)
  return removeResult
```

入門例の `local` を使います。`name: 'Ada'` を渡すと Hello Ada になります。`render()` はテキストを置換し、SMTP は本文を HTML として送信します。フォームなど信頼できない入力を本文に埋め込むときは、埋め込み先の HTML に合わせてエスケープします。

[引数と手順の詳細](reach.md#templates)

<a id="queue"></a>

### 待機・失敗した通知の確認：`reach.queue`

待機キューの番号を保存し、状態や最終失敗の一覧を確認します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `reach.queue.get(queueId)` | ID で送信記録を取得 | `queueId: string`。キュー登録時に返る番号です。 | `Promise<HaiResult<ReachQueueEntry \| null>>` | `await reach.queue.get(queueId)` |
| `reach.queue.list(options)` | 送信記録を絞り込みページ取得 | `options: ReachQueueListOptions` · [検索の引数](#reach-queue-options) | `Promise<HaiResult<ReachQueueEntry[]>>` | `await reach.queue.list({ status: 'unknown' })` |

<a id="reach-queue-options"></a>

##### 検索の引数

`ReachQueueListOptions` は必須です。`status` には `dead` または `unknown` を指定します。`limit` は 1～100（既定 50）、`offset` はスキップする件数で 0～1,000,000（既定 0）です。

##### 番号で送信記録を確認する

`reach.queue.get(queueId)` でキューの項目を照会します。即時送信の `messageId` はチャネルへの問い合わせに使います。[API の即時送信記録](../data/reach.ja.md#direct-api-record)を参照してください。

| 状態 | 実際の状況 |
| --- | --- |
| `pending` | 通知は保存済みで、時間帯の終了か次の試行を待っています。 |
| `processing` / `sending` | ワーカーがタスクを取得したか、チャネルへの送信を始めています。 |
| `sent` | チャネルが受け付けたか、運用担当者が確認して記録しました。 |
| `dead` | 明確な失敗や試行回数の上限などで処理が止まりました。原因を調べてから[再登録するか判断します](#recovery)。 |
| `unknown` | チャネルが受け取った可能性があります。先方の記録を照合してから[結果を登録します](#recovery)。 |
| `discarded` | 運用担当者が結果を確認して処理を終了しました。 |

#### 利用例：待機・失敗した通知の確認

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// dead のキュー項目を最大 20 件取得する。該当なしは空配列、読み取り失敗は 元の失敗結果を返す。
const entriesResult = await reach.queue.list({ status: 'dead', limit: 20 })
if (!entriesResult.success)
  return entriesResult
const entries = entriesResult.data
if (entries.length > 0) {
  // 先頭の一覧項目の queueId から現在の詳細を読む。項目がなければ null、読み取りエラーは失敗。
  const entryResult = await reach.queue.get(entries[0].queueId)
  if (!entryResult.success)
    return entryResult
  const entry = entryResult.data // current entry or null
}
```

結果は実際のキューによります。空配列は該当なし、get の null は番号が不存在です。番号は受付結果か一覧から取得します。

[引数と手順の詳細](reach.md#queue)

<a id="recovery"></a>

### 結果を確認して復旧する：`reach.queue`

応答を失ってもサービス側では送信済みの可能性があります。確認してから再送・完了の判断をします。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `reach.queue.requeueDead(queueId, options)` | 再試行が止まった通知を再登録 | `queueId: string` はキューのレコードから取得します。必須の `options.expectedUpdatedAt: number` には照会結果の `updatedAt` をそのまま渡します。 | `Promise<HaiResult<void>>` · 記録が変わっている場合は `SEND_FAILED` | `await reach.queue.requeueDead(queueId, retryDecision)` |
| `reach.queue.resolveUnknown(queueId, resolution)` | 不明な送信結果を確認 | `queueId: string` 送信結果またはキュー記録から取得した UUID。`resolution: ReachUnknownResolution` 確認済みの裁定が必須。[裁定項目](#reach-resolution-fields)を参照 | `Promise<HaiResult<void>>` | `await reach.queue.resolveUnknown(queueId, verifiedOutcome)` |

<a id="reach-resolution-fields"></a>

##### 復旧と確認結果の項目

| フィールド | 型 | 必須と既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `options.expectedUpdatedAt` | `number` | 必須 | `reach.queue.get(queueId)` の `updatedAt` をそのまま渡します。現在も `dead` で時刻が一致する場合に再登録します。[二人で同じ通知を操作する例](#detailed-workflow)を参照。 |
| `resolution.status` | `'sent' \| 'discarded'` | 必須 | 外部で確認した後に送信済みまたは破棄を記録します。 |
| `resolution.messageId` | `string` | 任意 | 送信済みと確認できた場合、最大 255 文字の事業者の受領 ID を記録できます。 |

#### 利用例：結果を確認して復旧する

入力は外部記録を確認した権限者の判断。古い送信処理を先に停止し、成功は保存された判断の反映のみを表します。

```ts
import type { ReachUnknownResolution } from '@h-ai/reach'

async function recordVerifiedDelivery(queueId: string, decision: ReachUnknownResolution) {
  // 渡されたキューの受付 ID で現在の項目を読む。存在しなければ null、unknown の場合だけ確認結果を登録する。
  const currentResult = await reach.queue.get(queueId)
  if (!currentResult.success)
    return currentResult
  const current = currentResult.data
  if (current?.status !== 'unknown')
    throw new Error('Expected an unknown delivery')
  // 確認済みの結論を指定した unknown 項目に記録する。再送は行わず、成功時にデータはない。状態の変化や無効な結論は失敗。
  const resolveUnknownResult = await reach.queue.resolveUnknown(queueId, decision)
  if (!resolveUnknownResult.success)
    return resolveUnknownResult
  // 確認結果を書いた後、同じ queueId を再読込して sent または discarded を確認する。再読込は独立して失敗し得る。
  const getResult = await reach.queue.get(queueId)
  if (!getResult.success)
    return getResult
  return getResult.data // status is sent or discarded
}
```

<a id="detailed-workflow"></a>

#### 利用例：原因を直して倉庫通知を再登録する

倉庫通知が試行回数の上限に達して `dead` になりました。倉庫の URL を直した後、二人の運用担当者が同じ記録を開きます。`reach.queue.get(queueId)` は `status: 'dead'` と `updatedAt: 1795478460000` を返します。どちらも見ていた `1795478460000` を `expectedUpdatedAt` に渡します。

一人目の操作が成功し、記録は `pending` に変わり、更新時刻も変わります。二人目が古い値で操作すると `SEND_FAILED` が返ります。再照会して現在の状態を表示します。再試行が失敗してまた `dead` になった場合も更新時刻は新しい値です。その回の失敗理由を確認してから、再登録するか判断します。

Unix ミリ秒の `updatedAt` を照会結果からそのままコピーします。`Date.now()` は現在時刻を返します。渡す値は担当者が照会した記録の更新時刻です。

```ts
async function restoreDead(queueId: string) {
  // 通知のキュー番号で状態と更新時刻を照会します。記録がなければ data は null です。
  const state = await reach.queue.get(queueId)
  if (!state.success)
    throw new Error(state.error.message)
  if (state.data?.status === 'dead' && state.data.updatedAt !== undefined) {
    // 照会した更新時刻を渡します。成功すると pending に戻り、記録が変わっていれば失敗します。
    const restored = await reach.queue.requeueDead(queueId, { expectedUpdatedAt: state.data.updatedAt })
    if (!restored.success)
      throw new Error(restored.error.message)
  }
}
```

再登録すると試行回数がゼロになり、元の `queueId` と再試行の待機設定を使います。以前の HTTP リクエストがまだ届く可能性がある場合は、受信側が元の番号で重複処理を防げるか先に確認します。`unknown` の記録は運用担当者が照合します。
