# @h-ai/reach

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/cache](../cache/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

メール・SMS・API 通知など複数の Provider を同時登録できる通知モジュールです。テンプレートと Provider の対応で用途に応じて配信します。通知抑制（DND）と設定ファイルによるテンプレート定義を備えます。

## 依存関係

- `@h-ai/reldb`：送信ログ・テンプレートの永続化（任意）。初期化済みなら自動有効化。
- `@h-ai/cache`：DND delay 用の分散ロック（任意）。初期化済みなら自動有効化。

## 対応 Provider

| Provider     | チャネル | 説明                                               |
| ------------ | -------- | -------------------------------------------------- |
| `console`    | 汎用     | コンソール出力（開発・テスト用）                   |
| `smtp`       | メール   | SMTP メール（nodemailer が必要）                   |
| `aliyun-sms` | SMS      | Alibaba Cloud SMS（HTTP API を直接使用、SDK 不要） |
| `api`        | 汎用     | HTTP API 通知（汎用 webhook）                      |

## クイックスタート

### インストール

```bash
pnpm add @h-ai/reach
```

メール送信には `nodemailer` をインストールしてください。

### 複数 Provider の初期化

```ts
import { cache } from '@h-ai/cache'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'

// 1. 初始化可选依赖（按需）
await reldb.init({ type: 'sqlite', database: './data.db' }) // 可选，启用发送日志与模板持久化
await cache.init({ type: 'memory' }) // 可选，启用 DND delay 策略分布式锁

// 2. 初始化触达模块（自动检测已初始化的 reldb/cache 单例）
await reach.init({
  providers: [
    { name: 'email', type: 'smtp', host: 'smtp.example.com', from: 'noreply@example.com' },
    { name: 'sms', type: 'aliyun-sms', accessKeyId: '...', accessKeySecret: '...', signName: '某某科技' },
    { name: 'webhook', type: 'api', url: 'https://api.example.com/notify' },
  ],
  templates: [
    { name: 'welcome_email', provider: 'email', subject: '欢迎 {userName}', body: '亲爱的 {userName}，欢迎！' },
    { name: 'sms_code', provider: 'sms', body: '验证码: {code}，{minutes} 分钟内有效。' },
  ],
  dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' },
})

// 通过 provider 字段选择发送渠道
await reach.send({
  provider: 'email',
  to: 'user@example.com',
  template: 'welcome_email',
  vars: { userName: '张三' },
})

// 发送短信（通过 extra 传递 Provider 特有参数）
await reach.send({
  provider: 'sms',
  to: '13800138000',
  extra: { templateCode: 'SMS_123456' },
  vars: { code: '123456' },
})

// 关闭所有 Provider
await reach.close()
```

`reach.config` は**機密情報をマスクした設定スナップショット**を返します。`api.url` / `endpoint` 内の認証情報、`headers.Authorization`、SMTP の `pass`、SMS の鍵などは自動的に非表示になります。

## 設定

### Console（開発・テスト用）

```ts
const config = { name: 'dev', type: 'console' }
```

### SMTP

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

### Alibaba Cloud SMS

| フィールド        | 型       | 必須 | 既定値                  | 説明                  |
| ----------------- | -------- | ---- | ----------------------- | --------------------- |
| `name`            | `string` | ✅   | —                       | Provider 名           |
| `type`            | `string` | ✅   | —                       | 固定値 `'aliyun-sms'` |
| `accessKeyId`     | `string` | ✅   | —                       | AccessKey ID          |
| `accessKeySecret` | `string` | ✅   | —                       | AccessKey Secret      |
| `signName`        | `string` | ✅   | —                       | SMS 署名              |
| `endpoint`        | `string` | —    | `dysmsapi.aliyuncs.com` | API endpoint          |

### API 通知

| フィールド | 型                       | 必須 | 既定値  | 説明                     |
| ---------- | ------------------------ | ---- | ------- | ------------------------ |
| `name`     | `string`                 | ✅   | —       | Provider 名              |
| `type`     | `string`                 | ✅   | —       | 固定値 `'api'`           |
| `url`      | `string`                 | ✅   | —       | HTTP(S) 通知 URL         |
| `method`   | `'POST' \| 'PUT'`        | —    | `POST`  | HTTP メソッド            |
| `headers`  | `Record<string, string>` | —    | —       | 独自のリクエストヘッダー |
| `timeout`  | `number`                 | —    | `10000` | タイムアウト（ミリ秒）   |

API 通知先は信頼できるサーバー設定です。ログには origin のみを記録し、URL 認証情報、クエリ、宛先、外部の失敗応答本文は残しません。テナント・ユーザー入力の URL にはアプリでドメインの allowlist を設け、企業環境では出口プロキシやネットワーク方針でも内部メタデータへの接続を防いでください。

### DND（通知抑制）

| フィールド | 型                     | 必須 | 既定値    | 説明                                    |
| ---------- | ---------------------- | ---- | --------- | --------------------------------------- |
| `enabled`  | `boolean`              | —    | `false`   | 有効化するか                            |
| `strategy` | `'discard' \| 'delay'` | —    | `discard` | discard：破棄 / delay：DND 終了後に送信 |
| `start`    | `string`               | —    | `00:00`   | 開始時刻（HH:mm）                       |
| `end`      | `string`               | —    | `00:00`   | 終了時刻（HH:mm）                       |

## エラー処理

すべての操作は `HaiResult<T>` を返します。エラーコードは `HaiReachError` で定義します：

| エラーコード                           | code            | 説明                     |
| -------------------------------------- | --------------- | ------------------------ |
| `HaiReachError.SEND_FAILED`            | `hai:reach:001` | 送信に失敗               |
| `HaiReachError.TEMPLATE_NOT_FOUND`     | `hai:reach:002` | テンプレートが存在しない |
| `HaiReachError.TEMPLATE_RENDER_FAILED` | `hai:reach:003` | テンプレート描画に失敗   |
| `HaiReachError.INVALID_RECIPIENT`      | `hai:reach:004` | 無効な宛先               |
| `HaiReachError.PROVIDER_NOT_FOUND`     | `hai:reach:005` | Provider が未登録        |
| `HaiReachError.DND_BLOCKED`            | `hai:reach:006` | DND により破棄           |
| `HaiReachError.DND_DEFERRED`           | `hai:reach:007` | DND により一時保留       |
| `HaiReachError.NOT_INITIALIZED`        | `hai:reach:010` | 未初期化                 |
| `HaiReachError.UNSUPPORTED_TYPE`       | `hai:reach:011` | 未対応の種類             |
| `HaiReachError.CONFIG_ERROR`           | `hai:reach:012` | 設定エラー               |

```ts
const result = await reach.send({ provider: 'email', to: 'user@example.com', body: 'hello' })
if (!result.success) {
  // result.error.code / result.error.message
}
```

## 分散ロック

複数ノードでは DND delay の保留メッセージの flush を `@h-ai/cache` の分散ロックで保護し、同時に 1 ノードのみが実行します。

- `cache.lock.acquire('reach:flush-pending')` を使用し、TTL は 300 秒。
- 保留レコードを一括で claim します。処理中レコードには期限があり、ノード異常終了後にほかのノードが引き継いで重複送信のリスクを抑えます。
- `@h-ai/cache` が未初期化なら分散ロックは自動無効化し、単一ノードで動作します。
- 安定したプロセス単位の owner 識別子で、ほかの所有者のロックの誤解除を防ぎます。

## テスト

```bash
pnpm --filter @h-ai/reach test
```

## License

Apache-2.0
