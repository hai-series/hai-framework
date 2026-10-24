# @h-ai/feedback

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

[フレームワーク](../../README.ja.md)

## 概要

ユーザーの問題報告と診断情報の収集、管理者への通知、一覧処理、オフライン問題パッケージの出力を提供します。説明は任意です。報告と構造化された証拠は関係データベースに、スクリーンショットなどは非公開オブジェクトストレージに保存します。別の telemetry サービスは不要です。

## 主な機能

- ブラウザーとサーバーのログ、リクエスト、操作、バージョン、許可された環境情報を上限付きで収集します。既定ではエラーの前後それぞれ最大100件です。
- トランザクションによる受理、提出と証拠の冪等性、checksum 検証、処理・収集・通知状態の分離、永続ジョブとリース回復。
- Storage の S3 と Reach の SMTP を再利用します。初版は Reach DND を無効にし、feedback だけが通知再試行を管理します。
- スクリーンショット、復元不能なマスク、注釈、任意の rrweb 記録、再試行とローカル出力。UI は `FeedbackModal`、`FeedbackList`、`FeedbackDetail` を提供します。
- 自己完結 ZIP、SHA-256 検証、オフライン表示、証拠のページ検索。運用認証情報は含めません。

## はじめに

core、reldb、storage、reach を初期化し、各結果を確認してから feedback を初期化します。本番は共有 PostgreSQL/MySQL、非公開 S3、実際の SMTP を使用します。接続と秘密情報はアプリケーションが管理します。開発用 Console 通知は実際のメール配信の証明にはなりません。

依存モジュール初期化済みの非同期関数内の例です。context は信頼できるサーバー認証・認可から取得します。

```ts
import { feedback } from '@h-ai/feedback'

const initialized = await feedback.init({
  appId: 'orders',
  appVersion: '1.0.0',
  recipients: ['admin@example.test'],
  notificationProvider: 'email',
  adminUrl: 'https://app.example.test/admin/feedback',
})
if (!initialized.success)
  return initialized
const context = { scopeId: 'tenant-1', userId: 'user-1', permissions: ['feedback:create'] }
const submitted = await feedback.submit({ appId: 'orders', submissionId: 'stable-client-operation' }, context)
if (!submitted.success)
  return submitted
return submitted
```

終了時は `await feedback.close()` を確認した後で reach/storage/reldb を閉じます。再試行では同じ提出IDを使います。番号の発行は永続受理を示し、資料収集やメールの完了とは別です。

`@h-ai/serv/features/feedback` の `createFeedbackProcedures({ feedback, resolveContext })` を `apiContract.feedback` と組み合わせます。ホストは信頼できる scope、user、permissions を返します。一般ユーザーは自身の資料だけを追加でき、管理者向け read/process/reopen/export 権限と資料・添付の範囲をサーバーでも検証します。

範囲、ユーザー、アプリと証拠の識別子は文字列を厳密に比較します。MySQL の大小文字・アクセント・末尾空白の照合規則でも範囲を混同しません。添付 ID は元の値と大小文字を保ち、有効な Unicode の1〜128文字を受け付けます。ZIP 内のパスはダイジェストから生成するため、IDや表示名から推測せず manifest を参照してください。対応しないサロゲートは受理前に拒否します。

ブラウザーは `/client` の `createFeedbackClient()` を使用し、`init({ appId, actions })` に型付きAPI操作を渡します。モーダルを開く前に `prepare()` で現場を固定し、`submit()` 後も flush でアップロードを継続します。`close()` は記録器とイベントを解除します。Cookie の許可リスト、下書き永続化、再生記録は明示的な製品方針で有効化し、認証値は常に除外します。

ブラウザーとサーバーは共通のテキスト秘匿処理を使い、一般的な認証キー、JSON・エスケープされた JSON、Bearer/Basic の値を隠します。保存資料、API、オフライン ZIP でも同じ結果を維持します。業務固有の機密情報はホスト側の許可リストと機密 DOM マーカーで指定してください。

クライアントの全操作は `init(config)`、`prepare/submit/flush/record/getDraft/annotate/addFiles/exportDraft(input?)/close` です。フォームの `onfileschange` を `addFiles` に接続し、下書きの添付プレビューを更新すると、追加画像を送信前に注釈・遮蔽・削除できます。重要操作は `data-feedback-action`、機密部分は `data-feedback-private`、フィードバック画面自体の除外は `data-feedback-ignore` で指定します。初回送信後の内容は固定され、再試行中の入力変更は競合として入力を保持し、ローカル保存できます。

`annotate(id, annotation)` の座標単位は、ブラウザーでデコードした元画像のピクセルです。UI の `FeedbackAnnotation.rect` は 0–1 の比率なので、`Image.decode()` 後に x/width を `naturalWidth`、y/height を `naturalHeight` と掛け合わせて SDK に渡します。CSS の表示サイズではなく元画像の寸法を使うことで、JPEG の向きを SDK のデコードと一致させます。オブジェクト URL は作成元が置換時または破棄時に解放します。

`captureConsole` と `persistDraft` の既定値は false です。永続化にはホストが決定する非認証情報のユーザー/テナント `persistenceKey` が必要です。`keyScreenshots` は既定で true ですが `screenshot` 全体スイッチに従います。`maxKeyScreenshots` は既定 3、上限 5、`keyScreenshotThrottleMs` は既定 10000 ミリ秒です。

自動画像は機密部分を隠したクローン DOM から SVG foreignObject を通して可視ページを再構築します。クロスオリジン画像、iframe/video、未準備のネットワークフォントは欠落する場合があります。ブラウザーや CSP 制限による失敗は missing として記録され、画像の手動添付も利用できます。

### 一覧、処理、出力

`list/get/getEvidence` は認可された報告・詳細・証拠ページを返します。`setStatus({ id, status, expectedVersion }, context)` で処理と取り消しの競合を防ぎます。`retry` は回復可能な操作のみ再登録します。`export` は証拠の版を固定し、`getExport` は完成済みZIPを返します。欠落や切り捨ては明示され、ページ再生は業務処理の再実行ではありません。

`getExport` は最初に範囲と `feedback:export` 権限を検証します。有効なスナップショットの `pending/running` は `CONFLICT`（409、生成中）を返し、クライアントはこの状態だけを上限付きでポーリングします。`failed` は `OPERATION_FAILED`（500）を返し、失敗を表示して管理者が `retry` を判断します。存在しないタスク、別の報告に属するタスク、未完成で期限切れのスナップショットは `NOT_FOUND`（404）、権限不足は `FORBIDDEN`（403）です。現在の版の生成期限が切れた場合は `export` を再実行できます。完成済みZIPの取得時はストレージの読取結果と checksum を引き続き検証します。

`errorId` 検索はアンカーのソース、リクエスト、連番を基準に前後最大100件のログを選びます。重複するエラー窓でも初回の errorId 帰属に依存せず各アンカーを保持します。期限切れでは報告、証拠、添付、履歴、スナップショットを含むジョブと孤立アップロードを削除します。その後はオブジェクト接頭辞と24時間期限だけの墓標で遅延オブジェクトを再清掃し、墓標も削除します。清掃失敗は再試行を継続します。

### オフラインコマンド

```sh
hai feedback summary feedback-FB-1.zip
hai feedback inspect feedback-FB-1.zip
hai feedback evidence feedback-FB-1.zip --request-id req-1 --page 1 --page-size 20
hai feedback view feedback-FB-1.zip
```

表示サービスは loopback のランダムURLだけで待機し、内蔵の信頼済みコードを使います。Ctrl+Cで終了します。`/bundle` の作成・読込・要約・検索関数はサーバー初期化や本番接続なしで利用できます。

### 設定とエラー

`FeedbackConfigSchema` は appId、recipients、notificationProvider、adminUrl、collectionTimeoutMs、workerIntervalMs、leaseMs、maxAttempts、retentionDays、envAllowlist と資料の容量を検証します。YAML の環境参照は `HAI_FEEDBACK_*` を使い、ブラウザーへ SMTP/S3 の秘密を公開しません。

各業務結果の `success` を確認してください。`HaiFeedbackError` は初期化、設定、権限、存在しない記録、競合、容量、checksum エラーを表します。HTTP 200やSMTP受理だけでは、業務成功や受信箱への配信を証明できません。不確実な送信は重複する可能性があります。

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

ブラウザー、SQLite/PG/MySQL、実際の S3/SMTP、複数インスタンス回復、ネットワーク切断時の表示をそれぞれ確認します。ビルドや mock の成功で代用しません。[設計](../../docs/feedback-module-design.md)と[タスク](../../docs/feedback-tasks.md)を参照してください。

## ライセンス

Apache-2.0
