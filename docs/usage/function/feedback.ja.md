# @h-ai/feedback API リファレンス

<!-- translation: partial -->

[原文（中国語）](feedback.md) · [設定](../configuration/feedback.ja.md) · [データ構造](../data/feedback.ja.md)

<a id="feedback-workflow"></a>

## 全体の流れ

ログインした Web 利用者の例です。ブラウザーは資料を準備して送信し、サーバーは受理、追加収集、処理、期限切れの削除を担当します。通知と Webhook は設定に応じて有効にします。

![フィードバックの開始、下書き、受理、資料の追加、処理、出力、期限切れまでの流れ](../images/function-feedback-collection.ja.svg)

たとえば注文ページでエラーが発生し、利用者が報告を送信すると `FB-20261117-3A8D91C2` と表示されます。画像の送信中でも、管理者は番号からすぐに問題票を開いて処理できます。処理、収集、通知の状態は詳細に別々に表示されます。Webhook の結果はタスク一覧で確認できます。

<a id="feedback-steps"></a>

## 手順

### 1. サービスを初期化してルートを用意する

RelDB と非公開 Storage を初期化し、サーバー側の `feedback.init()` を呼びます。Reach モードでは通知プロバイダーも先に初期化します。`kit.createFeedbackHandler()` または `serv.createFeedbackProcedures()` でルートを公開し、認証済みのセッションから `scopeId`、`userId` と権限を解決します。ブラウザーでは `@h-ai/feedback/client` からクライアントを作り、`client.init({ appId, actions })` でルートに接続します。[クイックスタート](#quick-start) · [Kit のルート](kit.ja.md#protocol-integrations) · [Serv のルート](#reports) · [クライアント設定](#feedback-client-config)

### 2. 下書きを作って資料を確認する

フィードバックを開いたら `client.prepare()` を呼びます。成功後、`client.getView()` で証拠、画像のプレビュー、不足資料をフォームに表示します。`addFiles()` で添付を追加し、`annotate()` で画像を注釈またはマスクできます。手元に保存する場合は `client.saveDraft()` で ZIP を保存します。[ブラウザーの下書きと例](#browser-capture)

### 3. 送信して受付番号を表示する

送信時は `client.submit({ description, category, contact })` を呼びます。説明は省略できます。成功したら `report.number` を表示し、照会に使う `report.id` を保持します。初回送信で提出 ID と内容が確定します。応答を受け取れなかった場合は同じ内容で再送します。送信済み内容を変更する場合は下書きを保存し、利用者の確認後に新規作成します。[提出と照会](#reports)

### 4. 残りの資料を送り、タスクの進捗を確認する

受理後、ブラウザーは同じ問題票に添付と追加証拠を送り、収集完了を伝えます。ネットワークや同じアカウントのセッションが復旧したら、`client.flush()` で未確認分を再試行できます。`get()` で添付の `available`、収集状態、失敗したタスクを確認します。サーバーワーカーは追加収集と、有効にした通知や Webhook を進めます。`worker.intervalMs: 0` ではアプリが `feedback.runJobs()` を定期的に呼びます。[資料 API](#evidence) · [タスクの取得と引き継ぎ](#feedback-job-execution)

### 5. 提出者が確認し、管理者が処理する

提出者は「自分の問題票」または `listMine()` で照会します。管理者は番号で検索し、詳細の現在の `version` を取得して `setStatus({ id, status: 'handled', expectedVersion }, context)` を呼びます。`pending` に戻すと再開できます。競合時は詳細を更新してから判断します。状態変更は履歴にも記録します。[処理履歴の保存](../data/feedback.ja.md#table-hai-feedback-history) · [照会と処理の例](#reports)

### 6. 必要なときに出力し、期限切れを回収する

出力権限を持つ管理者は `feedback.export({ id }, context)` を呼び、タスク ID を保存して `getExport()` で ZIP を取得します。申請時の問題票バージョンと証拠の改訂が固定されます。資料をできるだけ揃えたい場合は、収集状態を見てから申請します。生成中の `409` なら時間をおいて照会し、失敗と期限切れは戻り値に従って処理します。期限が切れた問題票と ZIP はアクセスを停止し、タスクがデータを削除します。ログアウト前に `client.close({ discard: true })`、サーバー終了前に `feedback.close()` を呼びます。[診断 ZIP の操作](#exports)

<a id="feedback-limits"></a>

## 主な制限

| 確認事項 | 既定の動作 |
| --- | --- |
| どのサーバーログを収集するか | `feedback.init()` は Core logger を監視します。コンテキストに `scopeId`、`userId`、`requestId` があるログだけを直近のメモリーに保持します。`error` または `fatal` が発生すると、同じリクエストのエラーと前後各最大 100 件が、送信前でも共有 DB に一時保存される場合があります。保存期間は 5 分です。報告にはアプリ、範囲、利用者、時刻に合うログを関連付けます。 |
| ブラウザーは常時アップロードするか | 初期化時にサーバーポリシーを取得できます。直近の Core ログ、未捕捉のエラー、アプリが渡した通信の概要は、既定で最大 5 分、1000 件、2 MiB を端末内に保持します。利用者が送信すると SDK が下書き用に絞り込んだ証拠を送り、受理後は残した添付と追加証拠を送ります。ブラウザーのコンソールは `captureConsole: true` にすると `debug/info/warn/error` を収集します。 |
| スクリーンショットとプライバシー | 下書きを準備すると、既定で現在の画面の撮影を試みます。バックグラウンド撮影と DOM リプレイは明示的に有効にします。リクエスト本文、Cookie 全体、すべての環境変数は既定で収集しません。機密箇所には `data-feedback-private` を付け、提出前に添付を確認します。ZIP/GZIP の中身は圧縮前にマスクします。 |
| サイズと件数 | 既定では 1 添付 5 MiB、1 問題票に添付 20 件かつ合計 22 MiB、証拠 2000 件かつ合計 4 MiB です。最初の提出にはクライアントの証拠を最大 1000 件含められます。実際の上限は `reports.policy({})` で取得します。 |
| 提出枠 | 既定では利用者 1 人あたり UTC の 1 日につき 20 件まで受理し、資料と出力に 2 GiB まで予約できます。アプリ内の各範囲の予約上限は既定で 10 GiB です。同じ提出の再送は 1 件と数えます。 |
| 待機と再試行 | 受理後の完了確認を既定で最大 60 秒待ち、その時点で利用できる資料で追加収集を進めます。資料が一部でも受理済みの問題票を処理できます。通常タスクは既定で最大 5 回、期限切れの削除は失敗後も再試行します。 |
| 保存期間と権限 | 問題票は既定で 30 日保存します。生成済みの ZIP は既定で出力申請から 24 時間以内かつ問題票の有効期間中に取得できます。期限になるとアクセスを停止し、バックグラウンドで削除します。提出者は同じ範囲の自分の問題票を操作でき、管理操作は個別に権限を確認します。 |

[サーバーログを問題票に関連付ける仕組み](#server-log-collection) · [設定と上限](../configuration/feedback.ja.md#configuration-fields)

<a id="module-dependencies"></a>

## 依存関係

| 依存先 | 用途 | 利用条件 | 初期化順序 |
| --- | --- | --- | --- |
| `@h-ai/core`、`@h-ai/api-contract` | ログ、結果型、フィードバックの API 契約を提供 | Feedback とともにインストール | Core でサービス設定を読み込む場合は先に実行。契約はそのまま使用 |
| `@h-ai/reldb` とデータベース | レポート、処理状態、バックグラウンドジョブを保存 | サーバーで必須。RelDB は Feedback とともにインストール | データベースに接続して RelDB を初期化してから `feedback.init()` を呼び出す |
| `@h-ai/storage` と非公開ストレージ | 添付ファイルと証拠を保存 | サーバーで必須。Storage は Feedback とともにインストール | Storage を初期化してから `feedback.init()` を呼び出す。複数インスタンスでデータベースと非公開オブジェクトストレージを共有 |
| `@h-ai/reach` と通知プロバイダー | フィードバックの通知を配信 | `notification.mode: 'reach'` の場合 | `notification.provider` と同名のプロバイダーを設定して Reach を初期化した後、Feedback を初期化 |
| `@h-ai/kit` または `@h-ai/serv` | SvelteKit または独立した HTTP サービスでルートを公開 | フレームワークのアダプターを使う場合 | Feedback を初期化し、信頼できるコンテキスト解決関数とともにアダプターへ渡す |
| `@capacitor/filesystem`、`@capacitor/share` | Capacitor でオフライン診断バンドルを保存して共有 | Capacitor エクスポートを使う場合 | 両方のプラグインを導入・同期してからエクスポート用アダプターを呼び出す |
| `@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-fs` | Tauri で保存先を選び、オフライン診断バンドルを保存 | Tauri エクスポートを使う場合 | プラグインを導入・登録し、ファイルのアクセス権限を設定してからエクスポート用アダプターを呼び出す |

ブラウザーでは `@h-ai/feedback/client`、オフラインツールでは `@h-ai/feedback/bundle` を直接利用できます。データベースとストレージの初期化はサーバー側で行います。

<a id="quick-start"></a>

## クイックスタート

### 利用例

サーバー側の例では、信頼できる `context` と再送時に共用する `submissionId` を受け取ります。ストレージの認証情報はサーバーの非公開設定から読み込みます。依存サービスを閉じる前に `feedback.close()` を呼び出します。

```ts
import { type FeedbackContext, feedback } from '@h-ai/feedback'

// orders 1.0.0 をコンソール通知と下記の管理 URL で起動する。成功時にデータはなく、初期化失敗時は報告を受け付けない。
const initialized = await feedback.init({
  appId: 'orders',
  build: { appVersion: '1.0.0' },
  notification: { mode: 'console', adminUrl: 'https://app.example.test/admin/feedback' },
})
if (!initialized.success)
  throw new Error(initialized.error.message)

export async function submitFeedback(context: FeedbackContext, submissionId: string) {
  // 信頼済みの主体と安定した submissionId で提出する。成功時は ID と報告番号を返し、権限や提出枠の検査に通らなければ失敗を返す。
  return feedback.submit({ appId: 'orders', submissionId }, context)
}
```

<a id="api-reference"></a>

## 機能

各節では個別のインターフェースを列挙し、その後に作業の流れを説明します。入力欄は呼び出し例、出力欄は成功時のデータです。`HaiResult` は `success` を確認してから `data` を読みます。引数の詳細な既定値と高度な制約は中国語の対応節を参照してください。

モジュールの import は入門例と同じです。開始・終了の例以外は初期化成功後、終了前に実行します。各呼び出しで HaiResult.success を確認し、失敗時は元の結果を返して、成功時だけ data を読みます。関数宣言のない例はアプリの非同期業務関数内の断片です。独立したテストデータと明示した後片付けを使います。

<a id="service"></a>

### サービスと採取処理の準備：`feedback`

共有 DB・ストレージ・信頼する文脈を使って受付・採取・通知・期限管理を行います。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `feedback.init(config, options?)` | 必要な依存先でサービスを初期化 | `config: FeedbackConfigInput`, `options?: FeedbackInitOptions` · [初期化の引数](#feedback-init-options) | `Promise<HaiResult<void>>` | `await feedback.init(config)` |
| `feedback.close()` | ワーカーを停止して状態を解放 | なし | `Promise<HaiResult<void>>` | `await feedback.close()` |
| `feedback.runJobs()` | 実行可能になったタスクを一巡処理 | なし | `Promise<HaiResult<{ processed: number }>>` | `await feedback.runJobs()` |

<a id="feedback-init-options"></a>

##### 初期化の引数

`config: FeedbackConfigInput` は必須です。項目は[設定ファイル](../configuration/feedback.ja.md)を参照してください。`options: FeedbackInitOptions` を省略すると、アプリ独自の資料収集は実行されません。

省略可能な `collectEvidence({ report, signal })` は報告の保存後に実行されます。`report` は読み取り専用の報告、`signal` はタイムアウトや終了に合わせて外部処理を中断するための通知です。同期または非同期で `FeedbackCollectedEvidence` を返し、省略可能な `text: string`、構造化した `data`、`attachments` を指定できます。添付ファイルには固定の文字列 `id`、ファイル名 `name`、メディアタイプ `contentType`、`bytes: Uint8Array` を指定します。報告番号が `FB-42` なら、たとえば `{ text: "Diagnostics for FB-42", data: { businessSystem: "orders" } }` を返せます。

#### 利用例：アプリがバックグラウンドタスクを定期実行する

既定では Feedback がワーカーを動かします。独自のプロセススケジューラーを使う環境では、`worker.intervalMs: 0` を設定し、初期化後に次の処理を定期実行します。

```ts
// アプリの非同期業務関数内の断片です。失敗結果は呼び出し元へ返します。
// 引数なしでフィードバックのジョブを一巡処理する。data.processed は今回の処理数で、通知の配信結果は個別に確認する。
const jobsResult = await feedback.runJobs()
if (!jobsResult.success)
  return jobsResult
const { processed } = jobsResult.data
```

Reach API の受信側は JSON の `extra.notificationId` で通知の重複を識別できます。再試行時も `feedback.get()` で確認できる同じ通知ジョブの ID を使います。

出力は成功時の HaiResult.data です。認証済みのサーバー側の情報から context を作り、success を確認します。

収集完了は現在の収集を終える処理で、通知の完了までは待ちません。添付とエクスポートは権限を確認するサーバーのエンドポイントを通じて取得します。

未翻訳：証拠収集、非公開添付、エクスポート、再試行の詳しい手順。[中国語の該当節](feedback.md#api-reference)を参照してください。

<a id="server-log-collection"></a>

#### サーバーログの関連付け

1. **初期化時に監視を始めます。** `feedback.init()` は `scopeId`、`userId`、`requestId` を持つ Core ログを監視します。認証済みのリクエストコンテキストにこれらを設定します。アプリ独自のコールバックを登録しなくても Core ログの監視は行われます。ログファイル、標準出力、初期化前のログはこの監視の対象外です。
2. **エラーの証拠は提出前にも保存されます。** 通常のログはインスタンスの直近 5 分のメモリー内に、最大 10000 件または 16 MiB 保存します。`error` や `fatal` が発生すると、同じリクエストの前後各最大 100 件とエラー本体を共有 DB に一時保存できます。後続の取得時間は最大 30 秒で、一時レコードは 5 分で期限切れになります。
3. **受理後は関連する資料だけを結び付けます。** ワーカーはアプリ、範囲、提出者を照合し、基準時刻の 5 分前から 30 秒後までを読みます。ブラウザーは直近のエラーまたは下書きを開いた時刻を使います。API を直接呼んで基準時刻を省略した場合は受理時刻を使います。取得件数は最大 1000 件で、問題票の予算にも従います。共有 DB のエラー証拠は各インスタンスから読めます。通常のメモリーログは採取したインスタンスで使えます。一致する証拠がない場合や上限超過、読み取り失敗は不足資料に表示されることがあります。
4. **業務の証拠はアプリが報告ごとに提供します。** ワーカーが、アプリの登録した `collectEvidence({ report, signal })` を呼びます。対象の報告に関連するログを業務サービスから探し、テキスト、構造化データまたは添付を返します。

<a id="feedback-job-execution"></a>

#### タスクの取得と復旧

提出時のトランザクションは問題票と、追加収集、期限切れの削除、有効な通知のタスクを保存します。設定した Webhook は失敗を含む収集の終端状態を待ちます。ZIP は出力申請時にタスクを登録します。ブラウザーの撮影と添付の送信はクライアントが開始します。

**タスクはワーカーが自動で取得します。** 既定ではアプリのプロセスが共有 DB を確認し、タスクごとに有効なリースを 1 つだけ保持します。たとえばインスタンス A は ZIP 生成を始めるときにトークンとリースを原子的に登録し、実行中に延長します。A が途中で停止すると、期限後に B が引き継げます。有効な保有者だけが結果を記録できます。通知は再試行で重複する場合があり、受信側はタスクの冪等 ID で重複を判定できます。[タスクの項目](../data/feedback.ja.md#table-hai-feedback-jobs)

#### 利用例：保存後にアプリの証拠を収集する

```ts

import { type FeedbackConfigInput, feedback } from '@h-ai/feedback'

function startFeedback(config: FeedbackConfigInput) {
  // 依存先を準備した後のアプリ設定を渡します。コールバックは報告番号を使い、タスクの中断時には処理を止めます。
  return feedback.init(config, {
    collectEvidence: ({ report, signal }) => {
      signal.throwIfAborted()
      return { text: `Diagnostics for ${report.number}`, data: { businessSystem: 'orders' } }
    },
  })
}
```

[引数と手順の詳細](feedback.md#service)

<a id="reports"></a>

### 報告の提出・照会・処理：`feedback`

HTTP ルートを登録するには、`@h-ai/serv` から `serv` を読み込み、`apiContract.feedback` と `serv.createFeedbackProcedures({ feedback, resolveContext })` を使います。`scopeId`、`userId`、`permissions` はサーバー側で確定します。

受付 ID を保存し、権限のある担当者が現場を調べ、版を確認して状態を更新します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `feedback.submit(input, context)` | フィードバックを受け付け | 必須の `input: FeedbackSubmitInput` と `context: FeedbackContext`。[送信項目](#feedback-submission-fields)を参照。 | `FeedbackReport` | `await feedback.submit(reportInput, context)` |
| `feedback.list(input, context)` | 絞り込んでページ取得 | `input: FeedbackListInput` 必須の絞り込みオブジェクト。各項目は任意。[報告フィルター](#feedback-report-options)を参照。`context: FeedbackContext` 信頼できるセッション情報が必須。[呼び出し側](#feedback-submission-fields)を参照 | `PaginatedResult<FeedbackReport>` | `await feedback.list({ page: 1, pageSize: 20 }, context)` |
| `feedback.listMine` | 本人の報告をカテゴリで絞り込む | input, context | `PaginatedResult<FeedbackReport>` | `await feedback.listMine({ category: 'bug', page: 1 }, context)` |
| `feedback.get(id, context)` | 詳細を取得 | `id: string` 必須の報告 ID。`context: FeedbackContext` 信頼できるセッション情報が必須。[呼び出し側](#feedback-submission-fields)を参照 | `FeedbackDetail` | `await feedback.get(reportId, context)` |
| `feedback.getEvidence(input, context)` | 診断証拠をページ取得 | `input: FeedbackEvidenceQuery` id は必須。source、kind、requestId、errorId、Unix ミリ秒範囲 from/to と page/pageSize は任意。[証拠項目](#feedback-evidence-fields)を参照。`context: FeedbackContext` 信頼できるセッション情報が必須。[呼び出し側](#feedback-submission-fields)を参照 | `PaginatedResult<FeedbackEvidence>` | `await feedback.getEvidence({ id: reportId, page: 1, pageSize: 20 }, context)` |
| `feedback.setStatus(input, context)` | 版を照合して処理状態を更新 | `input: FeedbackSetStatusInput` 報告、変更先状態、バージョン、メモ。[処理項目](#feedback-report-options)を参照。`context: FeedbackContext` 信頼できるセッション情報が必須。[呼び出し側](#feedback-submission-fields)を参照 | `FeedbackReport` | `await feedback.setStatus(statusUpdate, context)` |
| `feedback.retry(input, context)` | 指定した失敗処理を再投入 | `input: FeedbackRetryInput` 報告 id と target、該当する targetId を指定。[再試行項目](#feedback-report-options)を参照。`context: FeedbackContext` 信頼できるセッション情報が必須。[呼び出し側](#feedback-submission-fields)を参照 | `void` | `await feedback.retry(retryInput, context)` |

<a id="feedback-report-options"></a>

**報告の絞り込み、状態、再試行**

| フィールド | 型 | 必須と既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `list.input.page / pageSize` | `number` | 既定 1 と 20 | 正の整数のページ番号とページサイズ。pageSize は最大 100。 |
| `list.input.sortDirection` | `'asc' \| 'desc'` | `desc` | 作成時刻で並べます。 |
| `list.input.status` | `'pending' \| 'handled'` | 任意 | 処理状態で絞り込み。 |
| `list.input.collectionStatus` | `'collecting' \| 'complete' \| 'partial' \| 'failed'` | 任意 | 資料収集状態で絞り込み。 |
| `list.input.notificationStatus` | `'disabled' \| 'pending' \| 'sending' \| 'sent' \| 'deferred' \| 'failed'` | 任意 | 通知状態で絞り込み。 |
| `list.input.appId / appVersion` | `string` | 任意 | 認可済み範囲内でアプリとバージョンを限定。appVersion は最大 128 文字。 |
| `list.input.search` | `string` | 任意 | 番号または概要の文字列部分一致。最大 200 文字。 |
| `list.input.from / to` | `number` | 任意 | 作成時刻の両端を含む範囲。非負の安全な整数の Unix ミリ秒。 |
| `setStatus.input.id / status` | `string / FeedbackStatus` | 必須 | 報告 ID と変更先の pending または handled。 |
| `setStatus.input.expectedVersion` | `number` | 必須 | 最後に読み込んだ正の整数バージョン。並行更新があると CONFLICT。 |
| `setStatus.input.note` | `string` | 任意 | 処理メモ。最大 10000 文字。 |
| `retry.input.target` | `'collect' \| 'notify' \| 'webhook' \| 'export' \| 'attachment'` | 必須 | 再スケジュールする失敗カテゴリ。 |
| `retry.input.targetId` | `string` | 添付を再試行する場合に指定 | 報告内の失敗した添付 ID。 |

例えば `{ status: "pending", page: 1, pageSize: 5 }` は認可範囲の未処理の報告を最初のページに最大 5 件返します。`version` を読み取った後に並行変更されると状態更新は `CONFLICT` になります。

<a id="feedback-submission-fields"></a>

**報告の送信と呼び出し側情報**

| フィールド | 型 | 必須と既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `input.submissionId / appId` | `string` | 必須 | 安定した送信 ID とアプリ ID。同一の操作を再試行する場合は送信 ID を再利用。 |
| `input.description / category / contact` | `string` | 任意 | 報告者の説明、アプリの分類、連絡先。最大長はそれぞれ 10000、64、320。 |
| `input.url` | `string` | 任意 | 問題のページ URL。最大 2048 文字。 |
| `input.appVersion / buildId / commit` | `string` | 任意 | 問題が発生したビルドを特定。各最大 128 文字。 |
| `input.anchor` | `{ kind, timestamp, errorId? }` | 任意 | 現場の開始点。kind は error または feedback、timestamp は Unix ミリ秒。errorId をエラーに関連付け可能。 |
| `input.evidence / attachments` | `FeedbackEvidenceInput[] / FeedbackAttachmentInput[]` | 任意 | 診断イベントと添付の宣言。配列の上限は 1000 件と 20 件。ファイルのバイト列は別途アップロード。 |
| `context.scopeId / userId` | `string` | 必須 | 認可済みセッションから取得した信頼できるテナント ID とユーザー ID。 |
| `context.permissions` | `readonly string[]` | 任意 | 信頼できるセッションの権限。操作時はサービス側でもアクセス範囲を確認。 |

#### シナリオ：自分の報告を確認する

サーバーは認証済みユーザーと検証済みスコープから context を作ります。アプリ、スコープ、投稿者、有効期限で絞り込みます。カテゴリは大文字と小文字を区別し、既存の報告から読み出します。管理一覧には引き続き `feedback:read` が必要です。

認証済みの投稿者は、Kit と Serv の `GET /api/feedback/my-reports?category=bug&page=1` で、同じアプリとスコープの有効な報告を取得できます。この例ではアプリが API を `/api` にマウントしています。

```ts

import { type FeedbackContext, feedback } from '@h-ai/feedback'

async function listOwnReports(context: FeedbackContext) {
  // 現在のアプリとスコープで本人の bug 報告を最大 20 件取得する。該当がなければ空のページを返す。
  const result = await feedback.listMine({ category: 'bug', page: 1, pageSize: 20 }, context)
  if (!result.success)
    return result
  return result.data
}
```

#### 利用例：報告の提出・照会・処理

create/read/process を認可されたサーバーコンテキストを使います。ID は submit、expectedVersion は直前の詳細から取得します。再通知は復旧可能な失敗に対して行い、受理は既読を意味しません。

```ts
import type { FeedbackContext } from '@h-ai/feedback'

async function processReport(context: FeedbackContext, submissionId: string) {
  // 信頼済み主体と永続提出 ID で orders の報告を作る。ID と報告番号が返り、権限・保存エラーは 元の失敗結果を返す。
  const reportResult = await feedback.submit({ appId: 'orders', submissionId }, context)
  if (!reportResult.success)
    return reportResult
  const report = reportResult.data
  // この主体が閲覧できる報告を先頭から最大 20 件読む。該当なしなら items は空。
  const pageResult = await feedback.list({ page: 1, pageSize: 20 }, context)
  if (!pageResult.success)
    return pageResult
  const page = pageResult.data // authorized report page
  // 作成した報告 ID と現在の主体で詳細とバージョンを読む。権限・照会の失敗は 元の失敗結果を返す。
  const detailResult = await feedback.get(report.id, context)
  if (!detailResult.success)
    return detailResult
  const detail = detailResult.data
  // 同じ報告と主体で証拠を先頭から最大 20 件読む。証拠がなければページの items は空。
  const evidenceResult = await feedback.getEvidence({ id: report.id, page: 1, pageSize: 20 }, context)
  if (!evidenceResult.success)
    return evidenceResult
  const evidence = evidenceResult.data
  // 照会したバージョンを条件に handled へ更新する。成功時は新バージョンの報告、競合や権限不足は失敗。
  const handledResult = await feedback.setStatus({ id: report.id, status: 'handled', expectedVersion: detail.report.version }, context)
  if (!handledResult.success)
    return handledResult
  const handled = handledResult.data
  return { report, page, evidence, handled } // same report ID; handled has the new version
}

async function retryNotification(id: string, context: FeedbackContext) {
  // 指定された操作可能な報告の通知再試行を登録する。成功時にデータはなく、配信完了は別途確認する。
  return feedback.retry({ id, target: 'notify' }, context) // HaiResult<void>, caller checks success
}
```

一覧、詳細、証拠、添付、出力の有効期限はデータベースの時刻で判定します。期限切れの報告は一覧から除外され、個別の操作では `NOT_FOUND` が返ります。データベースとオブジェクトストレージからの削除はバックグラウンドジョブが行います。

オンラインでもオフラインでも、失敗したリクエストやエラーの `errorId` で照会できます。同じ取得元とリクエストのログを、対象の前後それぞれ最大 100 件まで取得します。

<a id="evidence"></a>

### 資料の追加と添付の読取：`feedback`

追加入力も元の報告と主体に結び、添付の型・バイト数・要約値を検査します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `feedback.appendEvidence(input, context)` | 診断証拠を追加 | `input: FeedbackAppendEvidenceInput` 必須の報告 id と evidence 配列（最大 1000 件）。[証拠項目](#feedback-evidence-fields)を参照。`context: FeedbackContext` 信頼できるセッション情報が必須。[呼び出し側](#feedback-submission-fields)を参照 | `{ acknowledged, evidenceRevision }` | `await feedback.appendEvidence(evidence, context)` |
| `feedback.completeCollection(input, context)` | 証拠収集の完了を記録 | `input: FeedbackCompleteInput` 報告 id は必須、missing の一覧は任意。[欠損項目](#feedback-evidence-fields)を参照。`context: FeedbackContext` 信頼できるセッション情報が必須。[呼び出し側](#feedback-submission-fields)を参照 | `FeedbackReport` | `await feedback.completeCollection({ id: reportId }, context)` |
| `feedback.uploadAttachment(input, context)` | 許可した添付をアップロード | `input: FeedbackUploadInput` 報告 id、宣言済みの attachmentId、対応する dataBase64 が必須。[アップロード項目](#feedback-evidence-fields)を参照。`context: FeedbackContext` 信頼できるセッション情報が必須。[呼び出し側](#feedback-submission-fields)を参照 | `FeedbackAttachment` | `await feedback.uploadAttachment(upload, context)` |
| `feedback.getAttachment(input, context)` | 許可した添付を取得 | `input: { id: string, attachmentId: string }` 報告と添付の ID が必須。`context: FeedbackContext` 信頼できるセッション情報が必須。[呼び出し側](#feedback-submission-fields)を参照 | `FeedbackAttachmentData` | `await feedback.getAttachment({ id: reportId, attachmentId }, context)` |

<a id="feedback-evidence-fields"></a>

**証拠と添付入力**

| フィールド | 型 | 必須と既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `evidence[].id / source / sequence` | `string / string / number` | 必須 | 証拠の安定した ID、収集元（1–128 文字）、その収集元内の非負の安全な整数の連番。 |
| `evidence[].kind` | `'log' \| 'error' \| 'request' \| 'interaction' \| 'environment' \| 'snapshot' \| 'replay' \| 'business' \| 'missing'` | 必須 | 証拠のカテゴリ。 |
| `evidence[].timestamp` | `number` | 必須 | イベントの時刻。Unix ミリ秒。 |
| `evidence[].data` | `Record<string, unknown>` | 必須 | そのカテゴリに対応する JSON オブジェクト。 |
| `evidence[].requestId / errorId / missingReason` | `string` | 任意 | リクエストやエラーとの関連、または欠損理由（最大 2000 文字）。 |
| `attachments[].id / name / contentType` | `string` | 必須 | 送信時に宣言する安定した添付 ID、ファイル名、メディアタイプ。 |
| `attachments[].size / checksum` | `number / string` | 必須 | バイトサイズ（0〜5 MiB）と 64 文字の小文字 16 進 SHA-256 を宣言。 |
| `uploadAttachment.input.dataBase64` | `string` | 必須 | 宣言したファイルのバイト列の標準 Base64。data URL の接頭辞は付けません。 |
| `completeCollection.input.missing` | `string[]` | 任意 | まだ不足している診断項目。最大 100 件、各 2000 文字。 |

#### 利用例：資料の追加と添付の読取

同じ不足資料の確認を再送しても記録は一度です。添付の削除と追加はまとめて検証します。一つでも無効なファイルがあれば、元の添付と不足を示す記録を保持します。

受理済み報告 ID と同じ帰属のコンテキストを使います。証拠は安定した id/source/sequence を持ちます。アップロードは宣言済み添付のバイト列で、ID の変更で制限を回避できません。

```ts
import type { FeedbackContext, FeedbackUploadInput } from '@h-ai/feedback'

async function appendMaterials(context: FeedbackContext, upload: FeedbackUploadInput) {
  const id = upload.id
  // upload.id の報告にブラウザーイベント event-demo-1 を追記する。固定 ID で重複を排除し、成功時は確認済み ID と証拠のリビジョンが返る。
  const receiptResult = await feedback.appendEvidence({ id, evidence: [{
    id: 'event-demo-1', source: 'browser', sequence: 1, kind: 'business',
    timestamp: Date.now(), data: { state: 'checkout-failed' },
  }] }, context)
  if (!receiptResult.success)
    return receiptResult
  const receipt = receiptResult.data // acknowledged IDs and evidenceRevision
  // 受け取った添付の内容と識別子を報告に保存する。成功時はメタデータ、入力・予算・保存エラーは 元の失敗結果を返す。
  const attachmentResult = await feedback.uploadAttachment(upload, context)
  if (!attachmentResult.success)
    return attachmentResult
  const attachment = attachmentResult.data // saved attachment metadata
  // 報告 ID と元の添付 ID で閲覧可能な添付を取得する。DTO に Base64 の内容が入り、読み取り失敗は 元の失敗結果を返す。
  const bytesResult = await feedback.getAttachment({ id, attachmentId: upload.attachmentId }, context)
  if (!bytesResult.success)
    return bytesResult
  const bytes = bytesResult.data
  // この報告の収集を欠落なしで完了する。成功時は更新済み報告、条件を満たさなければ失敗。
  const completedResult = await feedback.completeCollection({ id, missing: [] }, context)
  if (!completedResult.success)
    return completedResult
  const completed = completedResult.data // updated report
  return { receipt, attachment, bytes, completed }
}
```

<a id="exports"></a>

### 診断包の出力と参照：`feedback`

ZIP の圧縮と展開は Core Worker で行います。ブラウザーのオフライン出力では Web Worker を使い、パス、容量上限、内容のダイジェストは共通の規則で検証します。

証拠の版を固定して出力タスクを作り、完了後に ZIP を得ます。閲覧で業務を再実行しません。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `feedback.export(input, context)` | 指定証拠版のオフラインパッケージを要求 | `input: FeedbackExportInput` 報告 id は必須。正整数の evidenceRevision は任意で、既定は現在の証拠リビジョン。`context: FeedbackContext` 信頼できるセッション情報が必須。[呼び出し側](#feedback-submission-fields)を参照 | `FeedbackJob` | `await feedback.export(exportInput, context)` |
| `feedback.getExport(input, context)` | 完成した出力を取得 | `input: { id: string, jobId: string }` 報告 ID とエクスポート結果に含まれるジョブ ID が必須。`context: FeedbackContext` 信頼できるセッション情報が必須。[呼び出し側](#feedback-submission-fields)を参照 | `FeedbackAttachmentData` | `await feedback.getExport({ id: reportId, jobId }, context)` |

#### 利用例：診断包の出力と参照

ビューアーは Feedback が生成する単一ディスクの ZIP を読み取ります。無圧縮と DEFLATE に対応し、読み取り前にパス、データ範囲、件数、展開サイズを確認します。

認可済み管理者が報告 ID を指定すると export はジョブ ID を返します。この例は一度照会します。未完了の CONFLICT は空 ZIP ではなく、有界待機後に再照会します。

```ts
import type { FeedbackContext } from '@h-ai/feedback'

async function requestArchive(id: string, context: FeedbackContext) {
  // 閲覧可能な報告のエクスポートを依頼し、永続ジョブの受付を受け取る。アーカイブは生成待ちの場合がある。
  const jobResult = await feedback.export({ id }, context)
  if (!jobResult.success)
    return jobResult
  const job = jobResult.data // persistent job receipt
  // 報告 ID と受付のジョブ ID でアーカイブを取得する。未生成または権限不足なら失敗。
  return feedback.getExport({ id, jobId: job.id }, context) // HaiResult<FeedbackAttachmentData>
}
```

<a id="browser-capture"></a>

### ブラウザの現場と下書き：`feedback.createClient`

製品セッションごとにインスタンスを作り、画面を開く前に現場を固定し、プレビューと主体の下書きを解放します。

#### インターフェース一覧

| API | 用途 | 引数と既定値 | 戻り値・失敗 | 呼び出し例 |
| --- | --- | --- | --- | --- |
| `feedbackClient.init(config)` | ブラウザー証拠収集を開始 | 必須の `config: FeedbackClientConfig`。[アプリと収集の項目](#feedback-client-config)を参照。 | `Promise<HaiResult<void>>` | `await feedbackClient.init(config)` |
| `feedbackClient.prepare(options?)` | 今回のフィードバック証拠を準備 | 前回の受付済み下書きの追加送信に失敗した場合は元の下書きを返す。利用者が置き換えを確認したら `{ startNew: true }` を渡す | `Promise<HaiResult<FeedbackDraft>>` | `await feedbackClient.prepare()` |
| `feedbackClient.captureScreenshot(attachmentId?)` | ページの画面を取得 | `attachmentId?: string` 省略するとスクリーンショットを追加。下書きの添付 ID を指定すると置換 | `Promise<HaiResult<void>>` | `await feedbackClient.captureScreenshot()` |
| `feedbackClient.getDraft()` | 現在の下書きを取得 | `—` | `FeedbackDraft \| undefined` | `feedbackClient.getDraft()` |
| `feedbackClient.getView()` | 表示用状態を取得 | `—` | `FeedbackDraftView` | `feedbackClient.getView()` |
| `feedbackClient.releasePreviews()` | 一時プレビューを解放 | `—` | `void` | `feedbackClient.releasePreviews()` |
| `feedbackClient.addFiles(files, removedAttachmentIds?)` | 選択したファイルを追加 | `files: readonly File[], removedAttachmentIds?: readonly string[]` 新しく選んだファイルと同じ処理で外す任意の添付 ID | `Promise<HaiResult<void>>` | `await feedbackClient.addFiles(files, removedAttachmentIds)` |
| `feedbackClient.annotate(id, annotation)` | 画像に注釈・マスクを反映 | 必須の `id: string`（下書き内の添付 ID）と `annotation: FeedbackImageAnnotation`（注釈とマスクのデータ） | `Promise<HaiResult<void>>` | `await feedbackClient.annotate(attachmentId, annotation)` |
| `feedbackClient.record(event)` | アプリの診断情報を記録 | 証拠の種類 `kind` とフィールドオブジェクト `data` を含む `event` が必須。任意の `requestId`、`errorId` で既存リクエストやエラーと関連付ける | `void` | `feedbackClient.record({ kind: 'business', data: { state: 'ready' } })` |
| `feedbackClient.submit(input?)` | 現在の下書きを送信 | 任意の `input: FeedbackClientSubmitInput`。[ブラウザー送信項目](#feedback-client-submit-input)を参照。 | `Promise<HaiResult<FeedbackReport>>` | `await feedbackClient.submit({ description: 'Checkout failed' })` |
| `feedbackClient.flush()` | 未確認の証拠を送信 | `—` | `Promise<HaiResult<void>>` | `await feedbackClient.flush()` |
| `feedbackClient.exportDraft(input?)` | ローカル診断パッケージを生成 | `input?: FeedbackClientSubmitInput` はオフラインパッケージ用の補足情報と添付変更。省略すると現在の下書きを出力 | `Promise<HaiResult<Uint8Array>>` | `await feedbackClient.exportDraft()` |
| `feedbackClient.saveDraft(input?)` | ローカル下書きを保存 | `input?: FeedbackClientSubmitInput` は `exportDraft` と同じ。その後でホストの保存機能を使う | `Promise<HaiResult<FeedbackSaveResult>>` | `await feedbackClient.saveDraft()` |
| `feedbackClient.pause()` | 収集を一時停止 | `—` | `void` | `feedbackClient.pause()` |
| `feedbackClient.close(options?)` | 収集を終了して解放 | `options?: { discard?: boolean }` 既定 false で上限付きの終了処理と後片付け。discard を true にしてローカル下書きを破棄 | `Promise<void>` | `await feedbackClient.close({ discard: true })` |

<a id="feedback-client-config"></a>

**FeedbackClientConfig**

| フィールド | 型 | 必須と既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `appId` | `string` | 必須 | サーバーのフィードバック設定と一致するアプリ ID。 |
| `appVersion / buildId / commit` | `string` | 任意 | 報告と送るビルド識別子。各最大 128 文字。 |
| `actions` | `FeedbackClientActions` | 必須 | ホストの非同期コールバック submit、appendEvidence、completeCollection、upload が報告受理、証拠追加、収集完了、添付送信を担当。任意の policy はサーバーの予算を返します。 |
| `budget` | `FeedbackBudget` | 任意 | オフラインまたはサーバー方針が取得できないときに使用。オンラインは actions.policy を優先。 |
| `cookieAllowlist` | `readonly string[]` | 任意 | 診断で収集を許可する Cookie 名。 |
| `screenshot / keyScreenshots` | `boolean` | `true / false` | 準備時のスクリーンショットと追加の自動重要スクリーンショットを制御。 |
| `captureScreenshot` | `(options?: { signal: AbortSignal }) => Promise<Uint8Array>` | 任意 | 既定のスクリーンショット処理を上書き。画像バイトを返し、中止シグナルに対応。 |
| `screenshotTimeoutMs / maxKeyScreenshots / keyScreenshotThrottleMs` | `number` | `3000 / 3 / 10000` | タイムアウトのミリ秒、保持枚数、自動撮影の最小間隔ミリ秒。重要スクリーンショットは最大 5 枚で、0 なら無効。 |
| `replay / replayStart` | `boolean / 'init' \| 'prepare'` | `false / prepare` | DOM リプレイを有効化し、初期化時または準備時に開始。 |
| `captureConsole / persistDraft` | `boolean` | `false / false` | コンソール収集またはローカル永続化を明示的に有効化。 |
| `persistenceKey` | `string` | persistDraft=true の場合に必須 | ローカル下書きをユーザーとテナントで分ける ID。認証情報は使用不可。 |
| `maxEvents / maxBytes / maxAgeMs` | `number` | `1000 / 2097152 / 300000` | 証拠件数、バイト数、保持ミリ秒。件数とバイト数はサーバー予算でも制限。 |
| `beforeCount / afterCount / afterTimeoutMs` | `number` | `100 / 100 / 30000` | アンカー前後の件数と後続収集の最長ミリ秒。数値オプションには非負の安全な整数を指定。 |

例えば `{ screenshot: false, replay: true, replayStart: "prepare" }` はスクリーンショットを無効にし、利用者がフィードバックを準備してからリプレイを開始します。

<a id="feedback-client-submit-input"></a>

**FeedbackClientSubmitInput**

| フィールド | 型 | 必須と既定値 | 用途と適用条件 |
| --- | --- | --- | --- |
| `description / category / contact` | `string` | 任意 | 問題の説明、アプリ分類、連絡先。個別に指定可能。 |
| `files` | `readonly File[]` | 追加ファイルなし | 今回選択したファイル。 |
| `removedAttachmentIds` | `readonly string[]` | 既存の添付を維持 | 送信対象から外すか、オフラインパッケージから除く添付 ID。 |

例えば `{ description: "Checkout failed", removedAttachmentIds: ["draft-image"] }` で出力すると、成功時の ZIP に補足説明が入り、その添付は除外されます。

`submit`、`exportDraft`、`saveDraft` は任意の `FeedbackClientSubmitInput` を共用します。`description` は問題の補足説明、`category` はアプリが定める分類、`contact` は報告者への連絡先で、いずれも任意の文字列です。新しく選んだファイルは `files?: readonly File[]`、下書きの対象から外す添付 ID は `removedAttachmentIds?: readonly string[]` に指定します。省略すると新規ファイルを追加せず既存の添付を維持します。

#### 利用例：ブラウザの現場と下書き

prepare で現場を固定して確認し、submit で確実に送信します。受理後もブラウザーの追加転送とサーバー収集は続く場合があります。

この SDK 例では準備、資料の確認、送信を続けて示します。実際の画面では `prepare()` の成功後にフォームを表示し、利用者が資料を確認してから `submit()` を呼びます。

```ts

import { type FeedbackClientConfig, feedback } from '@h-ai/feedback/client'
export async function capture(config: FeedbackClientConfig) {
  // 引数なしで独立した収集クライアントを作る。設定した収集は init の後で有効になる。
  const feedbackClient = feedback.createClient()
  // ホストのクライアント設定でセッションを起動する。成功時にデータはなく、設定不正や初期化競合は 元の失敗結果を返す。
  const initResult = await feedbackClient.init(config)
  if (!initResult.success)
    return initResult
  try {
    // この収集セッションに state: ready の業務イベントを記録する。戻り値はない。
    feedbackClient.record({ kind: 'business', data: { state: 'ready' } })
    // 引数なしで編集可能な下書きを準備する。成功時は下書きが返り、セッションを利用できなければ 元の失敗結果を返す。
    const draftResult = await feedbackClient.prepare()
    if (!draftResult.success)
      return draftResult
    const draft = draftResult.data
    // 引数なしで現在の下書きを読む。未作成または削除済みなら undefined。
    const current = feedbackClient.getDraft() // current draft or undefined
    // 引数なしで現在の画面用データを取得する。証拠、欠落項目、利用できる添付プレビューを含む。
    const view = feedbackClient.getView() // preview URLs, evidence and missing materials
    // 置換対象 ID を指定せず表示中ページの画像を下書きに追加する。撮影失敗や同時の凍結は 元の失敗結果を返す。
    const captureScreenshotResult = await feedbackClient.captureScreenshot()
    if (!captureScreenshotResult.success)
      return captureScreenshotResult
    // refreshes the screenshot attachment
    // メモリで作った demo.txt を下書きに追加する。成功時データはなく、上限・入力・競合の失敗で部分追加しない。
    const addFilesResult = await feedbackClient.addFiles([new File(['demo log'], 'demo.txt', { type: 'text/plain' })])
    if (!addFilesResult.success)
      return addFilesResult
    // 説明 Checkout failed で下書きを提出する。成功時は報告 ID と番号が返り、資料の送信はまだ保留の場合がある。
    const receiptResult = await feedbackClient.submit({ description: 'Checkout failed' })
    if (!receiptResult.success)
      return receiptResult
    const receipt = receiptResult.data // accepted report ID/number
    // 引数なしで現在の報告の未送信資料を続けて送る。成功時にデータはなく、残った資料は保留される。
    const flushResult = await feedbackClient.flush()
    if (!flushResult.success)
      return flushResult
    // resumes pending evidence upload
    // 引数なしでローカルの下書きを ZIP バイトに変換する。送信は行わず、生成失敗は 元の失敗結果を返す。
    const archiveResult = await feedbackClient.exportDraft()
    if (!archiveResult.success)
      return archiveResult
    const archive = archiveResult.data // Uint8Array ZIP
    // 引数なしで現在の下書きアーカイブを端末に保存する。status が saved か cancelled かを確認し、端末側エラーは 元の失敗結果を返す。
    const savedResult = await feedbackClient.saveDraft()
    if (!savedResult.success)
      return savedResult
    const saved = savedResult.data // inspect saved.status; cancelled is not a saved file
    // 引数なしでこのセッションの添付プレビュー URL を取り消す。戻り値はない。
    feedbackClient.releasePreviews() // releases generated object URLs
    // 引数なしで能動的な収集を一時停止する。下書きと受理済みのアップロードは保持される。
    feedbackClient.pause() // pauses active collection while retaining the draft
    return { draft, receipt, archive, saved }
  }
  finally {
    // ローカル下書きを破棄して収集セッションを終了し、リスナーなどの解放を待つ。業務データは返さない。
    await feedbackClient.close({ discard: true })
  }
}
```

config.actions はアプリの型付き HTTP 適合処理です。撮影・ファイル・注釈・送信・保存の入出力は以下を参照してください。保存の成功結果でも利用者取消の場合があります。

#### 利用例：未送信の資料を保存して新しい報告を開始する

`prepare()` の成功結果に `report` が含まれる場合、元の受付番号を表示し、端末に保存するか新しい報告を開始するかを選べるようにします。引数なしの保存では、受付済みまたは送信内容が確定した下書きの説明、カテゴリ、連絡先も残ります。利用者が置き換えを確認してから次の関数を呼びます。受付済みの報告とアップロード済みの資料はサーバーに残ります。

```ts
import type { FeedbackBrowserClient } from '@h-ai/feedback/client'

async function startNewFeedback(client: FeedbackBrowserClient) {
  // 利用者が端末の下書きの置き換えを確認した。success を確認し、返された下書きを表示する。
  const prepared = await client.prepare({ startNew: true })
  if (!prepared.success)
    return prepared
  return prepared.data
}
```

初回送信には最大 1,000 件のブラウザー証拠を含めます。予算内の残りの証拠は受付後に送信します。サーバー環境と追加収集のために件数と容量を確保するので、最小の予算でも報告を受け付けられます。環境証拠が確保した容量を超える場合は `data.truncated: true` を記録します。アプリ ID は報告に残ります。

オンライン再生では、隔離された文書内でスナップショットと差分イベントを復元します。アプリや外部のネットワークリソースは取得しません。報告を切り替えると証拠とプレビューを消去し、遅れて届いた応答は該当する報告にだけ反映します。

[引数と手順の詳細](feedback.md#browser-capture)

annotation は画像上の選択領域、attachmentId は同じ下書きから取得します。submit 前に呼び、成功後は getView を更新します。

```ts
import type { FeedbackBrowserClient } from '@h-ai/feedback/client'

async function redactImage(client: FeedbackBrowserClient, attachmentId: string,
  annotation: Parameters<FeedbackBrowserClient['annotate']>[1]) {
  // 選択した添付 ID に指定の編集を適用する。成功時にデータはなく、凍結や競合なら元の添付を保持して失敗する。
  const changed = await client.annotate(attachmentId, annotation)
  if (!changed.success)
    return changed
  // 引数なしで編集後の画面用データを読み、更新済み添付とプレビューを得る。
  return client.getView() // refreshed preview and attachment state
}
```
