# @h-ai/reach

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[フレームワークのホーム](../../README.ja.md) · 関連モジュール：[@h-ai/cache](../cache/README.ja.md) · [@h-ai/core](../core/README.ja.md) · [@h-ai/reldb](../reldb/README.ja.md)

メール・SMS・API 通知など複数の Provider を同時登録できる通知モジュールです。テンプレートと Provider の対応で用途に応じて配信します。通知抑制（DND）と設定ファイルによるテンプレート定義を備えます。

## クイックスタート

### 依存関係

- `@h-ai/reldb`：送信ログ・テンプレートの永続化。空でない `templates` または DND delay を設定する前に初期化します。テンプレートの保存や必須テーブルの準備に失敗した場合、`reach.init()` は候補 Provider を閉じて `CONFIG_ERROR` を返します。テンプレート・延期キューを使わない即時送信では任意です。
- `@h-ai/cache`：DND delay 用の分散ロック（任意）。初期化済みなら自動有効化。

#### インストール

```bash
pnpm add @h-ai/reach
```

メール送信には `nodemailer` をインストールしてください。

#### 複数 Provider の初期化

```ts
import { core } from '@h-ai/core'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'

const runtime = core.module.createRuntime([
  {
    name: 'reldb',
    start: () => reldb.init({ type: 'sqlite', database: ':memory:' }),
    close: () => reldb.close()
  },
  {
    name: 'reach',
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
    close: () => reach.close()
  },
])
const initialized = await runtime.start()
if (!initialized.success)
  throw new Error(initialized.error.message)

let result: Awaited<ReturnType<typeof reach.send>>
try {
  result = await reach.send({
    to: 'user@example.com',
    template: 'welcome',
    vars: { userName: 'Alice' }
  })
}
catch (error) {
  const closed = await runtime.close()
  throw new AggregateError(closed.success
    ? [error]
    : [error, closed.error], 'Reach operation failed')
}
const closed = await runtime.close()
if (!closed.success) {
  throw new AggregateError(result.success
    ? [closed.error]
    : [result.error, closed.error], 'Reach cleanup failed')
}
if (!result.success)
  throw new Error(result.error.message)
```

この例は開発用 Console Provider で送信メタデータを記録し、実メールや SMS は送りません。実送信には下記の SMTP・SMS・API を設定し、必要に応じて永続化と共有キャッシュを初期化してください。

`reach.config` は**機密情報をマスクした設定スナップショット**を返します。`api.url` / `endpoint` 内の認証情報、すべてのカスタムヘッダー値、SMTP の `pass` と SMS の鍵を隠します。ゲートウェイ本文は含めません。デプロイはヘッダー名に依存せず、API ヘッダー全体を非公開の環境ファイルに保存します。

Provider の失敗では HTTP ステータスを含む完全なモジュールエラー定義を保持します。SMTP/SMS の生の応答は返却メッセージや cause に含めず、利用者には翻訳済みの案内、サーバーログには診断情報を残します。

テンプレート送信は一つのスナップショットから件名・本文・既定 Provider を決め、並行編集による異なる版の混在を防ぎます。明示的な `provider` は従来どおり優先します。

## 設定一覧

生成プロジェクトは `config/_reach.yml` を使用します。アプリで設定を取り込む入口は `reach.init(config)` です。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/reach.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/reach.md)（中国語）を参照してください。

- `init` / `close` / `config` / `isInitialized` — 通知プロバイダーとキューの開始・停止
- `send` / `template` — メール、SMS、API 通知の送信とテンプレートのレンダリング
- `queue` — 送信結果、デッドレター、結果不明の配信を確認

## データ構造

通知ジョブ、結果、デッドレター、冪等性レコード、共有ロックについては[データ構造](../../docs/usage/data/reach.md)（中国語）を参照してください。

## 開発とテスト

```bash
pnpm --filter @h-ai/reach test
```

`tests/reach-repository-send-log-databases.test.ts` は Testcontainers で隔離した PostgreSQL 16.15 / MySQL 8.4.11 を起動し、終了後に削除します。利用可能な Docker API が必要です。Podman では `DOCKER_HOST` を互換ソケットに向け、rootless 環境では Testcontainers の要件に従って `TESTCONTAINERS_RYUK_DISABLED=true` を設定してください。

## ライセンス

Apache-2.0
