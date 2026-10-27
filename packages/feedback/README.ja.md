# @h-ai/feedback

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

[フレームワーク](../../README.ja.md)

## 概要

ユーザーの問題報告と診断情報の収集、管理者への通知、一覧処理、オフライン問題パッケージの出力を提供します。説明は任意です。報告と構造化された証拠は関係データベースに、スクリーンショットなどは非公開オブジェクトストレージに保存します。別の telemetry サービスは不要です。

## 主な機能

- ブラウザーとサーバーのログ、リクエスト、操作、バージョン、許可された環境情報を上限付きで収集します。既定ではエラーの前後それぞれ最大100件です。
- トランザクションによる受理、提出と証拠の冪等性、checksum 検証、処理・収集・通知状態の分離、永続ジョブとリース回復。
- `notificationMode` は独立して選択できます。`disabled` は通知ジョブなし、`console` は本番でも既定でメタデータだけを出力し Reach/メール不要（consoleContent: summary で一般的なマスキング済み概要を明示）、`reach` は任意の Provider と宛先を使い、このモードのみ recipients が必要です。既定の `reach` は既存設定を維持し、生成プロジェクトは `console` を明示します。Reach DND 中は feedback 自身の outbox で待機し、二重の遅延キューや他通知の方針変更を行いません。本番 Reach Console の制限は維持します。sent はチャネル受付であり受信完了を意味しません。
- スクリーンショット、復元不能なマスク、注釈、任意の rrweb 記録、再試行とローカル出力。UI は `FeedbackModal`、`FeedbackList`、`FeedbackDetail` を提供します。
- 自己完結 ZIP、SHA-256 検証、オフライン表示、証拠のページ検索。運用認証情報は含めません。

## はじめに

ブラウザーとサーバーには各実成果物の `appVersion/buildId/commit` を渡します。フロント側は自分の識別情報を保持し、同じ SSR ビルドの client/server 出力は buildId を共有します。管理画面と base/API/fullstack テンプレートにはコンパイル時の識別情報を組み込んでいます。`hai build` は内部で識別情報を生成し、Docker のビルド引数にも渡します。バージョンは各対象の package.json から取得し、所属する Git コミットがない場合は `unknown` を記録します。テンプレートの `build-metadata.json` には同じ三つの非機密項目のみを保存します。

core、reldb、非公開 storage の後に feedback を初期化します。Reach は reach 通知モードのみ必要です。本番は共有 DB と非公開ストレージを使用し、接続認証情報はホストが管理します。

依存モジュール初期化済みの非同期関数内の例です。context は信頼できるサーバー認証・認可から取得します。

```ts
import { feedback } from '@h-ai/feedback'

const initialized = await feedback.init({
  appId: 'orders',
  appVersion: '1.0.0',
  notificationMode: 'console',
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

`text/plain` 添付は 5 MiB のファイル上限内で全文を秘匿処理し、安全な本文と末尾のログを保持します。構造化証拠のフィールド切り捨ては適用しません。上限を超える元ファイルは読取前に拒否し、秘匿処理後も同じ添付バイト上限を適用します。JSON 添付と構造化証拠には文字列長・深さ・件数の上限が残り、切り捨てられる場合があります。完全なログにはプレーンテキスト添付を使用してください。送信前の添付と、初回送信内容の固定後にローカル出力へ追加したファイルに同じ規則を適用します。

クライアントの全操作は `init(config)`、`prepare/captureScreenshot(attachmentId?)/submit/flush/record/getDraft/getView/annotate/addFiles/exportDraft/saveDraft/close` です。フォームの `onfileschange` を `addFiles` に接続し、下書きの添付プレビューを更新すると、追加画像を送信前に注釈・遮蔽・削除できます。重要操作は `data-feedback-action`、機密部分は `data-feedback-private`、フィードバック画面自体の除外は `data-feedback-ignore` で指定します。初回送信後の内容は固定され、再試行中の入力変更は競合として入力を保持し、ローカル保存できます。

`addFiles` は一括追加を原子的に行い、全ファイルの検証に成功してから統合します。一つでも失敗した場合、既存の添付と欠落マーカーを維持し、一部だけを保存しません。並行して成功した追加を上書きせず、統合後も最大 20 件です。読取中に下書きが変わるか初回送信内容が固定された場合は `CONFLICT` を返し、送信内容に含まれない添付を後から隠れてアップロードしません。

ローカル添付は PNG/JPEG/WebP、WebM/MP4、TXT/LOG、JSON、PDF、ZIP/GZIP に対応します。MIME が空または `application/octet-stream` の場合は対応する拡張子で補い、一般的な MIME 別名も正規化します。サーバーは実際のバイトとチェックサムを引き続き検証し、未対応形式には具体的な案内を表示します。通常の入力欄は背景と枠を保持し、値だけを固定マスク文字に置き換えます。パスワード、`data-feedback-private`、`.rr-block`、`.rr-mask` は全面を遮蔽します。撮影用クローンだけを変更し、元の画面と入力値は保持します。

`annotate(id, { ...rect, mode, coordinateSpace: 'ratio' })` は UI の 0–1 座標を直接受け取り、SDK がデコード後の元画像サイズで換算します。小数、1% 未満、逆方向、端や CSS 拡大縮小に対応します。省略時は従来のピクセル座標です。`getView()` がプレビュー URL を管理し、置換・削除・終了時に解放するため、ホストの画像デコードや URL 管理は不要です。

並行 `init` は `INIT_IN_PROGRESS` を返します。`close` は時間制限付き画面取得の終了後にセッションを解放します。取得中の終了は `prepare` を失敗させ、草稿を復活させません。送信、終了、画像削除、別の注釈更新後に完了した注釈は `CONFLICT` を返し、送信済みバイト列と checksum を変更しません。

下書きは SDK が保持し、`annotate` や `addFiles` で更新します。Svelte 側では参照を `$state.raw<FeedbackDraft>()` に保持し、操作成功後に `getDraft()` から添付ビューを更新してください。深い `$state` プロキシに格納すると、SDK が元の下書きの画像バイトを置き換えても、キャッシュされた古いバイトが返る場合があります。

`maxTotalBytes` の既定値は 32 MiB（4–40 MiB）です。`feedback.budget` から単一・合計添付、二重保存する証拠と Base64/暗号化転送の上限を導出します。既定は各 5 MiB、添付合計 22 MiB、証拠 4 MiB/2000 件、履歴・メタデータ・ビューアー用 2 MiB です。受理前に添付宣言の合計を検証し、証拠更新は原子的に制限、処理履歴は 256 KiB までです。認証済み `reports.policy({})` でクライアントとフォームに有効値を渡します。管理画面、API/fullstack テンプレートとデプロイは `resolveTransportBodyLimits(explicitLimit, { requiredPlaintextBytes: feedback.budget.maxTransportBytes })` で明示上限と必要量を合わせ、転送、adapter-node、プロキシに同じ導出値を適用します。明示上限不足はエラーとなり、省略/auto の場合のみ自動導出します。独自ホストでも初期化時に同じ処理を行ってください。`hai add` は既存設定を維持します。

`captureConsole` と `persistDraft` の既定値は false です。永続化にはホストが決定する非認証情報のユーザー/テナント `persistenceKey` が必要です。`keyScreenshots` は既定で true ですが `screenshot` 全体スイッチに従います。`maxKeyScreenshots` は既定 3、上限 5、`keyScreenshotThrottleMs` は既定 10000 ミリ秒です。

自動画像は機密部分を隠したクローン DOM から SVG foreignObject を通して可視ページを再構築します。クロスオリジン画像、iframe/video、未準備のネットワークフォントは欠落する場合があります。ブラウザーや CSP 制限による失敗は missing として記録され、画像の手動添付も利用できます。

### フィードバック収集と配布確認

現在のページ画像を先頭に表示します。`captureScreenshot(attachmentId?)` は現在のページを追加し、IDを渡すと既存画像を置換します。`FeedbackModal.oncapture` に接続すると、入力を保持して画面を閉じ、ページを切り替えて撮影できます。`FeedbackForm.evidence` は脱敏済みログ、リクエスト、環境と操作記録を展開表示し、`evidenceSummary` は不足理由を補足します。ブラウザー環境は実際のURL（クエリとhashを除外）、画面、言語とビルドから取得します。サーバーは `envAllowlist` の非認証情報だけを収集し、未設定値は null です。

対応ブラウザーでは「画面録画 → 録画を開始」からタブやウィンドウを選択し、最大60秒 / 5 MiBの無音動画を低フレームレート・低ビットレートで録画できます。共有停止、取消、時間切れとコンポーネント破棄でストリームを解放します。動画は選択した画面そのもので自動マスクされません。送信前に確認・削除できます。WebM/MP4も非公開保存、チェックサムと5 MiB制限に従い、非対応環境では動画ファイルを添付できます。

管理台とfeedback有効のfullstackテンプレートは `replay: true` を明示し、SDKの既定は無効のままです。管理者は詳細の「ページ再生」で操作を再生・移動できます。宿主の `onreplay` は `kind: replay` の全ページを取得してください。未記録時は理由を表示し、録画は操作と添付で確認できます。ローカル保存後は `hai feedback view <zip>` で画像、録画と操作を表示できます。未取得のサーバー資料は不足として記録します。

`saveDraft(input?)` は Web ダウンロード、Tauri 保存ダイアログ、Capacitor のキャッシュ/ネイティブ共有を統一します。取消は `status: 'cancelled'`、失敗は失敗として返します。ネイティブプラグインは optional peer で、生成 App/Desktop に依存と権限を設定済みです。独自ホストは対応プラグインを導入してください。`createFeedbackReview(typedClient.feedback.reports)` は `loadReplay(id)` と取消可能な `exportReport(id)` を提供します。ログアウト時は `review.close()` と `client.close({ discard: true })` で収集・ポーリング、プレビューと永続草稿を終了・削除します。

ビルド識別子は一律 128 文字までです。明示した無効な HAI_BUILD_ID/HAI_BUILD_COMMIT は値を再表示せずビルドで拒否します。verificationCode、otpCode などを既定で脱機密化し、すべての業務 code を隠すことはしません。

サーバーポリシー取得失敗時も有界のローカル収集・出力を継続し server-policy-unavailable を示します。オンライン送信前に再確認します。addFiles(files, removedAttachmentIds?) は旧添付削除と追加を原子的に処理し、表示と実容量を一致させます。

console/disabled は Reach パッケージ不要です。reach モードは optional peer の @h-ai/reach を明示導入・初期化します。認証通知は生成 receiptId のみを返し、Provider messageId を保存・返却しません。

Web クライアントは原生プラグインを解決・導入しません。独自ホストは @h-ai/feedback/tauri の saveTauriFeedbackFile または @h-ai/feedback/capacitor の saveCapacitorFeedbackFile を読み込み、起動時に configureFeedbackSaving(saver) を呼びます。生成工程には接続済みで、業務コードはネイティブファイルの管理を行いません。

### 業務証拠の拡張

`feedback.init(config, { collectEvidence })` にサーバー側の収集関数を登録します。受付コミット後に永続 collect タスクが同期・非同期の戻り値を待機するため、送信リクエストは業務ログの生成を待ちません。同じ appId を処理する全インスタンスに同じ関数を登録し、再起動・引き継ぎ後も復旧できるようにします。

以下は依存モジュール初期化後の例です。config はホストが読み込んだ FeedbackConfigInput、diagnostics/sanitized-logs.zip は業務側で事前に生成・秘匿化したファイルです。実際には関数内で独自のログ収集処理を await できます。

```ts
import type { FeedbackConfigInput } from '@h-ai/feedback'
import { readFile } from 'node:fs/promises'
import { feedback } from '@h-ai/feedback'

async function startFeedback(config: FeedbackConfigInput) {
  const result = await feedback.init(config, {
    collectEvidence: async ({ report, signal }) => ({
      text: `Diagnostics for ${report.number}`,
      data: { businessSystem: 'orders', scopeId: report.scopeId },
      attachments: [{
        id: 'business-logs',
        name: 'business-logs.zip',
        contentType: 'application/zip',
        bytes: await readFile('diagnostics/sanitized-logs.zip', { signal }),
      }],
    }),
  })
  if (!result.success)
    return result
  return result
}
```

text/data は source: server:business、kind: business の証拠として詳細の「業務情報」タブにページ表示され、添付ファイルは認可付きダウンロードとオフライン出力に含まれます。短文・JSON は既存の秘匿化、切り詰め、証拠容量制限に従います。完全なログには全文を秘匿化する text/plain 添付を使用します。ZIP/GZIP は形式マーカー・サイズ・SHA-256 を確認してそのまま保存し、展開・実行・内部秘匿化は行いません。業務側で圧縮前に機密情報を除去してください。ブラウザーの addFiles も ZIP/GZ/TGZ に対応します。

businessCollectionTimeoutMs は既定 30000ms（1–300000）。タイムアウトと終了時に signal を中止して待機を終了するため、非同期処理にも signal を渡します。例外、不正ファイル、容量超過、保存失敗は maxAttempts まで再試行し、最終失敗は collectionStatus: failed になります。管理者は retry({ id, target: 'collect' }, context) で再実行できます。関数は再実行される可能性があるため report.id で外部処理を冪等化します。全ファイル保存後、証拠と索引をリース付きの同一トランザクションで公開し、成功マーカー保存後は再収集しません。添付 ID は安定した 1–100 文字とし、server:business: が自動付加されます。全添付で既存の 20 件・単一/合計容量制限を共有します。

### Webhook コールバック

信頼するサーバー設定 webhookUrl を指定すると、受付トランザクションで独立した永続 webhook タスクを作成します。収集が complete/partial/failed になった後、feedback.created を POST application/json で送信します。収集失敗時も送信し、Reach、notificationMode、通知抑止とは独立します。

```yaml
businessCollectionTimeoutMs: 30000
webhookUrl: ${HAI_FEEDBACK_WEBHOOKURL:}
webhookSecret: ${HAI_FEEDBACK_WEBHOOKSECRET:}
webhookTimeoutMs: ${HAI_FEEDBACK_WEBHOOKTIMEOUTMS:10000}
```

URL の空文字は無効化です。HTTP(S) のみ許可し、URL のユーザー資格情報・fragment は禁止、リダイレクトは追従しません。宛先は信頼できる配布設定で管理し、内部連携には内部 URL も使用できます。署名鍵はサーバーの非公開環境に保存し、PUBLIC_ 変数に含めません。webhookTimeoutMs は既定 10000ms（1–60000）。非 2xx、リダイレクト、通信障害、タイムアウトは 1s から最大 60s の指数バックオフで maxAttempts（既定 5）まで再試行します。

公開型 FeedbackWebhookEvent は event/eventId/createdAt/report/evidence/detailUrl? を含みます。evidence は修訂、業務証拠の収集成功、添付メタデータを持ち、本文・保存キー・設定秘密・全ログは送信しません。内容は認可付き API またはオフライン ZIP から取得します。初回送信前に本文を固定し、再試行・再起動でも本文と Idempotency-Key: eventId を維持します。受信側は eventId を永続化・重複排除した後に 2xx を返してください。配信は少なくとも 1 回で、応答消失による重複があります。URL 変更後の旧タスクは別の宛先に転送せず失敗するため、切替前に処理を完了します。

X-Hai-Feedback-Event と X-Hai-Feedback-Timestamp（Unix 秒）を送信します。鍵設定時は X-Hai-Feedback-Signature: sha256=<hex> を付加し、HMAC-SHA256(secret, timestamp + '.' + 元の本文) を計算します。受信側は元のバイトで検証し、定数時間比較、時刻許容幅、eventId による重複排除を実装します。get().jobs で状態、試行回数、安全な lastError コードを確認でき、管理台/Fullstack の詳細にも状態と再試行を表示します。管理者は retry({ id, target: 'webhook' }, context) を使用できます。notificationStatus とは別管理で、成功は受信先が 2xx を返したことを示します。

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

`FeedbackConfigSchema` は appId、notificationMode、recipients、maxTotalBytes、notificationProvider、adminUrl、collectionTimeoutMs、workerIntervalMs、leaseMs、maxAttempts、retentionDays、envAllowlist と資料の容量を検証します。YAML の環境参照は `HAI_FEEDBACK_*` を使い、ブラウザーへ SMTP/S3 の秘密を公開しません。

各業務結果の `success` を確認してください。`HaiFeedbackError` は初期化、設定、権限、存在しない記録、競合、容量、checksum エラーを表します。HTTP 200やSMTP受理だけでは、業務成功や受信箱への配信を証明できません。不確実な送信は重複する可能性があります。

### console 通知のプライバシー境界

`consoleContent` の既定は `metadata` で、報告番号、アプリ・バージョン・ビルド情報と収集状態だけを記録します。説明・概要・添付・証拠・通知本文・宛先は含みません。一般的なマスキング済み概要が必要な場合のみ `summary` を明示します。一般的なマスキングでは全業務機密を検出できません。Reach は不要で disabled/reach の意味は変わりません。更新後の既存 console 設定も既定でメタデータだけになります。

`resolveTransportBodyLimits(configuredLimit, { requiredPlaintextBytes: feedback.budget.maxTransportBytes })` でホスト上限と統合し、直接上書きしません。明示上限の不足は設定競合、省略または Serv/Kit の auto では必要量を計算します。添付と証拠の業務上限は独立です。

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
