# @h-ai/reach API リファレンス

<!-- translation: partial -->

[原文（中国語）](reach.md) · [設定](../configuration/reach.ja.md) · [データ構造](../data/reach.ja.md)

<a id="quick-start"></a>

## クイックスタート

Reach と設定済みバックエンドを初期化します。プロバイダーと信頼できる宛先を指定して送信します。キュー配送を再試行するかは記録された状態から判断します。

```bash
pnpm add @h-ai/reach
```

```ts
import { core } from '@h-ai/core'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'

// RelDB を先に、その依存先として Reach を並べたランタイムを作る。戻り値から start と close を呼べる。
const runtime = core.module.createRuntime([
  {
    name: 'reldb',
    // テンプレートと通知状態の保存にインメモリ SQLite を起動する。成功時にデータはなく、DB の失敗で Reach の起動を止める。
    start: () => reldb.init({ type: 'sqlite', database: ':memory:' }),
    // Reach の終了後、引数なしで DB 接続を解放する。成功時の data は undefined。
    close: () => reldb.close()
  },
  {
    name: 'reach',
    // local コンソールチャネルと welcome テンプレートを用意する。成功後に送信可能になり、設定やテンプレートの保存失敗で起動を止める。
    start: () => reach.init({
      providers: [
        { name: 'local', type: 'console' }
      ],
      templates: [
        {
          name: 'welcome',
          provider: 'local',
          subject: 'Welcome',
          body: 'Hello {userName}'
        }
      ],
    }),
    // 引数なしで Reach を終了し、以降の送信を停止する。解放失敗はランタイムから報告される。
    close: () => reach.close()
  },
])
// 登録済みの手順を依存順に起動する。成功時の data は undefined、失敗時は起動済みの手順を解放してエラーを保持する。
const initialized = await runtime.start()
if (!initialized.success)
  throw new Error(initialized.error.message)

let result: Awaited<ReturnType<typeof reach.send>>
try {
  // welcome に Alice を渡し user@example.com 向けに Hello Alice を組み立て、local コンソールに渡す。即時成功の deferred は false または省略、描画・送信失敗はエラー。
  result = await reach.send({
    to: 'user@example.com',
    template: 'welcome',
    vars: { userName: 'Alice' }
  })
}
catch (error) {
  // Reach と SQLite を逆順に解放する。成功時にデータはなく、後片付けの失敗は別に報告する。
  const closed = await runtime.close()
  throw new AggregateError(closed.success
    ? [error]
    : [error, closed.error], 'Reach operation failed')
}
// Reach と SQLite を逆順に解放する。成功時にデータはなく、後片付けの失敗は別に報告する。
const closed = await runtime.close()
if (!closed.success) {
  throw new AggregateError(result.success
    ? [closed.error]
    : [result.error, closed.error], 'Reach cleanup failed')
}
if (!result.success)
  throw new Error(result.error.message)
```

```ts
const ready = reach.isInitialized // 无需参数，至少一个通知 Provider 已发布时为 true。
const activeConfig = reach.config // 无需参数，读取脱敏快照；关闭后为 null。
```

<a id="api-一覧"></a>

<a id="api-reference"></a>

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

モジュールの import は入門例と同じです。開始・終了の例以外は初期化成功後、終了前に実行します。各呼び出しで HaiResult.success を確認し、失敗時は元の結果を返して、成功時だけ data を読みます。関数宣言のない例はアプリの非同期業務関数内の断片です。独立したテストデータと明示した後片付けを使います。

<a id="sending"></a>

### 通知経路の起動と送信：`reach`

メール・SMS 経路を準備し、テンプレートと宛先を指定します。永続テンプレートとキューには RelDB が必要です。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `reach.init(config, options?)` | プロバイダーと、キューを使う場合の依存先を準備 | `config: ReachConfigInput`, `options?: ReachInitOptions` · [初期化オプション](#reach-init-options) | `Promise<HaiResult<void>>` | `await reach.init(config)` |
| `reach.close()` | サービスを停止してリソースを解放 | なし | `Promise<void>` | `await reach.close()` |
| `reach.send(message)` | 通知を送信・永続キューに追加 | 宛先と内容を含む `message: ReachMessage` が必須。[メッセージ項目](#reach-message-fields)を参照。 | `SendResult` | `await reach.send(message)` |

<a id="reach-message-fields"></a>

**ReachMessage**

| フィールド | 型 | 必須と既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `to` | `string` | 必須 | メールアドレスや電話番号など、チャネルの宛先。 |
| `template` | `string` | 任意 | レンダリングする保存済みテンプレート名。省略すると直接送信。 |
| `provider` | `string` | 直接送信で必須 | チャネル選択を上書き。テンプレート送信で省略するとテンプレートの事業者を使用。 |
| `vars` | `Record<string, string>` | 任意 | キーに対応するテンプレート変数を埋めます。 |
| `subject / body` | `string` | 任意 | 直接送信の件名と本文。件名はメールなどで使用。 |
| `extra` | `Record<string, unknown>` | 任意 | SMS テンプレートコードや署名など事業者固有の値を指定。 |
| `idempotencyKey` | `string` | 任意 | 直接 API 送信の受信側に安定したキーを渡します。キューでは queueId を使用。 |
| `sensitive` | `boolean` | `false` | 認証情報を送る場合は true。遅延や再送キューを使わずメモリ内で送信します。 |
| `expiresAt` | `number` | sensitive=true で必須 | 業務認証情報の期限を Unix ミリ秒で指定。 |
| `deferPolicy` | `'queue' \| 'reject'` | `queue` | 通常の通知が通知停止時間に当たると、queue は既存の遅延設定を使用。reject は DND_BLOCKED を返し、ホストで延期できます。 |

#### 利用例：通知経路の起動と送信

reach.send は送信先に接続する場合と、通常通知の待機番号を返す場合があります。機密情報を含む通知は本文なしの専用台帳を使い、遅延キューに入れません。

![通知：直接送信・待機・結果不明](../images/function-reach-delivery.ja.svg)

通常通知は許可されれば永続キューで待機し、reject 指定なら待機を拒否します。機密通知は通知禁止時間・期限切れ・結果不明で自動再送しません。送信先の受理は到達・既読ではなく、不明な結果は記録を照合してから回復します。

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// 保存済みの demo-welcome に Ada を差し込み demo@example.com に通知する。deferred ならキュー登録済みであり、テンプレート・チャネルの失敗は 元の失敗結果を返す。
const sentResult = await reach.send({ template: 'demo-welcome', to: 'demo@example.com', vars: { name: 'Ada' } })
if (!sentResult.success)
  return sentResult
const sent = sentResult.data
// sent: SendResult for this provider attempt, not proof that a person read the message
```

設定済みテンプレートとテスト経路を使います。外部サービスに送信する例です。init に業務データはなく、close は Promise<void> です。キューの受付は配信完了ではありません。

送信、テンプレート、キューの操作は HaiResult を返します。表は成功時のデータです。close に業務データはありません。

キューへの登録は受信の証明ではありません。結果不明の送信を照合する際は、プロバイダーの実際の結果を確認します。

未翻訳：送信結果の照合、失敗キューの復旧、本番での制約。[中国語の該当節](reach.md#detailed-workflow)を参照してください。

[引数と手順の詳細](reach.md#sending)

<a id="reach-init-options"></a>

#### 初期化オプション

[通知設定](../configuration/reach.ja.md)の `config: ReachConfigInput` は必須です。`options: ReachInitOptions` を省略すると、設定に記載したゲートウェイのヘッダーと本文を使います。

`gatewayHooks` はプロバイダー名とコールバックの対応表です。対象には `gateway` が設定された `aliyun-sms` プロバイダーを指定します。引数には `method: POST`、ゲートウェイの `url`、現在の本文 `body: string | undefined` と期限を伝える `signal: AbortSignal` が入ります。`{ headers?, body? }` を同期または非同期で返し、上書きする項目だけを指定できます。`undefined` を返すと設定済みの値を使います。処理はサーバーで実行し、署名付き URL はログに出さないでください。

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
| `reach.template.resolve(name)` | 有効なテンプレートを取得 | `name: string` テンプレート検索用の一意な名前 | `ReachTemplate` | `await reach.template.resolve(name)` |
| `reach.template.save(template)` | テンプレートを保存 | `template: ReachTemplate` name、provider、body が必須。メールの subject は任意。本文と件名に {var} を使用可能 | `void` | `await reach.template.save(template)` |
| `reach.template.saveBatch(templates)` | テンプレートを一括保存 | `templates: ReachTemplate[]` 一括保存するテンプレート配列。各項目は save と同じ | `void` | `await reach.template.saveBatch(templates)` |
| `reach.template.remove(name)` | 独自テンプレートを削除 | `name: string` テンプレート検索用の一意な名前 | `void` | `await reach.template.remove(name)` |
| `reach.template.list()` | 現在のテンプレートを列挙 | なし | `ReachTemplate[]` | `await reach.template.list()` |
| `reach.template.render(name, vars)` | 変数を置き換えてプレビュー | `name: string` テンプレート検索用の一意な名前。`vars: Record<string, string>` プレースホルダー名から置換値へのマップ | `RenderedTemplate` | `await reach.template.render(name, { code: '123456' })` |

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

mail というテスト Provider を先に設定します。name= Ada により Hello Ada を得ます。テンプレートの削除は送信済み内容を取り消しません。

[引数と手順の詳細](reach.md#templates)

<a id="queue"></a>

### 待機・失敗した通知の確認：`reach.queue`

待機キューの番号を保存し、状態や最終失敗の一覧を確認します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `reach.queue.get(queueId)` | ID で送信記録を取得 | `queueId: string` 送信結果またはキュー記録から取得した UUID | `ReachQueueEntry or null` | `await reach.queue.get(queueId)` |
| `reach.queue.list(options)` | 送信記録を絞り込みページ取得 | `options: ReachQueueListOptions` · [検索の引数](#reach-queue-options) | `Promise<HaiResult<ReachQueueEntry[]>>` | `await reach.queue.list({ status: 'unknown' })` |

<a id="reach-queue-options"></a>

`ReachQueueListOptions` は必須です。`status` には `dead` または `unknown` を指定します。`limit` は 1～100（既定 50）、`offset` はスキップする件数で 0～1,000,000（既定 0）です。

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
| `reach.queue.requeueDead(queueId, options)` | 確認後にデッドレターを再投入 | `queueId: string` はキューのレコードから取得します。必須の `options.expectedUpdatedAt: number` には最後に読み取った `updatedAt` を渡します。 | `Promise<HaiResult<void>>` | `await reach.queue.requeueDead(queueId, retryDecision)` |
| `reach.queue.resolveUnknown(queueId, resolution)` | 不明な送信結果を確認 | `queueId: string` 送信結果またはキュー記録から取得した UUID。`resolution: ReachUnknownResolution` 確認済みの裁定が必須。[裁定項目](#reach-resolution-fields)を参照 | `void` | `await reach.queue.resolveUnknown(queueId, verifiedOutcome)` |

<a id="reach-resolution-fields"></a>

**回復と裁定の項目**

| フィールド | 型 | 必須と既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `options.expectedUpdatedAt` | `number` | 必須 | dead の再キュー登録では最後に取得した updatedAt を使います。並行更新後は読み取り直します。 |
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
