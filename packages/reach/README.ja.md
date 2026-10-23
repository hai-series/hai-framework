# @h-ai/reach

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/cache](../cache/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

## 概要

メール・SMS・API 通知など複数の Provider を同時登録できる通知モジュールです。テンプレートと Provider の対応で用途に応じて配信します。通知抑制（DND）と設定ファイルによるテンプレート定義を備えます。

テンプレート送信は `template`、`to`、`vars` のみで利用でき、Provider はテンプレートから選ばれます。明示した `provider` は優先されます。直接送信は Provider が必須で、省略すると失敗 HaiResult を返します。

## 主な機能

| Provider     | チャネル | 説明                                               |
| ------------ | -------- | -------------------------------------------------- |
| `console`    | 汎用     | コンソール出力（開発・テスト用）                   |
| `smtp`       | メール   | SMTP メール（nodemailer が必要）                   |
| `aliyun-sms` | SMS      | Alibaba Cloud SMS（HTTP API を直接使用、SDK 不要） |
| `api`        | 汎用     | HTTP API 通知（汎用 webhook）                      |

## 使い始める

### 依存関係

- `@h-ai/reldb`：送信ログ・テンプレートの永続化。`dnd.enabled: true` と `strategy: delay` を使う場合は事前初期化とキューテーブルが必須で、利用できなければ `reach.init()` は `CONFIG_ERROR` を返します。それ以外の送信では任意です。
- `@h-ai/cache`：DND delay 用の分散ロック（任意）。初期化済みなら自動有効化。

### クイックスタート

#### インストール

```bash
pnpm add @h-ai/reach
```

メール送信には `nodemailer` をインストールしてください。

#### 複数 Provider の初期化

```ts
import { reach } from '@h-ai/reach'

const initialized = await reach.init({
  providers: [{ name: 'local', type: 'console' }],
  templates: [{ name: 'welcome', provider: 'local', subject: 'Welcome', body: 'Hello {userName}' }],
})
if (!initialized.success)
  throw new Error(initialized.error.message)
try {
  const result = await reach.send({
    to: 'user@example.com',
    template: 'welcome',
    vars: { userName: 'Alice' },
  })
  if (!result.success)
    throw new Error(result.error.message)
}
finally {
  await reach.close()
}
```

この例は開発用 Console Provider で送信メタデータを記録し、実メールや SMS は送りません。実送信には下記の SMTP・SMS・API を設定し、必要に応じて永続化と共有キャッシュを初期化してください。

`reach.config` は**機密情報をマスクした設定スナップショット**を返します。`api.url` / `endpoint` 内の認証情報、`headers.Authorization`、SMTP の `pass`、SMS の鍵などは自動的に非表示になります。

### 設定

#### Console（開発・テスト用）

```ts
const config = { name: 'dev', type: 'console' }
```

#### SMTP

| フィールド | 型        | 必須 | 既定値 | 説明                    |
| ---------- | --------- | ---- | ------ | ----------------------- |
| `name`     | `string`  | ✅   | —      | Provider 名             |
| `type`     | `string`  | ✅   | —      | 固定値 `'smtp'`         |
| `host`     | `string`  | ✅   | —      | SMTP サーバーのアドレス |
| `port`     | `number`  | —    | `465`  | SMTP ポート             |
| `secure`   | `boolean` | —    | `true` | TLS を使用するか        |
| `user`     | `string`  | —    | —      | 認証ユーザー名          |
| `pass`     | `string`  | —    | —      | 認証パスワード          |
| `from`     | `string`  | ✅   | —      | 送信元アドレス          |

#### Alibaba Cloud SMS

| フィールド        | 型       | 必須 | 既定値                  | 説明                  |
| ----------------- | -------- | ---- | ----------------------- | --------------------- |
| `name`            | `string` | ✅   | —                       | Provider 名           |
| `type`            | `string` | ✅   | —                       | 固定値 `'aliyun-sms'` |
| `accessKeyId`     | `string` | ✅   | —                       | AccessKey ID          |
| `accessKeySecret` | `string` | ✅   | —                       | AccessKey Secret      |
| `signName`        | `string` | ✅   | —                       | SMS 署名              |
| `endpoint`        | `string` | —    | `dysmsapi.aliyuncs.com` | API endpoint          |

#### API 通知

| フィールド   | 型                       | 必須 | 既定値  | 説明                                                       |
| ------------ | ------------------------ | ---- | ------- | ---------------------------------------------------------- |
| `name`       | `string`                 | ✅   | —       | Provider 名                                                |
| `type`       | `string`                 | ✅   | —       | 固定値 `'api'`                                             |
| `url`        | `string`                 | ✅   | —       | HTTP(S) 通知 URL                                           |
| `method`     | `'POST' \| 'PUT'`        | —    | `POST`  | HTTP メソッド                                              |
| `headers`    | `Record<string, string>` | —    | —       | 独自のリクエストヘッダー                                   |
| `timeout`    | `number`                 | —    | `10000` | タイムアウト（ミリ秒）                                     |
| `idempotent` | `boolean`                | —    | `false` | 受信側が副作用と重複排除を原子的に永続化する場合のみ有効化 |

API 通知先は信頼できるサーバー設定です。ログには origin のみを記録し、URL 認証情報、クエリ、宛先、外部の失敗応答本文は残しません。テナント・ユーザー入力の URL にはアプリでドメインの allowlist を設け、企業環境では出口プロキシやネットワーク方針でも内部メタデータへの接続を防いでください。

#### DND（通知抑制）

| フィールド | 型                     | 必須 | 既定値    | 説明                                    |
| ---------- | ---------------------- | ---- | --------- | --------------------------------------- |
| `enabled`  | `boolean`              | —    | `false`   | 有効化するか                            |
| `strategy` | `'discard' \| 'delay'` | —    | `discard` | discard：破棄 / delay：DND 終了後に送信 |
| `start`    | `string`               | —    | `00:00`   | 開始時刻（HH:mm）                       |
| `end`      | `string`               | —    | `00:00`   | 終了時刻（HH:mm）                       |

`delay` はデータベースへの挿入成功を確認した後だけ、`{ success: true, deferred: true, queueId }` を含む成功 `HaiResult` を返します。これはキューへの保存完了を表し、配信はまだ完了していません。受付 UUID は `hai_reach_send_log.queue_id` に保存され、同じ行の `status`（`pending` / `processing` / `sending` / `unknown` / `sent` / `discarded` / `dead`）で追跡できます。ストレージ未準備、切断、挿入失敗では deferred 成功を返さず、キューへの保存失敗は `SEND_FAILED` です。再起動後、同じデータベースに接続して同名 Provider を設定した別ノードが DND 時間外に配信を再開できます。即時送信後の任意ログの失敗によって、配信済みメッセージを失敗扱いにはしません。

```ts
const result = await reach.send(message)
if (!result.success)
  throw new Error(result.error.message)
if (result.data.deferred) {
  // 追跡用の受付 ID を保存します。配信はまだ完了していません。
  await savePendingReceipt(result.data.queueId)
}
```

キューの `created_at`、`updated_at`、`locked_until`、`next_attempt_at` は Unix ミリ秒を `BIGINT`（SQLite では 64 ビット `INTEGER`）として保存します。Reach リポジトリーは PostgreSQL などのドライバーが返す整数文字列を安全な整数の `number` に変換します。負数、小数、JS の安全整数範囲外の保存値は丸めずに `SEND_FAILED` を返します。テンプレートの作成・更新 `TIMESTAMP` は `Date` に対応します。デプロイ時に試行回数・退避設定・失敗分類を含むテーブル構造も更新してください。旧テーブルの自動移行は行いません。

#### 永続化された再試行設定

`queue` 設定は各メッセージの保存時に永続化され、再起動や別ノードの設定変更では既存の予算をリセットしません。

| 設定                    | 既定値    | 範囲                                  |
| ----------------------- | --------- | ------------------------------------- |
| `queue.maxAttempts`     | `5`       | 1–100、初回取得とクラッシュ復旧を含む |
| `queue.retryDelayMs`    | `60000`   | 初回退避、1000–86400000 ミリ秒        |
| `queue.maxRetryDelayMs` | `3600000` | 同じ範囲、retryDelayMs 以上           |

取得ごとに保存済み `attemptCount` を原子的に増やします。一時的失敗は `now + min(maxRetryDelayMs, retryDelayMs × 2^(attemptCount−1))` 以降に再取得でき、DND 外の毎分走査によって実際の送信はさらに遅れる場合があります。1 回の走査は最大 100 件で取得資格の時刻を固定するため、失敗したメッセージが同じ回を繰り返し占有しません。Provider 未設定・未接続、ネットワーク障害、HTTP 408/425/429/5xx は有限回再試行します。不正な保存 JSON と冪等 API の他の HTTP 4xx は直ちに `dead`、上限到達や最後の取得後のクラッシュも dead になります。冪等性のない配信中リクエストは残り回数によらず `unknown` に隔離します。

### エラー処理

すべての操作は `HaiResult<T>` を返します。エラーコードは `HaiReachError` で定義します：

| エラーコード                           | code            | 説明                     |
| -------------------------------------- | --------------- | ------------------------ |
| `HaiReachError.SEND_FAILED`            | `hai:reach:001` | 送信に失敗               |
| `HaiReachError.TEMPLATE_NOT_FOUND`     | `hai:reach:002` | テンプレートが存在しない |
| `HaiReachError.TEMPLATE_RENDER_FAILED` | `hai:reach:003` | テンプレート描画に失敗   |
| `HaiReachError.INVALID_RECIPIENT`      | `hai:reach:004` | 無効な宛先               |
| `HaiReachError.PROVIDER_NOT_FOUND`     | `hai:reach:005` | Provider が未登録        |
| `HaiReachError.DND_BLOCKED`            | `hai:reach:006` | DND により破棄           |
| `HaiReachError.NOT_INITIALIZED`        | `hai:reach:010` | 未初期化                 |
| `HaiReachError.UNSUPPORTED_TYPE`       | `hai:reach:011` | 未対応の種類             |
| `HaiReachError.CONFIG_ERROR`           | `hai:reach:012` | 設定エラー               |
| `HaiReachError.DELIVERY_REJECTED`      | `hai:reach:020` | API による恒久的な拒否   |

```ts
const result = await reach.send({ provider: 'email', to: 'user@example.com', body: 'hello' })
if (!result.success) {
  // result.error.code / result.error.message
}
```

### 分散ロック

任意のキャッシュロックは重複走査を減らすためのもので、300 秒後には複数ノードが走査できます。正しさはデータベースの配信状態で保証します。1 回に最大 100 件を 1 件ずつ取得し、外部呼び出し前に有効な owner/lease を原子的に確認して sending を保存します。配信中はリース期間の 3 分の 1 ごとに更新し、期限切れ owner の復活・再送・結果確定を拒否します。DND 時間外は毎分復旧を試みます。

- 状態は `pending → processing → sending → sent`。期限切れ processing は安全に再取得できます。
- `idempotent: true` の API のみ配信中リクエストを自動再試行します。これは受信側の能力宣言です。各試行の `Idempotency-Key` ヘッダーと `idempotencyKey` 本文は永続化された queueId を使い、受信側が重複排除と副作用を原子的に確定する必要があります。古い worker の遅延復帰も保持期間に含め、最大遅延を限定できない場合は重複排除レコードを失効させないでください。同名 Provider は同じ送信先と重複排除ストアを使います。
- SMTP、Aliyun SMS、既定の API には外部冪等性の保証がありません。sending 開始後の失敗・例外・リース喪失は結果不明として扱い、期限切れは unknown に隔離して自動再送しません。未接続 Provider は保存済み退避設定に従い、不正な保存 JSON は外部呼び出し前に dead へ移します。Console は開発用メタデータのみを出力します。
- リース更新、owner 条件、キャンセルでは既に開始した外部副作用を取り消せません。汎用の exactly-once は保証しません。

### 結果不明の手動確認

信頼されたサーバー管理処理で `reach.queue.get(queueId)` を使い、宛先や本文を含まない `pending / processing / sending / unknown / sent / discarded / dead` 状態を確認します。unknown は古い worker を停止・隔離し、外部の配信記録と照合してから sent または discarded に裁定します。UUID・状態の検証と条件付き更新により並行裁定は 1 件だけ成功し、再送はしません。discarded は開始済みリクエストを取り消しません。補充送信は古いリクエストが今後作用しないことを確認した後だけ行ってください。

```ts
const state = await reach.queue.get(queueId)
const resolved = await reach.queue.resolveUnknown(queueId, { status: 'sent', messageId: verifiedMessageId })
if (!resolved.success)
  throw new Error(resolved.error.message)
```

### デッドレターの照会と復元

信頼されたサーバー管理処理で `reach.queue.list({ status: 'dead', limit: 50, offset: 0 })` を使用します。unknown も照会でき、1 ページ最大 100 件、offset 上限は 1000000 です。get/list は status、attemptCount、maxAttempts、nextAttemptAt、lastFailure、updatedAt のみを返し、宛先・本文・owner 資格情報は含みません。原因を修復後、最新 dead を読み直して条件付きで復元します。

```ts
const state = await reach.queue.get(queueId)
if (!state.success)
  throw new Error(state.error.message)
if (state.data?.status === 'dead' && state.data.updatedAt !== undefined) {
  const restored = await reach.queue.requeueDead(queueId, { expectedUpdatedAt: state.data.updatedAt })
  if (!restored.success)
    throw new Error(restored.error.message)
}
```

一致する dead バージョンのみ復元し、並行・古い要求は失敗、unknown は復元できません。回数をリセットしますが queueId・保存済み設定・受信側の冪等性要件は保持します。dead は自動処理の停止を意味し、副作用がなかった証明にはなりません。古い冪等 API 要求が遅れて届く可能性があるため、復元前にも受信側の永続的な重複排除を確認してください。修復不能なペイロードは dead に残して調査し、復元だけで内容が直るとは考えないでください。

## 開発とテスト

```bash
pnpm --filter @h-ai/reach test
```

`tests/reach-repository-send-log-databases.test.ts` は Testcontainers で隔離した PostgreSQL 16.15 / MySQL 8.4.11 を起動し、終了後に削除します。利用可能な Docker API が必要です。Podman では `DOCKER_HOST` を互換ソケットに向け、rootless 環境では Testcontainers の要件に従って `TESTCONTAINERS_RYUK_DISABLED=true` を設定してください。

## 本番の共有状態

本番は console を拒否し、実際の SMTP・SMS・API サービスを必要とします。ログ書込は配信完了ではありません。冪等でないサービスの未知結果は照合が必要で、exactly-once は保証しません。 NODE_ENV または HAI_CORE_ENV が production の場合、初期化成功前に検証します。明示的な HAI_E2E=1/HAI_E2E_MOCK=1 テストのみ除外します。 [状態・並行制御・復旧範囲（中国語）](../../docs/distributed-state.md)。

## ライセンス

Apache-2.0
