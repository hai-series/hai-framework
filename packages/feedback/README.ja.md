# @h-ai/feedback

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

[フレームワーク](../../README.ja.md)

ユーザーの問題報告と診断情報の収集、管理者への通知、一覧処理、オフライン問題パッケージの出力を提供します。説明は任意です。報告と構造化された証拠は関係データベースに、スクリーンショットなどは非公開オブジェクトストレージに保存します。別の telemetry サービスは不要です。

## クイックスタート

Core、RelDB、非公開 Storage を先に初期化します。通知に Reach を使う場合は Reach も先に初期化します。

アプリの起動時にモジュールを初期化します。送信関数は、信頼できるサーバーのコンテキストと、クライアントが送信ごとに生成する ID を受け取ります。

```ts
import type { FeedbackContext } from '@h-ai/feedback'
import { feedback } from '@h-ai/feedback'

// orders のフィードバックを構成。ローカル開発では console で受理状態を記録。
const initialized = await feedback.init({
  appId: 'orders',
  appVersion: '1.0.0',
  notificationMode: 'console',
  adminUrl: 'https://app.example.test/admin/feedback',
})
if (!initialized.success)
  throw new Error(initialized.error.message)

export async function submitFeedback(context: FeedbackContext, submissionId: string) {
  // 成功時は受付番号付きのレポートを返す。失敗時は呼び出し側が error を参照。
  return feedback.submit({ appId: 'orders', submissionId }, context)
}
```

終了時は `await feedback.close()` の結果を確認してから依存モジュールを閉じます。再試行では同じ `submissionId` を使います。

ブラウザーでの収集、HTTP ルート、添付の再試行は[機能リファレンス](../../docs/usage/function/feedback.md)（中国語）を参照してください。

## 設定一覧

生成プロジェクトは `config/_feedback.yml` を使用します。アプリで設定を取り込む入口は `feedback.init(config, options)` です。

設定の入口、既定値、指定できる値、反映の条件は[設定一覧](../../docs/usage/configuration/feedback.md)（中国語）を参照してください。

## 機能

使用例、入出力、エラー処理、利用上の注意は[機能リファレンス](../../docs/usage/function/feedback.md)（中国語）を参照してください。

- `init` / `close` / `isInitialized` / `config` / `budget` — 依存関係の構成と収集上限の取得
- `submit` / `uploadAttachment` / `getAttachment` / `appendEvidence` / `completeCollection` — 報告送信、添付の管理、非同期証拠の収集完了
- `list` / `get` / `getEvidence` / `setStatus` / `retry` / `runJobs` / `export` / `getExport` — 照会、処理、再試行、エクスポート
- `feedbackClient` / `bundle` / `capacitor` / `tauri` — 診断情報の収集、オフラインバンドルの確認、ネイティブファイルの保存

## データ構造

報告、証拠、バックグラウンドジョブ、添付、オフラインバンドル、ブラウザーの下書きについては[データ構造](../../docs/usage/data/feedback.md)（中国語）を参照してください。

## 開発とテスト

```sh
pnpm --filter @h-ai/feedback typecheck
pnpm --filter @h-ai/feedback lint
pnpm --filter @h-ai/feedback build
pnpm --filter @h-ai/feedback test
pnpm --filter @h-ai/cli test:scaffold-gates
# 上記の構築後、dist を再構築せず実 Chromium でオフライン表示・再生を確認します。
node packages/cli/tests/feedback-offline-browser.mjs
```

ブラウザー、SQLite/PG/MySQL、実際の S3/SMTP、複数インスタンス回復、ネットワーク切断時の表示をそれぞれ確認します。ビルドや mock の成功で代用しません。アプリの接続と配置は[利用ガイド](../../docs/usage/README.ja.md)を参照してください。

## ライセンス

Apache-2.0
